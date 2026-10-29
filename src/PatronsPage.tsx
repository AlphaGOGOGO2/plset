import { useRef, useState, type KeyboardEvent } from 'react';
import { Flag, Plus, X } from 'lucide-react';
import { Portrait, RaceMark } from './components';
import { number, patronFunding, teamMembers, uid, type Patron, type Session, type Team } from './domain';
type Commit=(update:(s:Session)=>Session,label?:string,history?:boolean)=>void;
const blurOnEnter=(event:KeyboardEvent<HTMLInputElement>)=>{if(event.key==='Enter'&&!event.nativeEvent.isComposing&&event.keyCode!==229){event.preventDefault();event.currentTarget.blur();}};
type AmountDraft={unit:'total'|'per';raw:string};
function pairedAmounts(draft:AmountDraft,size:number){
 const {unit,raw}=draft;
 return {total:unit==='total'?raw:raw===''?'':String(Number(raw)*size),per:unit==='per'?raw:raw===''?'':String(Math.floor(Number(raw)/size))};
}
function PatronAmounts({amount,size,index,onChange,notify}:{amount:number;size:number;index:number;onChange:(total:number)=>void;notify:(text:string)=>void}){
 const [draft,setDraft]=useState<AmountDraft|null>(null);
 const values=draft?pairedAmounts(draft,size):{total:String(amount),per:String(Math.floor(amount/size))};
 const save=()=>{
  if(!draft)return;
  const total=Number(values.total),source=Number(draft.raw);
  if(!Number.isSafeInteger(source)||!Number.isSafeInteger(total)||total<0||total>100000000){notify('0 이상의 정수로 입력해주세요.');setDraft(null);return;}
  onChange(total);setDraft(null);
 };
 return <>{(['total','per'] as const).map(unit=><td key={unit} className={`patron-amount-cell patron-amount-${unit}`}><div className="patron-count-input"><input aria-label={`${index}번 귀인 ${unit==='total'?'TOTAL':'두당'}`} type="number" min={0} max={unit==='total'?100000000:Math.floor(100000000/size)} step={1} value={values[unit]} title={unit==='per'?`${size}명 기준${amount%size?` · 잔여 ${amount%size}개`:''}`:undefined} onChange={e=>setDraft({unit,raw:e.target.value})} onBlur={save} onKeyDown={blurOnEnter}/><span>개</span></div></td>)}</>;
}
export default function PatronsPage({s,commit,notify}:{s:Session;commit:Commit;notify:(text:string)=>void}){
 const [nickname,setNickname]=useState(''),[amountDraft,setAmountDraft]=useState<AmountDraft>({unit:'total',raw:''}),[note,setNote]=useState(''),[view,setView]=useState<'players'|'teams'>('players');
 const nameRef=useRef<HTMLInputElement>(null),entries=s.patrons,totals=patronFunding(entries,s.teamSize),amounts=pairedAmounts(amountDraft,s.teamSize),qty=Number(amounts.total);
 const players=s.players.filter(player=>player.active).sort((a,b)=>['T','Z','P'].indexOf(a.race)-['T','Z','P'].indexOf(b.race));
 const valid=!!nickname.trim()&&Number.isSafeInteger(Number(amountDraft.raw))&&Number.isSafeInteger(qty)&&qty>0&&qty<=100000000&&entries.length<500;
 const add=()=>{
  if(!valid)return;
  const entry:Patron={id:uid(),nickname:nickname.trim(),amount:qty,note:note.trim()};
  commit(value=>({...value,patrons:[entry,...value.patrons]}),`${entry.nickname} 귀인 펀딩 ${number(qty)}개`);
  setNickname('');setAmountDraft({unit:'total',raw:''});setNote('');nameRef.current?.focus();
 };
 const update=(id:string,patch:Partial<Pick<Patron,'nickname'|'amount'|'note'>>)=>{
  const current=entries.find(entry=>entry.id===id);if(!current||Object.entries(patch).every(([key,value])=>current[key as keyof Patron]===value))return;
  commit(value=>({...value,patrons:value.patrons.map(entry=>entry.id===id?{...entry,...patch}:entry)}),`${current.nickname} 귀인 펀딩 수정`);
 };
 return <section className="patrons-page" aria-label="귀인 펀딩 관리">
  <div className="patrons-heading"><h1>귀인</h1><span className="count-pill">{entries.length}</span></div>
  <div className="patron-overview">
   <section className="panel patron-match-roster" aria-label="오늘 경기">
    <div className="patron-roster-heading"><h2>{view==='players'?'오늘 경기 참가자':'팀별 현황'}</h2><span>{view==='players'?`${players.length}명`:`A ${teamMembers(s.players,'A').length}명 · B ${teamMembers(s.players,'B').length}명`}</span>
     <div className="segmented patron-view-toggle" role="group" aria-label="참가자 보기 전환">{([['players','참가자'],['teams','팀별 현황']] as const).map(([id,label])=><button key={id} type="button" className={view===id?'selected':''} aria-pressed={view===id} onClick={()=>setView(id)}>{label}</button>)}</div>
    </div>
    {view==='players'?<>
     <div className="patron-roster-list" style={{gridTemplateColumns:`repeat(${players.length<=5?Math.max(players.length,1):Math.ceil(players.length/2)},minmax(0,1fr))`}}>{players.map(player=><div className="patron-roster-card" key={player.id}><div className="patron-roster-portrait"><Portrait player={player} small/><RaceMark race={player.race}/></div><strong>{player.name}</strong></div>)}</div>
     {!players.length?<div className="patron-roster-empty">등록된 참가자가 없습니다.</div>:null}
    </>:<div className="patron-team-grid">{(['A','B'] as Team[]).map(team=>{const members=teamMembers(s.players,team);return <section className={`patron-team team-${team}`} key={team} aria-label={`${team}팀 현황`}>
     <div className="patron-team-head"><span className="team-letter">{team}</span><div><strong>{s.teams[team]}</strong><small>{members.length} / {s.teamSize}</small></div></div>
     <div className="patron-roster-list" style={{gridTemplateColumns:`repeat(${Math.max(s.teamSize,members.length)},minmax(0,1fr))`}}>{Array.from({length:Math.max(s.teamSize,members.length)},(_,i)=>{const player=members[i];return player?<div className="patron-roster-card" key={player.id}><span className="patron-slot-no">{String(i+1).padStart(2,'0')}</span><div className="patron-roster-portrait"><Portrait player={player} small/><RaceMark race={player.race}/></div><strong>{player.name}</strong></div>:<div className="patron-roster-card patron-slot-empty" key={i}><span className="patron-slot-no">{String(i+1).padStart(2,'0')}</span><span>대기</span></div>;})}</div>
    </section>;})}</div>}
   </section>
   <section className="panel notes-panel patron-notes" aria-label="오늘의 진행">
    <div><Flag size={17}/><h3>오늘의 진행</h3><span>진행 대시보드와 같은 메모입니다</span></div>
    <textarea aria-label="진행 메모" maxLength={5000} value={s.notes} onChange={e=>commit(v=>({...v,notes:e.target.value}),undefined,false)}/>
   </section>
  </div>
  <form className="panel patron-entry-form" onSubmit={event=>{event.preventDefault();add();}} onKeyDown={event=>{if(event.key==='Enter'&&(event.nativeEvent.isComposing||event.keyCode===229))event.preventDefault();}}>
   <label className="field-label">닉네임<input ref={nameRef} aria-label="귀인 닉네임" maxLength={60} autoComplete="off" value={nickname} onChange={e=>setNickname(e.target.value)}/></label>
   {(['total','per'] as const).map(unit=><label className="field-label" key={unit}>{unit==='total'?'TOTAL':'두당.'}<div className="patron-count-input"><input aria-label={`귀인 ${unit==='total'?'TOTAL':'두당'} 입력`} type="number" min={unit==='total'?1:0} max={unit==='total'?100000000:Math.floor(100000000/s.teamSize)} step={1} inputMode="numeric" value={amounts[unit]} onChange={e=>setAmountDraft({unit,raw:e.target.value})}/><span>개</span></div></label>)}
   <label className="field-label patron-note-field">비고<input aria-label="귀인 비고" maxLength={200} autoComplete="off" value={note} onChange={e=>setNote(e.target.value)}/></label>
   <button className="button primary" type="submit" disabled={!valid}><Plus size={17}/>추가</button>
  </form>
  <div className="patrons-workspace">
   <section className="panel patron-ledger">
    <div className="patron-table-wrap"><table aria-label="귀인 펀딩 내역"><thead><tr><th scope="col">#</th><th scope="col">닉네임</th><th scope="col">TOTAL</th><th scope="col">두당.</th><th scope="col">비고</th><th scope="col"><span className="patron-sr-only">삭제</span></th></tr></thead><tbody>
     {entries.map((entry,i)=><tr key={entry.id}><td className="patron-row-index">{String(i+1).padStart(2,'0')}</td>
      <td><input key={entry.nickname} aria-label={`${i+1}번 귀인 닉네임`} maxLength={60} defaultValue={entry.nickname} onKeyDown={blurOnEnter} onBlur={e=>{const name=e.target.value.trim();if(!name){e.target.value=entry.nickname;notify('닉네임을 입력해주세요.');return;}update(entry.id,{nickname:name});}}/></td>
      <PatronAmounts amount={entry.amount} size={s.teamSize} index={i+1} onChange={value=>update(entry.id,{amount:value})} notify={notify}/>
      <td><input key={entry.note} className="patron-note-input" aria-label={`${i+1}번 귀인 비고`} maxLength={200} defaultValue={entry.note} onKeyDown={blurOnEnter} onBlur={e=>update(entry.id,{note:e.target.value.trim()})}/></td>
      <td><button className="patron-remove" aria-label={`${i+1}번 귀인 삭제`} title="기록 삭제" onClick={()=>commit(value=>({...value,patrons:value.patrons.filter(row=>row.id!==entry.id)}),`${entry.nickname} 귀인 펀딩 삭제`)}><X size={17}/></button></td>
     </tr>)}
     {!entries.length?<tr><td colSpan={6}><div className="patron-empty">닉네임과 TOTAL 또는 두당을 입력해 추가하세요.</div></td></tr>:null}
    </tbody></table></div>
   </section>
   <aside className="panel patron-totals" aria-label="귀인 펀딩 합계">
    <section><span className="patron-metric-label">TOTAL</span><div className="patron-total-value" aria-label="귀인 TOTAL"><strong>{number(totals.total)}</strong><span>개</span></div></section>
    <section><span className="patron-metric-label">두당.</span><div className="patron-total-value patron-per-value" aria-label="귀인 두당"><strong>{number(totals.per)}</strong><span>개</span></div><small>{s.teamSize}명 기준{totals.remainder>0?` · 잔여 ${number(totals.remainder)}개`:''}</small></section>
   </aside>
  </div>
 </section>;
}
