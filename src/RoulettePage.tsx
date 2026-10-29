import { useState } from 'react';
import { Minus, Plus, RotateCcw, X } from 'lucide-react';
import { randomSeed, type DrawItem, type DrawRun, type Session } from './domain';
import WheelStage from './WheelStage';
type Commit=(update:(s:Session)=>Session,label?:string,history?:boolean)=>void;
export default function RoulettePage({s,commit,notify,onFinish,visible}:{s:Session;commit:Commit;notify:(text:string)=>void;onFinish:(ids:string[])=>void;visible:boolean}){
 const previous=s.draw?.mode==='wheel'?s.draw:null;
 const [labels,setLabels]=useState<string[]>(()=>previous?.items.map(item=>item.label)??Array(6).fill(''));
 const [countDraft,setCountDraft]=useState<string|null>(null);
 const [editing,setEditing]=useState(!previous),[edited,setEdited]=useState(false);
 const busy=!!s.draw&&!s.draw.finishedAt;
 const run=s.draw?.mode==='wheel'&&(!edited||!s.draw.finishedAt)?s.draw:null;
 const items:DrawItem[]=labels.map((label,i)=>({id:`wheel-${i}`,label,playerId:s.players.find(player=>player.active&&player.name===label.trim())?.id}));
 const filled=labels.filter(label=>label.trim()).length;
 const resize=(count:number)=>{if(!Number.isFinite(count))return;const n=Math.max(2,Math.min(60,Math.round(count)));setLabels(old=>Array.from({length:n},(_,i)=>old[i]??''));setEditing(true);setEdited(true);};
 const update=(index:number,label:string)=>{setLabels(old=>old.map((value,i)=>i===index?label:value));setEdited(true);};
 const confirm=()=>{const empty=labels.findIndex(label=>!label.trim());if(empty>=0){notify('모든 칸에 항목을 입력해주세요.');document.querySelector<HTMLInputElement>(`[data-wheel-slot="${empty}"]`)?.focus();return;}setEditing(false);};
 const start=()=>{
  if(busy)return;if(editing){confirm();return;}if(filled!==labels.length){setEditing(true);notify('모든 칸에 항목을 입력해주세요.');return;}
  const draw:DrawRun={mode:'wheel',source:'custom',winner:'first',seed:randomSeed(),startedAt:Date.now()+600,rank:1,items:items.map(item=>({...item,label:item.label.trim()})),results:[],finishedAt:null};
  setEdited(false);commit(value=>({...value,draw,scene:'draw'}),`룰렛 추첨 시작 · ${items.length}개 항목`);
 };
 const reconfigure=()=>{setEditing(true);setEdited(true);};
 const selected=run?.finishedAt?run.items.find(item=>item.id===run.results[run.rank-1]):undefined;
 return <div className="draw-layout wheel-layout wheel-editor-layout">
  <section className="panel draw-controls">
   <div className="field-label wheel-count-field"><span>판 개수</span><div className="wheel-count-control"><button aria-label="판 개수 줄이기" disabled={busy||labels.length<=2} onClick={()=>resize(labels.length-1)}><Minus size={16}/></button><input type="number" aria-label="판 개수" min={2} max={60} disabled={busy} value={countDraft??labels.length} onFocus={()=>setCountDraft(String(labels.length))} onChange={e=>setCountDraft(e.target.value)} onBlur={e=>{if(e.currentTarget.value.trim())resize(e.currentTarget.valueAsNumber);setCountDraft(null);}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/><small>개</small><button aria-label="판 개수 늘리기" disabled={busy||labels.length>=60} onClick={()=>resize(labels.length+1)}><Plus size={16}/></button></div></div>
   <span className="wheel-entry-status">{filled} / {labels.length} 입력</span>   {editing?<button className="button primary" disabled={busy} onClick={confirm}>설정 완료</button>:<button className="button" disabled={busy} onClick={reconfigure}><RotateCcw size={15}/>재설정</button>}
   {busy&&run?<button className="button" onClick={()=>commit(value=>({...value,draw:null}),'룰렛 추첨 취소')}><X size={15}/>추첨 취소</button>:null}
  </section>
  <section className="panel stage-panel">
   {visible||run?<WheelStage run={run} items={items} onFinish={onFinish} onStart={start} disabled={busy} editing={editing} onEdit={update} onConfirm={confirm}/>:null}
   {selected&&s.players.some(p=>p.id===(selected.playerId??selected.id))?<div className="draw-result"><strong>{selected.label}</strong><div className="result-assign">{(['A','B'] as const).map(team=><button key={team} onClick={()=>{if(s.players.filter(p=>p.active&&p.team===team).length>=s.teamSize){notify(`${team}팀 정원이 가득 찼습니다.`);return;}commit(value=>({...value,players:value.players.map(p=>p.id===(selected.playerId??selected.id)?{...p,team}:p)}),`${selected.label} → ${team}팀`);}}>{team}팀 배정</button>)}</div></div>:null}
  </section>
 </div>;
}
