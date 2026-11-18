import { useCallback, useEffect, useRef, useState } from 'react';
import { createSession, uid, validateSession, type Patron, type Session } from './domain';
import { connectHost, connectViewer, fetchMe, scorerLogin, scorerLogout, type HostStatus, type PrefsMessage, type ViewerStatus } from './live';
import { applyScoreboardPatch, mergePatches, scoreboardPatch, type ScoreboardPatch } from './scoreboard';
import type { Mode, Page } from './mode';
import { patronOnly, rebaseClock, shareStructure } from './share';

const KEY='plset.session.v1';
const output = new URLSearchParams(location.search).has('output');
// An OBS page's streamer key (?me=): the room pushes that streamer's overlay settings to it.
const outputKey = output ? new URLSearchParams(location.search).get('me') : null;
/** `scorer`: the 방싸개 logged in on this viewer, who may edit the scoreboard (see connectViewer). */
export type LiveInfo={status:HostStatus|ViewerStatus|null;hostPage:Page|null;scorer:string|null;prefs:unknown};
// True when an update changed the scoreboard and nothing else (commits spread the previous session, so compare by reference).
const scoreboardOnly=(prev:Session,next:Session)=>{
  if(prev.scoreboard===next.scoreboard)return false;
  const a=prev as unknown as Record<string,unknown>,b=next as unknown as Record<string,unknown>;
  return [...new Set([...Object.keys(a),...Object.keys(b)])].every(key=>key==='scoreboard'||a[key]===b[key]);
};
// A 방싸개's own recent edits are laid over incoming frames for this long, so the echo of an earlier keystroke cannot undo a
// later one; only the parts it edited, so the host's changes to the rest still show.
const SCORER_HOLD_MS=1200,SCORER_SEND_MS=150;

