import { useEffect, useState } from 'react';
import { ArrowUpRight, Check, Copy, Minus, Plus, Play, Shuffle, SlidersHorizontal, Tag, X } from 'lucide-react';
import { givenName, randomSeed, setTeam, withTeamNames, type DrawItem, type DrawRun, type Player, type Session, type Team } from './domain';
import { Portrait } from './components';
import { RACE_TRACKS, RACE_THEMES } from './race';
import DrawStage from './DrawStage';
import RaceSourceSelect, { type RaceSource as Source } from './RaceSourceSelect';
type Commit = (update: (s: Session) => Session, label?: string, history?: boolean) => void;
export const RACE_MAX = 30;

export default function RacePage({ s, commit, notify, onFinish, visible }: { s: Session; commit: Commit; notify: (text: string) => void; onFinish: (ids: string[]) => void; visible: boolean }) {
  const previous = s.draw?.mode === 'race' ? s.draw : null;
  const [source, setSource] = useState<Source>((previous?.source as Source) ?? 'players');
  const [track, setTrack] = useState(previous?.map ?? 0);
  const [customNames, setCustomNames] = useState<string[]>(() => previous?.source === 'custom' ? [...new Set(previous.items.map(i => i.label))] : []);
  const [quantities,setQuantities]=useState<Record<string,number>>(()=>previous?.counts??{});
  const [editingTeam,setEditingTeam]=useState(false);
  const [customDraft, setCustomDraft] = useState('');
  const [setupEdited, setSetupEdited] = useState(false), [previewSeed, setPreviewSeed] = useState(randomSeed);
  const [showNames, setShowNames] = useState(true), [settingsOpen, setSettingsOpen] = useState(true);
  const running = !!s.draw && !s.draw.finishedAt;
  useEffect(() => { setSettingsOpen(!running); }, [running]);
  const displayedRun = s.draw?.mode === 'race' && (!setupEdited || !s.draw.finishedAt) ? s.draw : null;
  const players = s.players.filter(p => p.active && (source === 'players' || p.team === source));
  const teamSource=source==='A'||source==='B';
  const items: DrawItem[] = source === 'custom' ? customNames.map((label, i) => ({ id: `custom-${i}`, label })) : players.flatMap(p => Array.from({length:quantities[p.id]??1},(_,i)=>({ id: i===0?p.id:`${p.id}:ball:${i+1}`, label: p.name, playerId: p.id })));
  const setQuantity=(id:string,value:number)=>{if(running)return;setSetupEdited(true);setQuantities(v=>({...v,[id]:Math.max(0,Math.min(5,Math.round(Number.isFinite(value)?value:0)))}));};
  const pickTeamPlayer=(p:Player)=>{
    if(running||!teamSource)return;
    if(p.team!==source&&players.length>=s.teamSize){notify(`${source}팀은 ${s.teamSize}명까지 선택할 수 있습니다.`);return;}
    setEditingTeam(true);setSetupEdited(true);commit(v=>withTeamNames({...v,players:setTeam(v.players,p.id,p.team===source?null:source)}),`${p.name} ${source}팀 ${p.team===source?'제외':'선택'}`);
  };
  const addCustomItem = () => { const label = customDraft.trim(); if (!label) return; if (customNames.includes(label)) { notify('이미 추가한 항목입니다.'); return; } if (customNames.length >= RACE_MAX) { notify(`레이스는 ${RACE_MAX}명까지입니다.`); return; } setSetupEdited(true); setCustomNames(names => [...names, label]); setCustomDraft(''); };
  const start = () => {
    if (running) return;
    if (items.length < 2) { notify('레이스는 2명 이상 필요합니다.'); return; }
    if (items.length > RACE_MAX) { notify(`레이스는 ${RACE_MAX}명까지입니다. 팀이나 직접 입력으로 줄여주세요.`); return; }
    const draw: DrawRun = { mode: 'race', source, counts:source==='custom'?undefined:Object.fromEntries(s.players.filter(p=>p.active).map(p=>[p.id,quantities[p.id]??1])),map: track, winner: 'first', seed: previewSeed, startedAt: Date.now() + 3000, rank: 1, items, results: [], finishedAt: null };
    setSetupEdited(false); commit(v => ({ ...v, draw, scene: 'draw' }), `레이스 시작 · ${items.length}명`); setPreviewSeed(randomSeed());
  };
  const winner = displayedRun?.finishedAt ? displayedRun.items.find(i => i.id === displayedRun.results[0]) : undefined, winnerPlayerId = winner?.playerId ?? winner?.id;
  const copyResults=async()=>{if(!displayedRun?.finishedAt)return;const text=displayedRun.results.map((id,i)=>`${i+1}위 ${displayedRun.items.find(p=>p.id===id)?.label??''}`).join('\n');try{if(window.plset){if(!await window.plset.copyText(text))throw new Error('copy failed');}else await navigator.clipboard.writeText(text);notify('레이스 순위를 복사했습니다.');}catch{notify('복사하지 못했습니다. 다시 시도해주세요.');}};
  return <div className="draw-layout pinball-layout race-layout"><section className="panel stage-panel">
    {visible || displayedRun ? <DrawStage mode="race" run={displayedRun} items={items} map={track} previewSeed={previewSeed} showNames={showNames} showPortraits={false} onFinish={onFinish}/> : null}
    {settingsOpen ? <section className="pinball-settings" aria-label="레이스 설정" data-running={running && !!displayedRun}>
      <div className="race-theme-picker" role="group" aria-label="레이스 테마">{RACE_THEMES.map((theme,i)=><button key={i} type="button" disabled={running} aria-pressed={track===i} onClick={()=>{setSetupEdited(true);setTrack(i);}}><span className="race-theme-number">{String(i+1).padStart(2,'0')}</span><strong>{RACE_TRACKS[i]}</strong><small>{theme.subtitle}</small></button>)}</div>
      <RaceSourceSelect disabled={running} value={source} onChange={value => { setSetupEdited(true); setSource(value); setEditingTeam(false); }}/>
      <div className="field-label draw-ball-count-field">출전<div className="draw-order-readout">{new Set(items.map(i=>i.playerId??i.id)).size}명 · 구슬 {items.length}/{RACE_MAX}개</div></div>
      <div className="pinball-view-row" role="group" aria-label="보기 설정">
        <button type="button" aria-pressed={showNames} onClick={() => setShowNames(v => !v)}><Tag size={14}/> 이름표 {showNames ? 'ON' : 'OFF'}</button>
        <button type="button" disabled={running} onClick={() => { setSetupEdited(true); setPreviewSeed(randomSeed()); }}><Shuffle size={14}/> 출발 순서 섞기</button>
      </div>
      {source === 'custom' ? <div className="draw-custom-items">
        <label className="field-label">참가자<input aria-label="참가자 입력" placeholder="이름 입력 후 Enter" disabled={running} maxLength={80} value={customDraft} onChange={e => setCustomDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) { e.preventDefault(); addCustomItem(); } }}/></label>
        <div className="draw-custom-badges" aria-label="참가자 목록">{customNames.map(label => <span className="draw-custom-badge" key={label}><span>{label}</span><button type="button" aria-label={`${label} 삭제`} disabled={running} onClick={() => { setSetupEdited(true); setCustomNames(names => names.filter(n => n !== label)); }}><X size={14}/></button></span>)}</div>
      </div> : <div className="race-entrants draw-quantity-panel">
        <div className="quantity-panel-heading"><strong>{teamSource?`${source}팀`:'참가 선수'}</strong><span>0개는 제외 · 선수당 최대 5개</span><div className="race-entrant-actions">
          <button type="button" disabled={running} onClick={()=>{setSetupEdited(true);setQuantities(v=>({...v,...Object.fromEntries(players.map(p=>[p.id,1]))}));}}>전체 1개</button>
          <button type="button" disabled={running} onClick={()=>{setSetupEdited(true);setQuantities(v=>({...v,...Object.fromEntries(players.map(p=>[p.id,0]))}));}}>전체 제외</button>
          {teamSource?<button type="button" disabled={running} onClick={()=>setEditingTeam(v=>!v)}>{editingTeam?'선택 완료':'선수 선택'}</button>:null}
        </div></div>
        {teamSource&&(editingTeam||!players.length)?<div className="draw-team-picker" aria-label={`${source}팀 선수 선택`}>{s.players.filter(p=>p.active).map(p=><button key={p.id} type="button" disabled={running} aria-pressed={p.team===source} onClick={()=>pickTeamPlayer(p)}><Portrait player={p} small/><span>{p.name}</span>{p.team?<small>{p.team}팀</small>:null}</button>)}</div>:null}
        <div className="quantity-cards" aria-label="레이스 선수별 구슬 수량">{players.map(p=>{const value=quantities[p.id]??1;return <div key={p.id} className={`quantity-card${value===0?' quantity-excluded':''}`}><Portrait player={p} small/><strong>{p.name}</strong><div className="quantity-control"><button type="button" aria-label={`${p.name} 수량 감소`} disabled={running||value===0} onClick={()=>setQuantity(p.id,value-1)}><Minus size={13}/></button><input type="number" aria-label={`${p.name} 수량`} min={0} max={5} step={1} disabled={running} value={value} onChange={e=>setQuantity(p.id,e.currentTarget.valueAsNumber)}/><button type="button" aria-label={`${p.name} 수량 증가`} disabled={running||value===5} onClick={()=>setQuantity(p.id,value+1)}><Plus size={13}/></button></div></div>;})}</div>
        {!players.length?<p className="race-entrant-hint">{teamSource?'위에서 출전할 팀 선수를 선택해주세요.':'대시보드에서 참가 선수를 추가해주세요.'}</p>:null}
        {items.length<2||items.length>RACE_MAX?<p className="race-entrant-hint">구슬을 2~{RACE_MAX}개로 설정해주세요. 현재 {items.length}개입니다.</p>:null}
      </div>}
      <button type="button" className="button primary" onClick={start} disabled={running || items.length < 2 || items.length>RACE_MAX}><Play size={16} fill="currentColor"/>{running ? '레이스 진행 중' : displayedRun?.finishedAt?'다시 경주':'레이스 시작'}</button>
      {running && displayedRun ? <button type="button" className="button" onClick={() => commit(v => ({ ...v, draw: null }), '진행 중 레이스 취소')}><X size={14}/> 레이스 취소</button> : null}
      <button type="button" className="pinball-settings-close" aria-label="설정 접기" onClick={() => setSettingsOpen(false)}><X size={14}/></button>
    </section> : <button type="button" className="pinball-settings-toggle" onClick={() => setSettingsOpen(true)}><SlidersHorizontal size={14}/> 설정</button>}
    <div className="draw-result">{winner ? <>
      <span className="result-label">첫번째 완주</span><strong>{givenName(winner.label)}</strong><Check size={19}/>
      <button type="button" className="button" onClick={()=>void copyResults()}><Copy size={13}/> 결과 복사</button>
      {s.players.some(p => p.id === winnerPlayerId) ? <div className="result-assign">{(['A', 'B'] as Team[]).map(team => <button key={team} onClick={() => { if (s.players.filter(p => p.active && p.team === team).length >= s.teamSize) { notify(`${team}팀 정원이 가득 찼습니다.`); return; } commit(v => ({ ...v, players: v.players.map(p => p.id === winnerPlayerId ? { ...p, team } : p) }), `레이스 결과 ${winner.label} → ${team}팀`); notify(`${winner.label} 선수를 ${team}팀에 배정했습니다.`); }}>{team}팀 배정 <ArrowUpRight size={13}/></button>)}</div> : null}
    </> : null}</div>
  </section></div>;
}
