import { useEffect, useState } from 'react';
import { Users, Radio, Timer, CircleDot, Trophy, ArrowUpRight, Plus, Play, Pause, RotateCcw } from 'lucide-react';
import { clockRemaining, clockText, funding, number, rankByFunding, teamMembers, type Player, type Scene, type Session, type Team } from './domain';
import { portraitUrl } from './roster';
export function Portrait({player,small=false}:{player:Pick<Player,'name'|'race'|'rosterId'>;small?:boolean}){
  const url=portraitUrl(player),[failed,setFailed]=useState(false);
  useEffect(()=>setFailed(false),[url]);
  return <span className={`portrait ${small?'portrait-small':''} portrait-${player.race}`}>{url&&!failed?<img src={url} alt={`${player.name} 프로필`} loading="lazy" onError={()=>setFailed(true)}/>:<span>{player.name.slice(-2)}</span>}</span>;
}
export const SCENES:{id:Scene;label:string;icon:typeof Users}[]=[{id:'board',label:'펀딩 현황',icon:Users},{id:'teams',label:'팀 매치업',icon:Trophy},{id:'draw',label:'추첨 스튜디오',icon:CircleDot},{id:'timer',label:'타이머',icon:Timer}];
export function RaceMark({race}:{race:Player['race']}){return <span className={`race race-${race}`} title={{T:'테란',P:'프로토스',Z:'저그'}[race]}>{race}</span>;}
export function Clock({timer,large=false}:{timer:Session['timer'];large?:boolean}){
  const [now,setNow]=useState(Date.now());
  useEffect(()=>{setNow(Date.now());if(timer.deadline===null)return;const id=setInterval(()=>setNow(Date.now()),100);return ()=>clearInterval(id);},[timer.deadline]);
  const ms=clockRemaining(timer,now);
  return <span className={`${large?'clock-large':'clock-small'} ${ms===0?'expired':''}`}>{clockText(ms)}</span>;
}
export function TimerProgress({timer}:{timer:Session['timer']}){
  const [now,setNow]=useState(Date.now());
  useEffect(()=>{setNow(Date.now());if(timer.deadline===null)return;const id=setInterval(()=>setNow(Date.now()),250);return ()=>clearInterval(id);},[timer.deadline]);
  const ratio=timer.remaining>0?Math.max(0,Math.min(1,clockRemaining(timer,now)/timer.remaining)):0;
  return <div className="timer-progress" role="progressbar" aria-label="남은 시간" aria-valuenow={Math.round(ratio*100)} aria-valuemin={0} aria-valuemax={100}><span style={{width:`${ratio*100}%`}}/></div>;
}
type TimerChange = (update: (timer: Session['timer']) => Session['timer'], label: string) => void;
function FundingTimer({timer,onChange}:{timer:Session['timer'];onChange:TimerChange}) {
  const running=timer.deadline!==null;
  const add=(ms:number)=>onChange(previous=>{
    const now=Date.now(),remaining=Math.min(86400000,clockRemaining(previous,now)+ms);
    return {...previous,remaining,deadline:previous.deadline===null?null:now+remaining};
  },`타이머 ${ms===60000?'1분':`${ms/1000}초`} 추가`);
  const toggle=()=>onChange(previous=>{
    const now=Date.now(),remaining=clockRemaining(previous,now);
    return {...previous,remaining,deadline:previous.deadline===null&&remaining>0?now+remaining:null};
  },running?'타이머 일시정지':'타이머 시작');
  return <section className="funding-timer" aria-label="펀딩 타이머">
    <div className="funding-timer-heading"><span><Timer size={13}/> 타이머</span><small>{running?'진행 중':'대기'}</small></div>
    <div className="funding-timer-clock" role="timer" aria-label="펀딩 남은 시간" aria-live="off"><Clock timer={timer}/></div>
    <div className="funding-timer-add">{[20000,30000,60000].map(ms=><button key={ms} onClick={()=>add(ms)} aria-label={`펀딩 타이머 ${ms===60000?'1분':`${ms/1000}초`} 추가`}><Plus size={12}/>{ms===60000?'1분':`${ms/1000}초`}</button>)}</div>
    <div className="funding-timer-controls"><button className="funding-timer-toggle" onClick={toggle} disabled={!running&&timer.remaining===0} aria-label={running?'펀딩 타이머 일시정지':'펀딩 타이머 시작'}>{running?<Pause size={13}/>:<Play size={13}/>} {running?'일시정지':'시작'}</button><button onClick={()=>onChange(previous=>({...previous,remaining:0,deadline:null}),'타이머 초기화')} aria-label="펀딩 타이머 초기화" title="초기화"><RotateCcw size={13}/></button></div>
  </section>;
}
export function FundingSummary({s,onTimerChange}:{s:Session;onTimerChange:TimerChange}) {
  const f=funding(s.players,s.teamSize);
  return <div className="funding-summary" role="group" aria-label="펀딩 합계">
    <FundingTimer timer={s.timer} onChange={onTimerChange}/>
    <section className="funding-metric stat-main"><span className="funding-metric-label">두당 펀딩</span><div className={`stat-value${String(f.per).length>5?' long':''}`}>{number(f.per)}<span>개</span></div></section>
    <section className="funding-metric"><span className="funding-metric-label">토탈 펀딩</span><div className={`stat-value${String(f.total).length>5?' long':''}`}>{number(f.total)}<span>개</span></div>{f.remainder>0?<small className="funding-remainder">배분 잔여 {f.remainder}개</small>:null}</section>
  </div>;
}
export function TeamCard({s,team,onDrop,onRemove,onName}:{s:Session;team:Team;onDrop?:(id:string)=>void;onRemove?:(id:string)=>void;onName?:(name:string)=>void}) {
  const players=teamMembers(s.players,team);
  const [dragOver,setDragOver]=useState(false);
  return <section className={`team-card team-${team}${dragOver?' drag-over':''}`} aria-label={`${team}팀 선수`} onDragOver={onDrop?e=>{e.preventDefault();e.dataTransfer.dropEffect='move';setDragOver(true);}:undefined} onDragLeave={()=>setDragOver(false)} onDrop={onDrop?e=>{e.preventDefault();setDragOver(false);onDrop(e.dataTransfer.getData('text/plain'));}:undefined}>
    <div className="team-card-head"><span className="team-letter">{team}</span><div><span className="eyebrow">{team==='A'?'HOME SIDE':'AWAY SIDE'}</span>{onName?<input className="team-name-input" aria-label={`${team}팀 이름`} maxLength={30} defaultValue={s.teams[team]} key={s.teams[team]} onBlur={e=>onName(e.target.value.trim()||`TEAM ${team}`)}/>:<h2>{s.teams[team]}</h2>}</div><span className="team-capacity">{players.length} / {s.teamSize}</span></div>
    <div className="team-slots" style={{gridTemplateColumns:`repeat(${Math.min(5,Math.max(s.teamSize,players.length))},minmax(0,1fr))`}}>{Array.from({length:Math.max(s.teamSize,players.length)},(_,i)=>{const p=players[i];return <div className={`team-slot ${p?'filled':''}`} key={p?.id??i} draggable={!!p&&!!onDrop} onDragStart={p&&onDrop?e=>{e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',p.id);}:undefined}><span className="slot-no">{String(i+1).padStart(2,'0')}</span>{p?<><Portrait player={p} small/><RaceMark race={p.race}/><strong>{p.name}</strong>{onRemove?<button className="remove-player" aria-label={`${p.name} 팀에서 제외`} title="미배정으로 이동" draggable={false} onMouseDown={e=>{e.stopPropagation();e.preventDefault();e.currentTarget.focus();}} onDragStart={e=>{e.preventDefault();e.stopPropagation();}} onClick={e=>{e.stopPropagation();onRemove(p.id);}}>×</button>:null}</>:<span className="slot-empty">{onDrop?'드래그하여 배정':'선수 대기 중'}</span>}</div>;})}</div>
    <div className="team-card-foot"><span>종족 구성</span><div className="team-race-counts" role="group" aria-label={`${team}팀 종족 구성`}>{(['T','P','Z'] as const).map(race=>{const count=players.filter(p=>p.race===race).length;return <span className="team-race-count" key={race} aria-label={`${{T:'테란',P:'프로토스',Z:'저그'}[race]} ${count}명`}><RaceMark race={race}/><b>{count}</b><small>명</small></span>;})}</div></div>
  </section>;
}
export function BroadcastBoard({s}:{s:Session}) {
  const active=s.players.filter(p=>p.active),f=funding(s.players,s.teamSize);
  return <div className="broadcast-board"><div className="broadcast-total"><span className="eyebrow">TOTAL PRIZE POOL</span><strong>{number(f.total)}<small>개</small></strong><span>승리팀 두당 <b>{number(f.per)}개</b>{f.remainder?` · 잔여 ${f.remainder}개`:''}</span></div><div className="broadcast-players">{rankByFunding(active).map((p,i)=><div key={p.id}><span className="muted">{String(i+1).padStart(2,'0')}</span><Portrait player={p}/><RaceMark race={p.race}/><strong>{p.name}</strong><span className="broadcast-amount">{number(p.amount)}<small>개</small></span></div>)}</div></div>;
}
export function MiniPreview({s}:{s:Session}){
  const f=funding(s.players,s.teamSize);
  return <div className="mini-preview"><div className="preview-watermark">PL<span>/</span>SET</div><span className="mini-label">{s.title}</span>{s.scene==='timer'?<Clock timer={s.timer} large/>:s.scene==='draw'?<><CircleDot size={44}/><strong>DRAW STUDIO</strong><small>{s.draw?.finishedAt?'추첨 완료':s.draw?'추첨 진행 중':'추첨 대기'}</small></>:s.scene==='teams'?<div className="mini-versus"><span>A</span><b>{s.score.A} : {s.score.B}</b><span>B</span></div>:<><strong className="mini-number">{number(f.per)}<small>개</small></strong><small>승리팀 두당 펀딩</small></>}<div className="mini-footer"><span>{s.teamSize} vs {s.teamSize}</span><span>PROLEAGUE</span></div></div>;
}
export function OutputHeader({s}:{s:Session}) {return <header className="output-header"><div className="brand">PL<span>/</span>SET<small>PROLEAGUE STUDIO</small></div><div><span className="eyebrow">{s.teamSize} vs {s.teamSize} · STARCRAFT: BROOD WAR</span><h1>{s.title}</h1></div><span className="on-air"><Radio size={14}/> BROADCAST</span></header>;}
