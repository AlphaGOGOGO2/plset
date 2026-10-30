export type Race = 'T' | 'P' | 'Z';
export type Team = 'A' | 'B';
export type Scene = 'board' | 'teams' | 'draw' | 'timer';
export interface Player { id: string; name: string; race: Race; amount: number; team: Team | null; active: boolean; rosterId?: string; amountAt?: number; teamAt?: number; note?: string }
// amountAt/teamAt record when a value last changed so ties and team slots keep the order the host entered them in.
export function setAmount(players: Player[], id: string, amount: number, now = Date.now()) { return players.map(p=>p.id===id ? { ...p, amount, amountAt: now } : p); }
export function setNote(players: Player[], id: string, note: string) { return players.map(p=>p.id===id ? { ...p, note: note || undefined } : p); }
export function setTeam(players: Player[], id: string, team: Team | null, now = Date.now()) { return players.map(p=>p.id===id ? { ...p, team, teamAt: now } : p); }
export function rankByFunding(players: Player[]) { return [...players].sort((a,b)=>b.amount-a.amount || (a.amountAt??0)-(b.amountAt??0)); }
// Ties are ordered by amountAt, so swapping a player with the tied neighbour above/below means re-stamping the whole tie group in the new order.
export function swapTie(players: Player[], id: string, direction: 'up' | 'down') {
  const ranked = rankByFunding(players.filter(p => p.active)), i = ranked.findIndex(p => p.id === id), j = direction === 'up' ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= ranked.length || ranked[j].amount !== ranked[i].amount) return players;
  const amount = ranked[i].amount, group = ranked.filter(p => p.amount === amount), base = Math.min(...group.map(p => p.amountAt ?? 0));
  const order = group.map(p => p.id), a = order.indexOf(ranked[i].id), b = order.indexOf(ranked[j].id); [order[a], order[b]] = [order[b], order[a]];
  return players.map(p => order.includes(p.id) ? { ...p, amountAt: base + order.indexOf(p.id) } : p);
}
export function teamMembers(players: Player[], team: Team) { return players.filter(p=>p.active && p.team===team).sort((a,b)=>(a.teamAt??0)-(b.teamAt??0)); }
export type ParticipantView = 'race' | 'team';
export interface ParticipantGroup { key: Race | Team; label: string; players: Player[]; capacity?: number }
const RACE_LABELS: Record<Race,string> = { T: '테란', Z: '저그', P: '프로토스' };
// Dashboard participant panel: the same players grouped by race, or by the A/B assignment made in the match builder.
export function participantGroups(s: Session, view: ParticipantView): ParticipantGroup[] {
  const active = s.players.filter(p => p.active);
  if (view === 'race') return (['T','Z','P'] as Race[]).map(race => ({ key: race, label: RACE_LABELS[race], players: active.filter(p => p.race === race) }));
  return (['A','B'] as Team[]).map(team => ({ key: team, label: s.teams[team], players: teamMembers(s.players, team), capacity: s.teamSize }));
}
// Korean full names drop the surname (임홍규 → 홍규, 남궁민수 → 민수); short or non-Hangul names are kept whole.
export function givenName(name: string) { const n=name.trim(); return /^[가-힣]{3,4}$/.test(n) ? n.slice(-2) : n; }
export const defaultTeamName = (team: Team) => `TEAM ${team}`;
// Plain-text recap saved from the header: participants, funding, teams, patrons and notes.
const pad2 = (n: number) => String(n).padStart(2, '0');
export function reportFileName(now = new Date()) { return `${pad2(now.getMonth() + 1)}${pad2(now.getDate())}PL.txt`; }
export function sessionReport(s: Session, now = new Date()): string {
  const active = s.players.filter(p => p.active), ranked = rankByFunding(active), f = funding(s.players, s.teamSize), pf = patronFunding(s.patrons, s.teamSize);
  const raceName: Record<Race, string> = { T: '테란', Z: '저그', P: '프로토스' };
  const lines: string[] = [`PL SET 진행 기록 · ${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`, `${s.title} · ${s.teamSize} vs ${s.teamSize}`, ''];
  lines.push(`[참가자] ${active.length}명`);
  for (const race of ['T', 'Z', 'P'] as Race[]) { const names = active.filter(p => p.race === race).map(p => p.name); lines.push(`${race} ${raceName[race]} ${names.length}명: ${names.join(', ') || '-'}`); }
  lines.push('', `[펀딩 현황] 두당 ${number(f.per)}개 · 토탈 ${number(f.total)}개${f.remainder ? ` · 잔여 ${number(f.remainder)}개` : ''}`);
  ranked.forEach((p, i) => {
    const tags = [i === 0 && p.amount > 0 ? '1위' : '', p.note ?? (i === ranked.length - 1 && ranked.length > 1 ? '룸따개' : '')].filter(Boolean);
    lines.push(`${pad2(i + 1)}. ${p.name} (${p.race}) · 두당 ${number(Math.floor(p.amount / s.teamSize))}개 · 토탈 ${number(p.amount)}개${tags.length ? ` · ${tags.join(' · ')}` : ''}`);
  });
  if (!ranked.length) lines.push('-');
  else lines.push(spectatorText(active));
  lines.push('', `[팀 편성] ${s.teams.A} vs ${s.teams.B}`);
  for (const team of ['A', 'B'] as Team[]) { const members = teamMembers(s.players, team); lines.push(`${team} ${s.teams[team]} ${members.length}/${s.teamSize}: ${members.map(p => p.name).join(', ') || '-'}`); }
  const unassigned = active.filter(p => !p.team); if (unassigned.length) lines.push(`미배정: ${unassigned.map(p => p.name).join(', ')}`);
  lines.push('', `[귀인 펀딩] ${s.patrons.length}건 · 토탈 ${number(pf.total)}개 · 두당 ${number(pf.per)}개${pf.remainder ? ` · 잔여 ${number(pf.remainder)}개` : ''}`);
  [...s.patrons].sort((a, b) => b.amount - a.amount).forEach((p, i) => lines.push(`${pad2(i + 1)}. ${p.nickname} · ${number(p.amount)}개${p.note ? ` · ${p.note}` : ''}`));
  if (!s.patrons.length) lines.push('-');
  if (s.notes.trim()) lines.push('', '[오늘의 진행]', s.notes.trim());
  return lines.join('\r\n') + '\r\n';
}
// Spectator slots go to the top funders; the host pastes this line into chat.
export function spectatorText(players: Player[], count = 6) { return `관전 : ${rankByFunding(players.filter(p=>p.active)).slice(0,count).map(p=>givenName(p.name)).join('-')}`; }
// Team names follow the first assigned player unless the host typed a custom name.
export function withTeamNames(s: Session): Session {
  const autoNames = new Set(s.players.map(p=>`${givenName(p.name)}팀`));
  const teams = { ...s.teams };
  for (const team of ['A','B'] as Team[]) {
    const first = teamMembers(s.players, team)[0];
    const auto = first ? `${givenName(first.name)}팀` : defaultTeamName(team);
    if (teams[team]===defaultTeamName(team) || autoNames.has(teams[team])) teams[team] = auto;
  }
  return { ...s, teams };
}
export interface Patron { id: string; nickname: string; amount: number; note: string }
export interface DrawItem { id: string; label: string; playerId?: string }
export const MATCH_MAPS: DrawItem[] = ['컬러리스페이트','오디세이','녹아웃','아이올로스','백룸','옥타곤','애티튜드'].map((label,i)=>({id:`match-map-${i+1}`,label}));
export interface DrawRun { mapFormat?: 'proleague'|'winners'; mapOpening?: string[]; winner?: 'first'|'last'; counts?: Record<string,number>; aceCount?: number; source?: 'players'|'unassigned'|'custom'|'A'|'B'; variant?: 'players'|'ace'|'maps'; map?: number; mode: 'pinball' | 'wheel' | 'race'; seed: number; startedAt: number; rank: number; items: DrawItem[]; results: string[]; finishedAt: number | null }
export function mapSchedule(run: DrawRun): string[] { return [...(run.mapOpening??[]),...run.results]; }
// The match-map pool is editable per session; legacy files fall back to the seven stock maps.
export const MAX_MAPS = 30;
export const sessionMaps = (s: Session): DrawItem[] => s.maps ?? MATCH_MAPS;
export function addMap(s: Session, name: string): Session {
  const label = name.trim(), maps = sessionMaps(s);
  if (!label) throw new Error('맵 이름을 입력해주세요.');
  if (label.length > 30) throw new Error('맵 이름은 30자까지 입력할 수 있습니다.');
  if (maps.length >= MAX_MAPS) throw new Error(`맵은 최대 ${MAX_MAPS}개까지 등록할 수 있습니다.`);
  if (maps.some(m => m.label === label)) throw new Error('이미 등록된 맵입니다.');
  return { ...s, maps: [...maps, { id: `map-${uid()}`, label }] };
}
export function removeMap(s: Session, id: string): Session {
  const maps = sessionMaps(s);
  if (!maps.some(m => m.id === id)) return s;
  return { ...s, maps: maps.filter(m => m.id !== id) };
}
export function validateMapDraw(d: DrawRun) {
  if(d.mapFormat!==undefined&&!['proleague','winners'].includes(d.mapFormat))throw new Error('맵 추첨 형식을 확인해주세요.');
  if(d.variant!=='maps'){if(d.mapFormat!==undefined||d.mapOpening!==undefined)throw new Error('맵 추첨 데이터를 확인해주세요.');return;}
  const n=d.items.length,ids=new Set(d.items.map(i=>i.id));
  if(d.mode!=='pinball'||n<2||n>MAX_MAPS||ids.size!==n)throw new Error('경기 맵 목록을 확인해주세요.');
  if(d.mapOpening!==undefined&&(d.mapFormat!=='winners'||!Array.isArray(d.mapOpening)||d.mapOpening.length!==n||new Set(d.mapOpening).size!==n||d.mapOpening.some(id=>!ids.has(id))))throw new Error(`1~${n}경기 맵을 확인해주세요.`);
  const count=d.mapOpening?2:n;
  if(d.rank!==count||d.results.length>count||(d.finishedAt!==null&&d.results.length!==count))throw new Error('경기 맵 결과를 확인해주세요.');
}
export interface Session {
  version: 1; title: string; teamSize: number; players: Player[]; teams: Record<Team,string>; maps?: DrawItem[];
  notes: string; score: Record<Team,number>; scene: Scene;
  timer: { label: string; remaining: number; deadline: number | null };
  patrons: Patron[];
  draw: DrawRun | null;
  logs: { id: string; at: number; text: string }[];
}
export const uid = () => crypto.randomUUID();
export const number = (n: number) => n.toLocaleString('ko-KR');
export const safeAmount = (value: number) => Math.max(0, Math.min(100_000_000, Math.round(Number.isFinite(value) ? value : 0)));
export function funding(players: Player[], size: number) {
  const total = players.filter(p => p.active).reduce((sum,p) => sum + p.amount, 0);
  return { total, per: Math.floor(total / size), remainder: total % size };
}
// Post-match settlement in per-head (두당) units, the way the board's 두당 view shows funding: amount ÷ team size. Seen from one
// winning player's wallet (`baseId`, default the most 두당), `diff` is negative when that player sends the gap to a teammate with
// less 두당 (3300 vs 2800 → -500) and positive when they receive it from one with more. Ranking ties keep entry order (rankByFunding).
export function settlement(players: Player[], winner: Team, size: number, baseId?: string) {
  const { total, per, remainder } = funding(players, size);
  const ranked = rankByFunding(teamMembers(players, winner)).map(player => ({ player, per: Math.floor(player.amount / size) }));
  const base = ranked.find(w => w.player.id === baseId) ?? ranked[0];
  // `half` (반띵) splits the gap; balloons are whole, so odd gaps drop the half toward zero (-1301 → -650) and never show -0.
  return { total, per, remainder, base: base?.player, winners: ranked.map(w => { const diff = base ? w.per - base.per : 0; return { ...w, diff, half: Math.trunc(diff / 2) || 0 }; }) };
}
// Memo export from the base player's side: what they receive first, a divider, then what they send, largest first in each
// block, as "보내는 사람->받는 사람 차액(반띵)개".
export function settlementText(result: ReturnType<typeof settlement>) {
  const base = result.base; if (!base) return '';
  const others = result.winners.filter(w => w.player !== base && w.diff !== 0), line = (from: string, to: string, w: typeof others[number]) => `${from}->${to} ${number(Math.abs(w.diff))}(${number(Math.abs(w.half))})개`;
  const incoming = others.filter(w => w.diff > 0).sort((a, b) => b.diff - a.diff).map(w => line(w.player.name, base.name, w));
  const outgoing = others.filter(w => w.diff < 0).sort((a, b) => a.diff - b.diff).map(w => line(base.name, w.player.name, w));
  return [incoming.join('\n'), outgoing.join('\n')].filter(Boolean).join('\n----------\n') + '\n';
}
export function settlementFileName(baseName: string, now = new Date()) { return `${pad2(now.getFullYear() % 100)}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}프로리그 정산(${baseName}).txt`; }
export function patronFunding(patrons: Patron[], size: number) {
  const total=patrons.reduce((sum,patron)=>sum+patron.amount,0);
  return {total,per:Math.floor(total/size),remainder:total%size};
}
export function createSession(): Session {
  const names: [string,Race][] = [['임홍규','Z'],['김정우','Z'],['조일장','Z'],['김명운','Z'],['이재호','T'],['유영진','T'],['김지성','T'],['이영호','T'],['장윤철','P'],['송병구','P']];
  return { version: 1, title: '오늘의 메이저 프로리그', teamSize: 5, teams: { A: 'TEAM A', B: 'TEAM B' }, maps: MATCH_MAPS.map(m => ({ ...m })), players: names.map(([name,race])=>({ id: uid(), name, race, amount: 0, team: null, active: true })), score: { A: 0, B: 0 }, notes: '1세트 · 프로리그 7전 4선승\n2세트 · 위너스리그 9전 5선승\n슈퍼에결 · 진행 중 합의', scene: 'board', timer: { label: '펀딩 마감까지', remaining: 300000, deadline: null }, patrons: [], draw: null, logs: [] };
}
export function randomSeed() { return crypto.getRandomValues(new Uint32Array(1))[0]; }
export function seeded(seed: number) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function shuffle<T>(items: T[], seed: number): T[] {
  const copy = [...items], random = seeded(seed);
  for(let i=copy.length-1;i>0;i--) { const j=Math.floor(random()*(i+1)); [copy[i],copy[j]]=[copy[j],copy[i]]; }
  return copy;
}
export function allocateTeams(players: Player[], size: number, seed: number) {
  const active = players.filter(p=>p.active);
  if(active.length !== size*2) throw new Error(`${size}:${size} 팀 편성에는 참가자 ${size*2}명이 필요합니다.`);
  const shuffled = shuffle(active,seed);
  const assignments = new Map(shuffled.map((p,i)=>[p.id, i%2===0 ? 'A' as Team : 'B' as Team]));
  return players.map(p=>({ ...p, team: assignments.get(p.id) ?? null }));
}
export function clockRemaining(timer: Session['timer'], now = Date.now()) { return timer.deadline === null ? timer.remaining : Math.max(0,timer.deadline-now); }
export function clockText(ms: number) { const s=Math.max(0,Math.ceil(ms/1000)); return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`; }
export function validateSession(input: unknown): Session {
  const s = input as Session;
  if(!s || s.version!==1 || typeof s.title!=='string' || s.title.length>100 || !Number.isInteger(s.teamSize) || s.teamSize<1 || s.teamSize>30 || !Array.isArray(s.players) || s.players.length>60) throw new Error('올바른 PL SET 세션 파일이 아닙니다.');
  if(s.patrons===undefined)s.patrons=[];
  if(!Array.isArray(s.patrons)||s.patrons.length>500||s.patrons.some(p=>!p||typeof p.id!=='string'||!p.id||typeof p.nickname!=='string'||!p.nickname.trim()||p.nickname.length>60||!Number.isSafeInteger(p.amount)||p.amount<0||p.amount>100000000||typeof p.note!=='string'||p.note.length>200)||new Set(s.patrons.map(p=>p.id)).size!==s.patrons.length)throw new Error('귀인 펀딩 내역을 확인해주세요.');
  const ids=new Set<string>();
  for(const p of s.players) {
    if(!p || typeof p.id!=='string' || ids.has(p.id) || typeof p.name!=='string' || !p.name.trim() || p.name.length>30 || !['T','P','Z'].includes(p.race) || !['A','B',null].includes(p.team) || typeof p.active!=='boolean' || !Number.isSafeInteger(p.amount) || p.amount<0 || p.amount>100000000 || !(p.amountAt===undefined || Number.isFinite(p.amountAt)) || !(p.teamAt===undefined || Number.isFinite(p.teamAt)) || !(p.note===undefined || (typeof p.note==='string' && p.note.length<=200))) throw new Error('참가자 데이터를 확인해주세요.');
    ids.add(p.id);
  }
  if(typeof s.notes!=='string' || s.notes.length>5000 || !s.teams || !['A','B'].every(k=>typeof s.teams[k as Team]==='string' && s.teams[k as Team].length<=30) || !s.score || !['A','B'].every(k=>Number.isInteger(s.score[k as Team]) && s.score[k as Team]>=0 && s.score[k as Team]<=99) || !['board','teams','draw','timer'].includes(s.scene)) throw new Error('진행판 데이터를 확인해주세요.');
  if(!s.timer || !Number.isFinite(s.timer.remaining) || s.timer.remaining<0 || s.timer.remaining>86400000 || !(s.timer.deadline===null || Number.isFinite(s.timer.deadline)) || typeof s.timer.label!=='string' || s.timer.label.length>100 || !Array.isArray(s.logs) || s.logs.length>100 || s.logs.some(l=>!l || typeof l.id!=='string' || typeof l.text!=='string' || l.text.length>500 || !Number.isFinite(l.at))) throw new Error('타이머 또는 기록을 확인해주세요.');
  if(s.draw!==null) {
    const d=s.draw;
    if(d?.winner!==undefined && !['first','last'].includes(d.winner)) throw new Error('당첨자 설정을 확인해주세요.');
    if(d?.aceCount!==undefined && (!Number.isInteger(d.aceCount)||d.aceCount<1||d.aceCount>5)) throw new Error('ACE 수량을 확인해주세요.');
    if(d?.counts!==undefined && (!d.counts||typeof d.counts!=='object'||Array.isArray(d.counts)||Object.keys(d.counts).length>60||Object.values(d.counts).some(n=>!Number.isInteger(n)||n<0||n>5))) throw new Error('선수 구슬 수량을 확인해주세요.');
    if(d?.source!==undefined && !['players','unassigned','custom','A','B'].includes(d.source)) throw new Error('추첨 대상을 확인해주세요.');
    if(d?.variant!==undefined && !['players','ace','maps'].includes(d.variant)) throw new Error('추첨 모드를 확인해주세요.');
    if(d?.map!==undefined && (!Number.isInteger(d.map) || d.map<0 || d.map>(d.mode==='pinball'?14:9))) throw new Error('핀볼 코스를 확인해주세요.');
    if(!d || !['pinball','wheel','race'].includes(d.mode) || !Number.isInteger(d.seed) || !Number.isFinite(d.startedAt) || !(d.finishedAt===null || Number.isFinite(d.finishedAt)) || !Array.isArray(d.items) || d.items.length<(d.mode==='pinball'?1:2) || d.items.length>60 || (d.mode==='race'&&d.items.length>30) || d.items.some(i=>!i || typeof i.id!=='string' || typeof i.label!=='string' || i.label.length>80 || (i.playerId!==undefined&&typeof i.playerId!=='string')) || new Set(d.items.map(i=>i.id)).size!==d.items.length || !Number.isInteger(d.rank) || d.rank<1 || d.rank>d.items.length || !Array.isArray(d.results) || d.results.some(id=>!d.items.some(i=>i.id===id)) || new Set(d.results).size!==d.results.length) throw new Error('추첨 데이터를 확인해주세요.');
  }
  if(s.draw?.variant==='maps'){
    const oldNames=['컬러','오디','넉아','아이','백룸','옥타','에티'];
    s.draw.items=s.draw.items.map(item=>{const index=MATCH_MAPS.findIndex(map=>map.id===item.id);return index>=0&&item.label===oldNames[index]?{...item,label:MATCH_MAPS[index].label}:item;});
  }
  if(s.draw)validateMapDraw(s.draw);
  if(s.maps===undefined)s.maps=MATCH_MAPS.map(m=>({...m}));
  if(!Array.isArray(s.maps)||s.maps.length>MAX_MAPS||s.maps.some(m=>!m||typeof m.id!=='string'||!m.id||typeof m.label!=='string'||!m.label.trim()||m.label.length>30)||new Set(s.maps.map(m=>m.id)).size!==s.maps.length||new Set(s.maps.map(m=>m.label)).size!==s.maps.length)throw new Error('경기 맵 목록을 확인해주세요.');
  return s;
}
