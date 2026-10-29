import { useState } from 'react';
import { CornerDownLeft, Flag, Plus, RotateCcw, X } from 'lucide-react';
import { participantGroups, uid, type ParticipantView, type Race, type Session } from './domain';
import { Portrait, RaceMark } from './components';
import { searchRoster, TIERS, type RosterPlayer } from './roster';

type Commit = (update: (s: Session) => Session, label?: string, history?: boolean) => void;
const VIEW_KEY = 'plset.participantView';
function loadView(): ParticipantView { try { return localStorage.getItem(VIEW_KEY) === 'team' ? 'team' : 'race'; } catch { return 'race'; } }
function saveView(view: ParticipantView) { try { localStorage.setItem(VIEW_KEY, view); } catch { /* private mode */ } }
const normalize = (s: string) => s.toLowerCase().replace(/[\s\-_]/g, '');

export default function ParticipantRoster({ s, commit, onLibrary, notify }: {
  s: Session; commit: Commit; onLibrary: () => void; notify: (text: string) => void;
}) {
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const [message, setMessage] = useState('');
  const [view, setViewState] = useState<ParticipantView>(loadView);
  const setView = (next: ParticipantView) => { setViewState(next); saveView(next); };
  const tokens = text.trim().split(/[\s,;/]+/).filter(Boolean);
  const suggestions = tokens.length === 1 ? searchRoster(tokens[0]).slice(0, 6) : [];

  function add(matches: RosterPlayer[]) {
    const unique = [...new Map(matches.map(p => [p.id, p])).values()];
    const missing = unique.filter(r => !s.players.some(p => p.rosterId === r.id || (!p.rosterId && p.name === r.name)));
    if (s.players.length + missing.length > 60) { setMessage('참가자는 최대 60명까지 등록할 수 있습니다.'); return; }
    commit(previous => {
      const next = [...previous.players];
      for (const r of unique) {
        const index = next.findIndex(p => p.rosterId === r.id || (!p.rosterId && p.name === r.name));
        if (index >= 0) next[index] = { ...next[index], active: true, rosterId: r.id, race: r.race };
        else next.push({ id: uid(), rosterId: r.id, name: r.name, race: r.race, active: true, amount: 0, team: null });
      }
      return { ...previous, players: next };
    }, `참가자 반영 · ${unique.map(p => p.name).join(', ')}`);
    setText(''); setMessage(''); notify(unique.length === 1 ? `${unique[0].name} 추가됨` : `선수 ${unique.length}명 추가됨`);
  }

  function resolve() {
    if (!tokens.length) return;
    const matches: RosterPlayer[] = [];
    for (const token of tokens) {
      const results = searchRoster(token);
      const exact = results.filter(p => [p.name, ...p.aliases].some(name => normalize(name) === normalize(token)));
      const choices = exact.length ? exact : results;
      if (choices.length !== 1) {
        setMessage(choices.length ? (tokens.length === 1 ? `‘${token}’ 검색 결과가 여러 명입니다. 검색 목록에서 선수를 선택하세요.` : `‘${token}’를 따로 입력해 사진으로 선수를 선택하세요.`) : `‘${token}’ 선수를 찾지 못했습니다.`);
        return;
      }
      matches.push(choices[0]);
    }
    add(matches);
  }

  return <section className="panel roster-entry-panel">
    <div className="roster-entry-header">
      <h2>참가자 <span>{s.players.filter(p => p.active).length} / {s.teamSize * 2}명</span></h2>
      <div className="segmented participant-view-toggle" role="group" aria-label="참가자 보기 기준">
        <button className={view === 'race' ? 'selected' : ''} aria-pressed={view === 'race'} onClick={() => setView('race')}>종족별</button>
        <button className={view === 'team' ? 'selected' : ''} aria-pressed={view === 'team'} onClick={() => setView('team')}>팀별</button>
      </div>
      <div className="participant-entry-actions">
        <div className="race-entry-search">
          <input aria-label="선수 이름 입력" placeholder="선수이름을 넣어주세요 ex)홍구,현제 등" value={text} autoComplete="off" maxLength={500}
            onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
            onChange={e => { setText(e.target.value); setMessage(''); }}
            onPaste={e => { const pasted = e.clipboardData.getData('text'); if (/[\r\n]/.test(pasted)) { e.preventDefault(); const input=e.currentTarget; setText((text.slice(0,input.selectionStart ?? text.length)+pasted.replace(/[\r\n]+/g,' ')+text.slice(input.selectionEnd ?? text.length)).slice(0,500)); setMessage(''); } }}
            onKeyDown={e => { if (e.nativeEvent.isComposing) return; if (e.key === 'Enter') { e.preventDefault(); resolve(); } if (e.key === 'Escape') { setText(''); setMessage(''); } }}/>
          <button aria-label="선수 추가" title="Enter로도 추가할 수 있습니다" disabled={!tokens.length} onClick={resolve}><CornerDownLeft size={15}/></button>
          {focused && suggestions.length ? <div className="race-entry-suggestions" role="listbox" aria-label="선수 검색 결과">
            {suggestions.map(p => <button role="option" aria-selected={false} key={p.id} onMouseDown={e => e.preventDefault()} onClick={() => add([p])}>
              <Portrait player={{ name: p.name, rosterId: p.id, race: p.race }} small/><RaceMark race={p.race}/><strong>{p.name}</strong><small>{TIERS.find(t => t.id === p.tier)?.label}</small><Plus size={13}/>
            </button>)}
          </div> : null}
        </div>
        <button className="participant-library-button" onClick={onLibrary}><Plus size={13}/> 선수 목록</button>
        <button className="participant-reset-button" disabled={!s.players.length} onClick={()=>{
          commit(v=>({...v,players:[]}), '참가자 초기화');
          setText(''); setMessage(''); setFocused(false);
          notify('참가자 초기화됨');
        }}><RotateCcw size={14}/> 참가자 초기화</button>
      </div>
    </div>
    {message ? <div className="participant-entry-error" role="alert">{message}</div> : null}
    <div className="participant-overview-body"><div className={`roster-entry-grid${view === 'team' ? ' team-view' : ''}`}>{participantGroups(s, view).map(g => (
      <section className={`race-entry race-entry-${g.key}`} aria-label={`${g.label} 참가자`} key={g.key}>
        <div className="race-entry-heading">
          {view === 'race' ? <RaceMark race={g.key as Race}/> : <span className="race team-mark" aria-hidden="true">{g.key}</span>}
          <h3>{g.label}</h3>
          <span>{g.capacity ? `${g.players.length} / ${g.capacity}` : `${g.players.length}명`}</span>
        </div>
        <div className="race-entry-players">{g.players.map(p => <div className="race-entry-player" key={p.id}>
          <Portrait player={p} small/><strong>{p.name}</strong>
          <button aria-label={`${p.name} 참가 제외`} onClick={() => commit(v => ({ ...v, players: v.players.map(x => x.id === p.id ? { ...x, active: false, team: null } : x) }), `${p.name} 참가 제외`)}><X size={12}/></button>
        </div>)}</div>
      </section>
    ))}</div>
      <section className="notes-panel participant-notes" aria-label="오늘의 진행">
        <div><Flag size={17}/><h3>오늘의 진행</h3><span>방식과 합의 사항을 자유롭게 적어두세요</span></div>
        <textarea aria-label="진행 메모" maxLength={5000} value={s.notes} onChange={e=>commit(v=>({...v,notes:e.target.value}),undefined,false)}/>
      </section>
    </div>
  </section>;
}
