import { useCallback, useEffect, useRef, useState } from 'react';
import { createSession, uid, validateSession, type Patron, type Session } from './domain';
import { connectHost, connectViewer, fetchMe, type HostStatus, type ViewerStatus } from './live';
import type { Mode, Page } from './mode';
import { patronOnly, rebaseClock, shareStructure } from './share';

const KEY='plset.session.v1';
const output = new URLSearchParams(location.search).has('output');
export type LiveInfo={status:HostStatus|ViewerStatus|null;hostPage:Page|null};

// `mode` is fixed for the lifetime of the page; switching modes reloads (see App).
export function useSession(mode:Mode) {
  const [state,setState]=useState<Session|null>(null);
  const current=useRef<Session|null>(null);
  const undoStack=useRef<Session[]>([]);
  const [canUndo,setCanUndo]=useState(false);
  const [status,setStatus]=useState('불러오는 중');
  const [error,setError]=useState('');
  const [live,setLive]=useState<LiveInfo>({status:null,hostPage:null});
  const channel=useRef<BroadcastChannel|null>(null);
  const storageKey=useRef(KEY);
  const host=useRef<ReturnType<typeof connectHost>|null>(null);
  const page=useRef<Page>('board');
  // Viewer only: what the host sent (already on this PC's clock) and this PC's own patrons.
  const shared=useRef<Session|null>(null),patrons=useRef<Patron[]>([]),patronUndo=useRef<Patron[][]>([]),clockOffset=useRef<number|null>(null);
  const patronKey=mode.kind==='watch'?`plset.watch.${mode.room}.patrons`:'';
  const show=useCallback(()=>{if(!shared.current)return;const next={...shared.current,patrons:patrons.current};current.current=next;setState(next);},[]);
  useEffect(()=>{
    let alive=true;
    const receive=(next:Session)=>{ if(!alive || !next)return; try { const s=validateSession(next); current.current=s; setState(s); }catch{setError('동기화 데이터를 읽지 못했습니다.');} };
    const setStatusOf=(next:HostStatus|ViewerStatus)=>{if(alive)setLive(v=>({...v,status:next}));};
    if(mode.kind==='watch'){
      try{const raw=localStorage.getItem(patronKey);if(raw)patrons.current=validateSession({...createSession(),patrons:JSON.parse(raw)}).patrons;}catch{setError('저장된 귀인 기록을 읽지 못했습니다.');}
      let stop=()=>{};
      fetchMe().then(({url})=>{
        if(!alive)return;
        stop=connectViewer(mode.room,url,({session,page:hostPage,hostNow})=>{
          if(!alive)return;
          // One offset per page load: re-estimating on every message would shift a running draw's start time.
          clockOffset.current??=hostNow-Date.now();
          shared.current=shareStructure(shared.current,rebaseClock(session,clockOffset.current));
          setLive(v=>v.hostPage===hostPage?v:{...v,hostPage});
          show();
        },setStatusOf);
      }).catch(()=>{if(alive)setError('방송 서버에 연결하지 못했습니다. 새로고침해 주세요.');});
      return ()=>{alive=false;stop();};
    }
    channel.current=new BroadcastChannel('plset-session');
    channel.current.onmessage=e=>{if(output)receive(e.data);};
    const load=(key:string,fallback?:string)=>{
      storageKey.current=key;
      try {
        let raw=localStorage.getItem(key);
        if(!raw&&fallback){raw=localStorage.getItem(fallback);if(raw)localStorage.setItem(key,raw);}
        receive(raw?validateSession(JSON.parse(raw)):createSession()); setStatus('자동 저장됨');
      }catch{receive(createSession());setError('기존 저장 데이터를 읽지 못했습니다.');}
    };
    const storage=(e:StorageEvent)=>{if(output&&e.key===storageKey.current&&e.newValue) {try{receive(JSON.parse(e.newValue));}catch{setError('방송 데이터 동기화에 실패했습니다.');}}};
    window.addEventListener('storage',storage);
    if(mode.kind==='host'){
      fetchMe().then(({account,url})=>{
        if(!alive)return;
        if(!account){location.replace('/proleague/room');return;}
        load(`${KEY}.${account}`,KEY);
        // An ?output window only displays; connecting it would register a second host and replace the real one.
        if(output)return;
        host.current=connectHost(account,url,setStatusOf);
        if(current.current)host.current.send(current.current,page.current);
      }).catch(()=>{if(alive)setError('계정을 확인하지 못했습니다. 새로고침해 주세요.');});
    } else load(KEY);
    return ()=>{alive=false;host.current?.stop();host.current=null;channel.current?.close();window.removeEventListener('storage',storage);};
  },[]);
  const persist=useCallback((next:Session)=>{
    current.current=next;setState(next);setStatus('저장 중');
    try{localStorage.setItem(storageKey.current,JSON.stringify(next));channel.current?.postMessage(next);setStatus('자동 저장됨');}catch{setStatus('저장 실패');setError('저장 공간이 부족합니다. 세션을 내보내 주세요.');}
    host.current?.send(next,page.current);
  },[]);
  const commit=useCallback((update:(s:Session)=>Session,label?:string,history=true)=>{
    if(output||!current.current)return;
    const previous=current.current;
    const next=update(previous);
    if(next===previous)return;
    const privateChange=patronOnly(previous,next);
    if(mode.kind==='watch'){
      // A viewer owns nothing but their patron list; every other change belongs to the host.
      if(!privateChange)return;
      if(history){patronUndo.current=[...patronUndo.current.slice(-39),previous.patrons];setCanUndo(true);}
      patrons.current=next.patrons;
      try{localStorage.setItem(patronKey,JSON.stringify(next.patrons));}catch{setError('저장 공간이 부족합니다.');}
      show();return;
    }
    if(history){undoStack.current=[...undoStack.current.slice(-39),previous];setCanUndo(true);}
    if(label)next.logs=[{id:uid(),at:Date.now(),text:label,...(privateChange?{private:true}:{})},...next.logs].slice(0,100);
    persist(next);
  },[persist,show]);
  const undo=useCallback(()=>{
    if(output)return;
    if(mode.kind==='watch'){
      const previous=patronUndo.current.pop();if(!previous)return;
      patrons.current=previous;
      try{localStorage.setItem(patronKey,JSON.stringify(previous));}catch{setError('저장 공간이 부족합니다.');}
      show();setCanUndo(patronUndo.current.length>0);return;
    }
    const previous=undoStack.current.pop();if(!previous)return;
    // A completed draw is restored as a result, never resumed as a new race.
    const next={...previous,timer:{...previous.timer,remaining:previous.timer.deadline===null?previous.timer.remaining:Math.max(0,previous.timer.deadline-Date.now()),deadline:null}};
    persist(next);setCanUndo(undoStack.current.length>0);
  },[persist,show]);
  const replace=useCallback((next:Session)=>commit(()=>validateSession(next),'세션 불러오기'),[commit]);
  const publishPage=useCallback((next:Page)=>{page.current=next;if(current.current)host.current?.send(current.current,next);},[]);
  return {state,commit,undo,canUndo,status,error,setError,replace,live,publishPage};
}
