import { funding, givenName, type Player, type Race, type Session, type Team } from './domain';
import { rosterForPlayer } from './roster';

// The broadcast scoreboard (미니맵 위 점수판) and entry board (엔트리표). The host types the entry; every streamer
// shows it from their own side by picking a 기준 선수, whose team is drawn on the left as "{이름}팀" against "상대팀".
export const SB_SETS = ['1', '2', 'ace'] as const;
export type SbSetId = typeof SB_SETS[number];
export const SB_SET_LABEL: Record<SbSetId, string> = { '1': '1SET', '2': '2SET', ace: 'SUPER ACE' };
/** How the host calls each set on the console's buttons. */
export const SB_SET_NAME: Record<SbSetId, string> = { '1': '1세트', '2': '2세트', ace: '슈퍼에결' };
export const SB_MAX_ROWS = 9;
/** Overlay designs; the host picks one for every streamer's overlay. */
export const SB_STYLES = ['glass', 'doodle', 'bnet', 'neon', 'studio', 'white', 'pixel'] as const;
export type SbStyle = typeof SB_STYLES[number];
export const isSbStyle = (v: unknown): v is SbStyle => SB_STYLES.includes(v as SbStyle);
export const SB_STYLE_LABEL: Record<SbStyle, string> = { glass: '기본', doodle: '낙서', bnet: '배틀넷', neon: '네온', studio: '중계 스튜디오', white: '화이트', pixel: '레트로 픽셀' };
// 1SET is a 7-game pro league (first to 4), 2SET a 9-game winners league (first to 5).
const DEFAULT_ROWS: Record<SbSetId, number> = { '1': 7, '2': 9, ace: 1 };
const DEFAULT_TITLES: Record<SbSetId, string> = { '1': '프로리그 7/4', '2': '위너스 9/5', ace: '에이스결정전' };
const MAX_TEXT = 20;

/** One game of a set. `a` plays for team A, `b` for team B. Empty strings are allowed: the map is often decided after the entry. */
export interface SbRow { a: string; map: string; b: string; winner: Team | null }
export interface Scoreboard {
  /** Each set's title ("프로리그 7/4"), shown on both overlays while that set is on air. */
  titles: Record<SbSetId, string>;
  /** The set shown on the overlays. */
  onAir: SbSetId;
  sets: Record<SbSetId, SbRow[]>;
  /** Sets won so far (the outer numbers on the scoreboard). */
  setScore: Record<Team, number>;
  // The design and which overlays are on are each streamer's own choice (their link carries them), not part of the
  // shared session. Sessions saved before that may still hold `show` / `style`; they are ignored.
}

export const emptyRow = (): SbRow => ({ a: '', map: '', b: '', winner: null });
export function createScoreboard(): Scoreboard {
  const rows = (n: number) => Array.from({ length: n }, emptyRow);
  return { titles: { ...DEFAULT_TITLES }, onAir: '1', sets: { '1': rows(DEFAULT_ROWS['1']), '2': rows(DEFAULT_ROWS['2']), ace: rows(DEFAULT_ROWS.ace) }, setScore: { A: 0, B: 0 } };
}
export const sessionScoreboard = (s: Session): Scoreboard => s.scoreboard ?? createScoreboard();