// `mode` is fixed for the lifetime of the page; switching modes reloads (see App).
export function useSession(mode:Mode) {
  const [state,setState]=useState<Session|null>(null);
  const current=useRef<Session|null>(null);
  const undoStack=useRef<Session[]>([]);
  const [canUndo,setCanUndo]=useState(false);
  const [status,setStatus]=useState('불러오는 중');
  const [error,setError]=useState('');
  const [live,setLive]=useState<LiveInfo>({status:null,hostPage:null,scorer:null,prefs:null});
  const channel=useRef<BroadcastChannel|null>(null);
  const storageKey=useRef(KEY);
  const host=useRef<ReturnType<typeof connectHost>|null>(null);
  const page=useRef<Page>('board');
  // Viewer only: what the host sent (already on this PC's clock) and this PC's own patrons.
  const shared=useRef<Session|null>(null),patrons=useRef<Patron[]>([]),patronUndo=useRef<Patron[][]>([]),clockOffset=useRef<number|null>(null);
  const patronKey=mode.kind==='watch'?`plset.watch.${mode.room}.patrons`:'';
  // Viewer only: the live connection (recreated when a 방싸개 logs in or out) and the 방싸개's latest local edit.
  const viewerConn=useRef<ReturnType<typeof connectViewer>|null>(null),reconnect=useRef<(scorer:boolean)=>void>(()=>{});
  const prefsRef=useRef<PrefsMessage|null>(null),scorerRef=useRef<string|null>(null),localPatch=useRef<{patch:ScoreboardPatch;at:number}|null>(null),pendingPatch=useRef<ScoreboardPatch|null>(null),scorerSend=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const show=useCallback(()=>{if(!shared.current)return;const next={...shared.current,patrons:patrons.current};current.current=next;setState(next);},[]);
  useEffect(()=>{
    let alive=true;
    const receive=(next:Session)=>{ if(!alive || !next)return; try { const s=validateSession(next); current.current=s; setState(s); }catch{setError('동기화 데이터를 읽지 못했습니다.');} };
    const setStatusOf=(next:HostStatus|ViewerStatus)=>{if(alive)setLive(v=>({...v,status:next}));};
    if(mode.kind==='watch'){
      try{const raw=localStorage.getItem(patronKey);if(raw)patrons.current=validateSession({...createSession(),patrons:JSON.parse(raw)}).patrons;}catch{setError('저장된 귀인 기록을 읽지 못했습니다.');}
      fetchMe().then(({url,scorer})=>{
        if(!alive)return;
        const connect=(asScorer:boolean)=>{
          viewerConn.current?.stop();
          viewerConn.current=connectViewer(mode.room,url,({session,page:hostPage,hostNow})=>{
            if(!alive)return;
            // One offset per page load: re-estimating on every message would shift a running draw's start time.
            clockOffset.current??=hostNow-Date.now();
            const recent=localPatch.current&&Date.now()-localPatch.current.at<SCORER_HOLD_MS?localPatch.current.patch:null;
            const board=recent?applyScoreboardPatch(session.scoreboard,recent):null;
            shared.current=shareStructure(shared.current,rebaseClock(board?{...session,scoreboard:board}:session,clockOffset.current));
            setLive(v=>v.hostPage===hostPage?v:{...v,hostPage});
            show();
          },setStatusOf,output,asScorer,{me:outputKey,onPrefs:prefs=>{if(alive)setLive(v=>({...v,prefs}));},
            onError:code=>{if(!alive||!scorerRef.current)return;setError(code==='no_host'?'진행자가 연결되어 있지 않아 스코어보드 수정을 저장하지 못했습니다. 진행자가 들어온 뒤 다시 입력해 주세요.':code==='no_state'?'진행자가 아직 방송을 시작하지 않아 스코어보드를 저장하지 못했습니다.':'스코어보드 수정을 저장하지 못했습니다.');},
            onScorerLost:()=>{if(!alive)return;scorerRef.current=null;localPatch.current=null;pendingPatch.current=null;setLive(v=>({...v,scorer:null}));setError('방싸개 로그인이 만료되었습니다. 다시 로그인해 주세요.');}});
          if(prefsRef.current)viewerConn.current.sendPrefs(prefsRef.current);
        };
        reconnect.current=connect;
        // An OBS output page never edits, so it never connects as the 방싸개 even when the cookie is there.
        const asScorer=!output&&!!scorer;
        scorerRef.current=asScorer?scorer!:null;
        setLive(v=>({...v,scorer:scorerRef.current}));
        connect(asScorer);
      }).catch(()=>{if(alive)setError('방송 서버에 연결하지 못했습니다. 새로고침해 주세요.');});
      return ()=>{alive=false;clearTimeout(scorerSend.current);viewerConn.current?.stop();viewerConn.current=null;};
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
        // A 방싸개 edited the scoreboard: take it in, so the next state sent carries it instead of overwriting it.
        host.current=connectHost(account,url,setStatusOf,patch=>{
          if(!alive||!current.current)return;
          const board=applyScoreboardPatch(current.current.scoreboard,patch);
          if(board)persist({...current.current,scoreboard:board});
        });
        if(current.current)host.current.send(current.current,page.current);
        if(prefsRef.current)host.current.sendPrefs(prefsRef.current);
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
      // A 방싸개 may change the scoreboard: shown at once, sent shortly after (one message per burst of typing).
      if(scorerRef.current&&shared.current&&next.scoreboard&&scoreboardOnly(previous,next)){
        const patch=scoreboardPatch(previous.scoreboard,next.scoreboard);
        if(!patch)return;
        const now=Date.now(),held=localPatch.current&&now-localPatch.current.at<SCORER_HOLD_MS?localPatch.current.patch:null;
        localPatch.current={patch:held?mergePatches(held,patch):patch,at:now};
        pendingPatch.current=pendingPatch.current?mergePatches(pendingPatch.current,patch):patch;
        shared.current={...shared.current,scoreboard:next.scoreboard};
        show();
        clearTimeout(scorerSend.current);
        scorerSend.current=setTimeout(()=>{
          const send=pendingPatch.current;pendingPatch.current=null;
          if(send&&!viewerConn.current?.sendScoreboard(send))setError('방송 서버에 연결되지 않아 스코어보드를 보내지 못했습니다.');
        },SCORER_SEND_MS);
        return;
      }
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
  // 방싸개 login / logout: the viewer connection is remade with (or without) the right to edit the scoreboard.
  const loginScorer=useCallback(async(id:string,password:string)=>{
    if(!viewerConn.current)return '방송 서버에 연결된 뒤 다시 시도해 주세요.';
    const failed=await scorerLogin(id,password);
    if(failed)return failed;
    scorerRef.current=id;setLive(v=>({...v,scorer:id}));reconnect.current(true);
    return null;
  },[]);
  const logoutScorer=useCallback(async()=>{
    await scorerLogout();
    clearTimeout(scorerSend.current);
    scorerRef.current=null;localPatch.current=null;pendingPatch.current=null;setLive(v=>({...v,scorer:null}));reconnect.current(false);
  },[]);
  // This console's own overlay settings, saved in the room so the streamer's OBS page follows them live.
  const sendPrefs=useCallback((next:PrefsMessage)=>{prefsRef.current=next;viewerConn.current?.sendPrefs(next);host.current?.sendPrefs(next);},[]);
  return {state,commit,undo,canUndo,status,error,setError,replace,live,publishPage,loginScorer,logoutScorer,sendPrefs};
}
