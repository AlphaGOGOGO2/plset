import { useState } from 'react';
import { Minus, Plus, RotateCcw, X } from 'lucide-react';
import { randomSeed, teamMembers, type DrawItem, type DrawRun, type Session } from './domain';
import WheelStage from './WheelStage';
type Commit=(update:(s:Session)=>Session,label?:string,history?:boolean)=>void;
export default function RoulettePage({s,commit,notify,onFinish,visible}:{s:Session;commit:Commit;notify:(text:string)=>void;onFinish:(ids:string[])=>void;visible:boolean}){
 const previous=s.draw?.mode==='wheel'?s.draw:null;
 const [labels,setLabels]=useState<string[]>(()=>previous?.items.map(item=>item.label)??Array(6).fill(''));
 const [countDraft,setCountDraft]=useState<string|null>(null);
 const [arrangement,setArrangement]=useState<'numbers'|'captains'|null>(()=>previous&&previous.items.every((item,i)=>item.label===String(i+1))?'numbers':null);
 const [editing,setEditing]=useState(!previous),[edited,setEdited]=useState(false);
 const busy=!!previous&&!previous.finishedAt;
 const run=s.draw?.mode==='wheel'&&(!edited||!s.draw.finishedAt)?s.draw:null;
 const items:DrawItem[]=labels.map((label,i)=>({id:`wheel-${i}`,label,playerId:s.players.find(player=>player.active&&player.name===label.trim())?.id}));
 const filled=labels.filter(label=>label.trim()).length;
 const countStep=arrangement==='captains'?2:1;
 const resize=(count:number)=>{if(!Number.isFinite(count))return;const n=Math.max(2,Math.min(60,Math.round(count/countStep)*countStep));setLabels(old=>Array.from({length:n},(_,i)=>arrangement==='numbers'?String(i+1):arrangement==='captains'?old[i%2]:old[i]??''));setEditing(true);setEdited(true);};
 const update=(index:number,label:string)=>{setLabels(old=>old.map((value,i)=>i===index?label:value));setArrangement(null);setEdited(true);};
 const arrange=(mode:string)=>{
  if(busy)return;
  let next:string[];
  if(mode==='numbers')next=Array.from({length:4},(_,i)=>String(i+1));
  else if(mode==='captains'){
   const captains=[teamMembers(s.players,'A')[0],teamMembers(s.players,'B')[0]];
   if(captains.some(player=>!player)){notify('A팀과 B팀에 선수를 먼저 배정해주세요. 각 팀 맨 앞 선수를 팀장으로 배치합니다.');return;}
   next=Array.from({length:4},(_,i)=>captains[i%2].name);
  }else if(mode==='A'||mode==='B'){
   next=teamMembers(s.players,mode).map(player=>player.name);
   if(next.length<2){notify(`${mode}팀에 배치할 선수가 2명 이상 필요합니다.`);return;}
   if(next.length>60){notify('룰렛은 최대 60명까지 배치할 수 있습니다.');return;}
  }else return;
  setLabels(next);setArrangement(mode==='numbers'||mode==='captains'?mode:null);setCountDraft(null);setEditing(true);setEdited(true);
 };
 const confirm=()=>{const empty=labels.findIndex(label=>!label.trim());if(empty>=0){notify('모든 칸에 항목을 입력해주세요.');document.querySelector<HTMLInputElement>(`[data-wheel-slot="${empty}"]`)?.focus();return;}setEditing(false);};
 const start=()=>{
  if(busy)return;if(editing){confirm();return;}if(filled!==labels.length){setEditing(true);notify('모든 칸에 항목을 입력해주세요.');return;}
  if(s.draw&&!s.draw.finishedAt){notify('다른 추첨이 진행 중입니다. 완료하거나 취소한 뒤 룰렛을 돌려주세요.');return;}
  const draw:DrawRun={mode:'wheel',source:'custom',winner:'first',seed:randomSeed(),startedAt:Date.now()+600,rank:1,items:items.map(item=>({...item,label:item.label.trim()})),results:[],finishedAt:null};
  setEdited(false);commit(value=>({...value,draw,scene:'draw'}),`룰렛 추첨 시작 · ${items.length}개 항목`);
 };
 const reconfigure=()=>{setEditing(true);setEdited(true);};
 const selected=run?.finishedAt?run.items.find(item=>item.id===run.results[run.rank-1]):undefined;
 return <div className="draw-layout wheel-layout wheel-editor-layout">
  <section className="panel draw-controls">
   <div className="field-label wheel-count-field"><span>판 개수</span><div className="wheel-count-control"><button aria-label="판 개수 줄이기" disabled={busy||labels.length<=2} onClick={()=>resize(labels.length-countStep)}><Minus size={16}/></button><input type="number" aria-label="판 개수" min={2} max={60} step={countStep} disabled={busy} value={countDraft??labels.length} onFocus={()=>setCountDraft(String(labels.length))} onChange={e=>setCountDraft(e.target.value)} onBlur={e=>{if(e.currentTarget.value.trim())resize(e.currentTarget.valueAsNumber);setCountDraft(null);}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/><small>개</small><button aria-label="판 개수 늘리기" disabled={busy||labels.length>=60} onClick={()=>resize(labels.length+countStep)}><Plus size={16}/></button></div></div>
   <div className="field-label wheel-arrange-field"><span>빠른 배치{arrangement==='captains'?<small>짝수 판 · 팀장별 절반씩</small>:null}</span><div className="wheel-arrange-buttons" role="group" aria-label="빠른 배치">{(['A','B'] as const).map(team=><button key={team} type="button" disabled={busy} onClick={()=>arrange(team)}>{team}팀 배치</button>)}<button type="button" disabled={busy} aria-pressed={arrangement==='captains'} title="4칸으로 시작하고 짝수 단위로 조절합니다" onClick={()=>arrange('captains')}>팀장 배치</button><button type="button" disabled={busy} aria-pressed={arrangement==='numbers'} title="1~4로 시작하고 판 개수에 맞춰 번호를 자동으로 채웁니다" onClick={()=>arrange('numbers')}>숫자 배치</button></div></div>
   <span className="wheel-entry-status">{filled} / {labels.length} 입력</span>   {editing?<button className="button primary" disabled={busy} onClick={confirm}>설정 완료</button>:<button className="button" disabled={busy} onClick={reconfigure}><RotateCcw size={15}/>재설정</button>}
   {busy&&run?<button className="button" onClick={()=>commit(value=>({...value,draw:null}),'룰렛 추첨 취소')}><X size={15}/>추첨 취소</button>:null}
  </section>
  <section className="panel stage-panel">
   {visible||run?<WheelStage run={run} items={items} onFinish={onFinish} onStart={start} disabled={busy} editing={editing} onEdit={update} onConfirm={confirm}/>:null}
   {selected&&s.players.some(p=>p.id===(selected.playerId??selected.id))?<div className="draw-result"><strong>{selected.label}</strong><div className="result-assign">{(['A','B'] as const).map(team=><button key={team} onClick={()=>{if(s.players.filter(p=>p.active&&p.team===team).length>=s.teamSize){notify(`${team}팀 정원이 가득 찼습니다.`);return;}commit(value=>({...value,players:value.players.map(p=>p.id===(selected.playerId??selected.id)?{...p,team}:p)}),`${selected.label} → ${team}팀`);}}>{team}팀 배정</button>)}</div></div>:null}
  </section>
 </div>;
}