const text = (v: unknown) => typeof v === 'string' && v.length <= MAX_TEXT;
const score = (v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 99;
export function validScoreboard(x: unknown): x is Scoreboard {
  const b = x as Scoreboard;
  return !!b && typeof b === 'object' && !!b.titles && SB_SETS.every(id => typeof b.titles[id] === 'string' && b.titles[id].length <= 40) && SB_SETS.includes(b.onAir)
    && !!b.sets && SB_SETS.every(id => Array.isArray(b.sets[id]) && b.sets[id].length >= 1 && b.sets[id].length <= SB_MAX_ROWS
      && b.sets[id].every(r => !!r && text(r.a) && text(r.map) && text(r.b) && [null, 'A', 'B'].includes(r.winner)))
    && !!b.setScore && score(b.setScore.A) && score(b.setScore.B);
}

/** Games won inside a set (the inner numbers on the scoreboard). */
export const gameScore = (rows: SbRow[]): Record<Team, number> => ({ A: rows.filter(r => r.winner === 'A').length, B: rows.filter(r => r.winner === 'B').length });
/** The game being played: the first entered row without a winner, or the last entered row once all are decided. */
export function currentGame(rows: SbRow[]): number | null {
  const entered = rows.map((r, i) => (r.a.trim() || r.b.trim()) ? i : -1).filter(i => i >= 0);
  if (!entered.length) return null;
  return entered.find(i => !rows[i].winner) ?? entered[entered.length - 1];
}

/**
 * Matches a typed name to a session player, ignoring spaces: the full name ("임홍규"), the given name ("홍규"), or a
 * nickname registered for them in the roster ("홍구", "짭제"), as entries in chat often use nicknames.
 */
export function findPlayer(players: Player[], name: string): Player | null {
  const n = name.replace(/\s+/g, '').toLowerCase();
  if (!n) return null;
  const active = players.filter(p => p.active), plain = (s: string) => s.replace(/\s+/g, '').toLowerCase();
  return active.find(p => plain(p.name) === n) ?? active.find(p => givenName(p.name) === n)
    ?? active.find(p => rosterForPlayer(p)?.aliases.some(a => plain(a) === n)) ?? null;
}

type Side = { label: string; setScore: number; gameScore: number };
type Seat = { name: string; race: Race | null };
/** `rows` are the games that have an entry, each with its game number `no` (see scoreboardView). */
export type EntryBoardView = { set: SbSetId; setLabel: string; title: string; left: number; right: number; rows: (Line & { no: number })[] };
type Line = { left: Seat; map: string; right: Seat; winner: 'left' | 'right' | null; current: boolean };
export interface ScoreboardView {
  title: string; setLabel: string; style: SbStyle;
  /** 두당 for the winning team (funding total ÷ team size); 0 while nothing is funded. */
  prize: number;
  left: Side; right: Side;
  /** The two players of the current game, already in left/right order; null before any entry is typed. */
  now: { left: Seat; right: Seat } | null;
  rows: Line[];
  /**
   * The entry boards, left to right. 1SET on air: its board alone. 2SET: the finished 1SET board stays and 2SET is put
   * beside it. SUPER ACE, a single game: both boards stay, and the ace game is raised over the 2SET board as a card.
   */
  entries: EntryBoardView[];
  ace: Line | null;
}

/** The two teams left to right for a 기준 선수: their own team first, team A first without one. */
export function sideOrder(s: Session, base: string | null): [Team, Team] {
  return (base ? findPlayer(s.players, base)?.team : null) === 'B' ? ['B', 'A'] : ['A', 'B'];
}

/**
 * What one streamer's overlay shows. `base` is the 기준 선수's name: when that player is in team B the two sides swap,
 * so their own team is always on the left. Without a base (or when the name is not on a team) team A stays on the left.
 */
/** The sets whose entry board a streamer shows; each picks their own (both by default). */
export type BoardSet = '1' | '2';
export const BOARD_SETS: BoardSet[] = ['1', '2'];
/** "1" or "2" from a link's `sets` parameter; anything else means both. */
export const parseBoardSets = (v: string | null): BoardSet[] => v === '1' || v === '2' ? [v] : [...BOARD_SETS];

export function scoreboardView(s: Session, base: string | null, style: SbStyle = 'glass', sets: BoardSet[] = BOARD_SETS): ScoreboardView {
  const sb = sessionScoreboard(s), rows = sb.sets[sb.onAir];
  const basePlayer = base ? findPlayer(s.players, base) : null, baseTeam = basePlayer?.team ?? null;
  const [L, R] = sideOrder(s, base);
  const label = (t: Team) => baseTeam ? (t === baseTeam ? `${givenName(basePlayer!.name)}팀` : '상대팀') : s.teams[t];
  const games = gameScore(rows), now = currentGame(rows);
  const seat = (name: string): Seat => ({ name: name.trim(), race: findPlayer(s.players, name)?.race ?? null });
  const pick = (r: SbRow, t: Team) => seat(t === 'A' ? r.a : r.b);
  const side = (t: Team): Side => ({ label: label(t), setScore: sb.setScore[t], gameScore: games[t] });
  const line = (r: SbRow, current: boolean): Line => ({ left: pick(r, L), map: mapShort(r.map), right: pick(r, R), winner: r.winner === null ? null : r.winner === L ? 'left' : 'right', current });
  const lines = rows.map((r, i) => line(r, i === now));
  const board = (id: SbSetId): EntryBoardView => {
    const r = sb.sets[id], g = gameScore(r);
    // Every game with anything typed in is shown, the ones still to play included: a row with only its map drawn shows
    // the map between two blank names. Only fully empty rows are left out.
    const playing = id === sb.onAir;
    const shown = r.map((x, i) => ({ ...(playing ? lines[i] : line(x, false)), no: i + 1 }))
      .filter((x, i) => r[i].a.trim() || r[i].b.trim() || r[i].map.trim());
    return { set: id, setLabel: SB_SET_LABEL[id], title: sb.titles[id], left: g[L], right: g[R], rows: shown };
  };
  // Following the match (1SET alone, then 1SET and 2SET side by side), minus any set this streamer switched off.
  const boards = (sb.onAir === '1' ? ['1'] : ['1', '2'] as BoardSet[]).filter(id => sets.includes(id as BoardSet)) as SbSetId[];
  return {
    title: sb.titles[sb.onAir], setLabel: SB_SET_LABEL[sb.onAir], style,
    prize: funding(s.players, s.teamSize).per,
    left: side(L), right: side(R),
    now: now === null ? null : { left: pick(rows[now], L), right: pick(rows[now], R) },
    rows: lines,
    entries: boards.map(board),
    ace: sb.onAir === 'ace' ? lines[0] ?? line(emptyRow(), true) : null,
  };
}

/** Maps are always kept as their first two letters ("컬러리스 페이트" → "컬러"), as the map draw copies them. */
export const mapShort = (name: string) => [...name.replace(/\s+/g, '')].slice(0, 2).join('');

/**
 * Pasting several names into one cell of the entry table: they fill that column from the row pasted into downwards,
 * adding rows (up to the maximum) when they run past the end. A changed player clears that game's result.
 */
export function pasteDown(rows: SbRow[], from: number, key: 'a' | 'map' | 'b', values: string[]): SbRow[] {
  const vals = key === 'map' ? values.map(mapShort) : values;
  const n = Math.min(SB_MAX_ROWS, Math.max(rows.length, from + vals.length));
  return Array.from({ length: n }, (_, i) => {
    const old = rows[i] ?? emptyRow(), v = vals[i - from];
    if (i < from || v === undefined) return old;
    return { ...old, [key]: v, winner: key !== 'map' && v !== old[key] ? null : old.winner };
  });
}

/**
 * Splits pasted text into one entry per line (blank lines kept as empty slots, trailing blanks dropped). A single line
 * is split at its spaces instead, as entries are passed around in chat ("재호 현제 병구") and maps are copied from the
 * map draw ("녹아 컬러 오디").
 */
export function pasteLines(text: string, max = SB_MAX_ROWS): string[] {
  const rows = text.replace(/\r/g, '').split('\n'), filled = rows.filter(l => l.trim());
  const lines = (filled.length === 1 ? filled[0].trim().split(/\s+/) : rows).map(l => l.trim().slice(0, MAX_TEXT));
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  return lines.slice(0, max);
}
/**
 * Fills a set from three pasted columns (P1 / MAP / P2). A column left empty keeps what is there, so the maps can be
 * pasted after the entry. Rows grow to fit the longest column; a row's winner is kept only while its players are unchanged.
 */
export function fillRows(rows: SbRow[], a: string, map: string, b: string): SbRow[] {
  const [ca, cm, cb] = [pasteLines(a), pasteLines(map).map(mapShort), pasteLines(b)];
  const n = Math.max(rows.length, ca.length, cm.length, cb.length);
  return Array.from({ length: n }, (_, i) => {
    const old = rows[i] ?? emptyRow();
    const next = { a: ca.length ? ca[i] ?? '' : old.a, map: cm.length ? cm[i] ?? '' : old.map, b: cb.length ? cb[i] ?? '' : old.b };
    return { ...next, winner: next.a === old.a && next.b === old.b ? old.winner : null };
  });
}

/**
 * Where the 1920×1080 overlay stage goes in a box of w×h. StarCraft: Remastered always draws a 16:9 picture and centres it
 * with black bars on other screen shapes (16:10 above and below, 21:9 at the sides), so the stage does the same: the
 * largest 16:9 area that fits, centred. A capture of the whole monitor then lines up whatever its size or shape.
 */
export function fitStage(w: number, h: number, stageW = 1920, stageH = 1080) {
  if (!(w > 0 && h > 0)) return { k: 0, x: 0, y: 0 };
  const k = Math.min(w / stageW, h / stageH);
  return { k, x: (w - stageW * k) / 2, y: (h - stageH * k) / 2 };
}

/**
 * Finds the two team entries in text copied from the Battle.net chat, where each line looks like
 * "[2. ||||||] kimsabuho: 재호 현제 병구 일장 홍구". The channel tag and the speaker's id are dropped; a line counts as an
 * entry when most of its words are players of this session. The team comes from those players' team in 팀 편성, so ids
 * never need registering; before teams are set the first entry goes to A and the next to B. A later entry for the same
 * team replaces an earlier one (a corrected entry).
 */
export function chatEntries(text: string, players: Player[]): Partial<Record<Team, string[]>> {
  const found: { names: string[]; team: Team | null }[] = [];
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const line = raw.replace(/^\s*\[[^\]]*\]\s*/, '');
    const said = /^[^\s:：]+\s*[:：]\s*(.*)$/.exec(line);
    const names = (said ? said[1] : line).split(/[\s,/·.]+/).map(w => w.trim()).filter(Boolean).map(w => w.slice(0, MAX_TEXT));
    if (names.length < 2) continue;
    const known = names.map(n => findPlayer(players, n)).filter((p): p is Player => !!p);
    if (known.length < 2 || known.length < names.length * .6) continue;
    const a = known.filter(p => p.team === 'A').length, b = known.filter(p => p.team === 'B').length;
    found.push({ names, team: a > b ? 'A' : b > a ? 'B' : null });
  }
  const out: Partial<Record<Team, string[]>> = {};
  for (const f of found) if (f.team) out[f.team] = f.names;
  for (const f of found) if (!f.team) { const t: Team | null = !out.A ? 'A' : !out.B ? 'B' : null; if (t) out[t] = f.names; }
  return out;
}

