import { useCallback, useEffect, useRef, useState } from 'react';
import { createSession, uid, validateSession, type Session } from './domain';
const KEY='plset.session.v1';
const output = new URLSearchParams(location.search).has('output');
export function useSession() {
  const [state,setState]=useState<Session|null>(null);
  const current=useRef<Session|null>(null);
  const undoStack=useRef<Session[]>([]);
  const [canUndo,setCanUndo]=useState(false);
  const [status,setStatus]=useState('불러오는 중');
  const [error,setError]=useState('');
  const channel=useRef<BroadcastChannel|null>(null);
  const saveSequence=useRef(0);
  useEffect(()=>{
    let live=true;
    const receive=(next:Session)=>{ if(!live || !next)return; try { const s=validateSession(next); current.current=s; setState(s); }catch{setError('동기화 데이터를 읽지 못했습니다.');} };
    if(window.plset) {
      const stop=output ? window.plset.onState(receive) : ()=>{};
      window.plset.load().then(({state,error})=>{ if(!live)return; const next=state ? validateSession(state) : createSession(); receive(next); setStatus('자동 저장됨'); if(error)setError(error); if(!state&&!output)window.plset!.save(next).catch(()=>setError('저장에 실패했습니다. 세션을 내보내 주세요.')); }).catch(()=>{if(live)setError('세션을 불러오지 못했습니다. 앱을 다시 실행해주세요.');});
      return ()=>{live=false;stop();};
    }
    channel.current=new BroadcastChannel('plset-session');
    channel.current.onmessage=e=>{if(output)receive(e.data);};
    try { const raw=localStorage.getItem(KEY); receive(raw?validateSession(JSON.parse(raw)):createSession()); setStatus('자동 저장됨'); }catch{receive(createSession());setError('기존 저장 데이터를 읽지 못했습니다.');}
    const storage=(e:StorageEvent)=>{if(output&&e.key===KEY&&e.newValue) {try{receive(JSON.parse(e.newValue));}catch{setError('방송 데이터 동기화에 실패했습니다.');}}};
    window.addEventListener('storage',storage);
    return ()=>{live=false;channel.current?.close();window.removeEventListener('storage',storage);};
  },[]);
  const persist=useCallback((next:Session)=>{
    const sequence=++saveSequence.current;
    current.current=next;setState(next);setStatus('저장 중');
    if(window.plset)window.plset.save(next).then(()=>{if(sequence===saveSequence.current)setStatus('자동 저장됨');}).catch(()=>{setStatus('저장 실패');setError('저장에 실패했습니다. 내보내기로 백업해주세요.');});
    else {try{localStorage.setItem(KEY,JSON.stringify(next));channel.current?.postMessage(next);setStatus('자동 저장됨');}catch{setStatus('저장 실패');setError('저장 공간이 부족합니다. 세션을 내보내 주세요.');}}
  },[]);
  const commit=useCallback((update:(s:Session)=>Session,label?:string,history=true)=>{
    if(output||!current.current)return;
    const previous=current.current;
    const next=update(previous);
    if(next===previous)return;
    if(history){undoStack.current=[...undoStack.current.slice(-39),previous];setCanUndo(true);}
    if(label)next.logs=[{id:uid(),at:Date.now(),text:label},...next.logs].slice(0,100);
    persist(next);
  },[persist]);
  const undo=useCallback(()=>{
    if(output)return;
    const previous=undoStack.current.pop();if(!previous)return;
    // A completed draw is restored as a result, never resumed as a new race.
    const next={...previous,timer:{...previous.timer,remaining:previous.timer.deadline===null?previous.timer.remaining:Math.max(0,previous.timer.deadline-Date.now()),deadline:null}};
    persist(next);setCanUndo(undoStack.current.length>0);
  },[persist]);
  const replace=useCallback((next:Session)=>commit(()=>validateSession(next),'세션 불러오기'),[commit]);
  return {state,commit,undo,canUndo,status,error,setError,replace};
}