/**
 * A 방싸개's edit as a patch: only the parts of the board that changed (whole titles / onAir / setScore, and the rows of
 * the sets that changed). The room and the host merge it into their own board, so the host's simultaneous edits to the
 * other parts survive. Without a previous board the patch is the whole board. Null when nothing changed.
 */
export type ScoreboardPatch = Partial<Pick<Scoreboard, 'titles' | 'onAir' | 'setScore'>> & { sets?: Partial<Record<SbSetId, SbRow[]>> };
export function scoreboardPatch(prev: Scoreboard | undefined, next: Scoreboard): ScoreboardPatch | null {
  if (!prev) return { titles: next.titles, onAir: next.onAir, setScore: next.setScore, sets: next.sets };
  const patch: ScoreboardPatch = {};
  if (prev.titles !== next.titles) patch.titles = next.titles;
  if (prev.onAir !== next.onAir) patch.onAir = next.onAir;
  if (prev.setScore !== next.setScore) patch.setScore = next.setScore;
  const sets = SB_SETS.filter(id => prev.sets[id] !== next.sets[id]);
  if (sets.length) patch.sets = Object.fromEntries(sets.map(id => [id, next.sets[id]]));
  return Object.keys(patch).length ? patch : null;
}
/** Later edits win field by field; sets merge per set. */
export const mergePatches = (a: ScoreboardPatch, b: ScoreboardPatch): ScoreboardPatch => ({ ...a, ...b, ...(a.sets || b.sets ? { sets: { ...a.sets, ...b.sets } } : {}) });
/** `board` with `patch` applied; null when the result is not a valid scoreboard. */
export function applyScoreboardPatch(board: Scoreboard | undefined, patch: unknown): Scoreboard | null {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return null;
  const p = patch as ScoreboardPatch, base = board ?? createScoreboard();
  const next = { ...base, ...('titles' in p ? { titles: p.titles } : {}), ...('onAir' in p ? { onAir: p.onAir } : {}), ...('setScore' in p ? { setScore: p.setScore } : {}), sets: { ...base.sets, ...p.sets } } as Scoreboard;
  return validScoreboard(next) ? next : null;
}
