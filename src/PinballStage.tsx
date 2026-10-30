import { useEffect, useRef, useState } from 'react';
import { Copy, Maximize2, Minimize2, Play } from 'lucide-react';
import standard from 'box2d-wasm/dist/es/Box2D.wasm?url';
import simd from 'box2d-wasm/dist/es/Box2D.simd.wasm?url';
import { type DrawItem, type DrawRun } from './domain';
import { configurePinballWasm, createPinball, MARBLE_COLORS, PINBALL_MAPS, replayCourse } from './pinball';
import { Camera, cameraFocus, finishIntensity, INITIAL_ZOOM, RankTracker, timeScale, VIEW_H, VIEW_W } from './pinballCamera';
import { portraitUrl } from './roster';
import { playSfx, type Sfx } from './sfx';

configurePinballWasm({ standard, simd });
const W = VIEW_W, H = VIEW_H, MINI_SCALE = 4, MINI_UNITS = 26, MINI_INSET = 10;
const font = '"Manrope Variable", "Noto Sans KR", sans-serif';
type Race = Awaited<ReturnType<typeof createPinball>>;
// 구슬 안에 넣을 두 글자: 한글 3자 이상 이름은 성을 뺀 두 글자, 그 외(두 글자 이름·영문·맵/ACE 라벨)는 앞 두 글자.
export const shortName = (label: string, keepHead = false) => keepHead || label.length < 3 || !/^[가-힣]+$/.test(label) ? label.slice(0, 2) : label.slice(1, 3);
type GameWindow = Window & { render_game_to_text?: () => string; advanceTime?: (ms: number) => void };

export default function PinballStage({ run, items, rank, map = 0, variant = 'players', previewSeed = 412, showNames = true, showPortraits = true, onFinish, onCopyMaps, onNextDraw }: { run: DrawRun | null; items: DrawItem[]; rank: number; map?: number; previewSeed?: number; showNames?: boolean; showPortraits?: boolean; variant?: 'players'|'ace'|'maps'; onFinish?: (ids: string[]) => void; onNextDraw?: () => void; onCopyMaps?:()=>void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null), stageRef = useRef<HTMLDivElement>(null), actionLayerRef = useRef<HTMLDivElement>(null), miniRef=useRef<HTMLButtonElement>(null);
  const [fullscreen, setFullscreen] = useState(false), [status, setStatus] = useState('');
  const [speed,setSpeed]=useState<1|2|4>(1);
  const speedRef=useRef<1|2|4>(1);
  const callback = useRef(onFinish); callback.current = onFinish;
  const showNamesRef = useRef(showNames); showNamesRef.current = showNames;
  const showPortraitsRef = useRef(showPortraits); showPortraitsRef.current = showPortraits;
  const latest = useRef(run); latest.current = run;
  const itemKey = JSON.stringify((run?.items ?? items).map(p => [p.id, p.label])), selectedRank = run?.rank ?? rank, mapIndex = run ? replayCourse(run.map) : map;
  const mapMode=(run?.variant??variant)==='maps',aceMode=(run?.variant??variant)==='ace';
  const mapPool=run?.mapOpening?.length??(run?.items??items).length,mapExtra=mapMode&&!!run?.mapOpening,mapGames=mapMode&&run?.mapFormat==='winners'?mapPool+2:mapPool;
  const lastWinner=mapMode||run?.winner==='last'||run?.winner===undefined&&selectedRank>1;

  useEffect(() => {
    const update = () => setFullscreen(document.fullscreenElement === stageRef.current);
    const key = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'f' || e.ctrlKey || e.metaKey || e.altKey || e.repeat || stageRef.current?.closest('[hidden]') || document.querySelector('dialog[open]') || (e.target as HTMLElement).closest('input, textarea, select, [contenteditable]')) return;
      if (document.fullscreenElement) void document.exitFullscreen(); else void stageRef.current?.requestFullscreen().catch(() => {});
    };
    document.addEventListener('fullscreenchange', update); window.addEventListener('keydown', key);
    return () => { document.removeEventListener('fullscreenchange', update); window.removeEventListener('keydown', key); };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current, ctx = canvas?.getContext('2d'); if (!canvas || !ctx) return;
    canvas.width = W; canvas.height = H;
    const entrants: DrawItem[] = JSON.parse(itemKey).map(([id, label]: string[]) => ({ id, label }));
    const images = entrants.map(p => { if(mapMode)return null;const url = portraitUrl({ name: p.label }); if (!url) return null; const img = new Image(); img.src = url; return img; });
    let race: Race | undefined, disposed = false, raf = 0, sent = false, virtualOffset = 0;
    const rows = Math.max(3, Math.ceil(entrants.length / 8));
    // Ready view frames the spawn block (after lazygyu's setMarbles): zoom between 1.5x and 3x.
    const readyZoom = Math.max(1.5, Math.min(3, Math.min(W / INITIAL_ZOOM / (7 + 6), H / INITIAL_ZOOM / (rows * .8 + 6))));
    const camera = new Camera(); camera.reset({ x: 13, y: rows * .4 + 1 }, readyZoom);
    let inspection: {x:number;y:number}|null=null;
    const mini=miniRef.current!;
    const releaseInspection=()=>{inspection=null;mini.removeAttribute('data-inspecting');};
    const inspectPointer=(e:PointerEvent)=>{
      if(!race||e.pointerType==='touch'&&e.buttons===0)return;
      const rect=mini.getBoundingClientRect();
      inspection={x:Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width))*MINI_UNITS,y:Math.max(0,Math.min(1,(e.clientY-rect.top)/rect.height))*(race.stage.goalY+2)};
      mini.setAttribute('data-inspecting','true');
    };
    const inspectDown=(e:PointerEvent)=>{if(e.pointerType==='touch'){mini.setPointerCapture(e.pointerId);inspectPointer(e);}};
    const inspectUp=(e:PointerEvent)=>{if(e.pointerType==='touch')releaseInspection();};
    const inspectFocus=()=>{if(race&&mini.matches(':focus-visible')){inspection={x:camera.position.x,y:camera.position.y};mini.setAttribute('data-inspecting','true');}};
    const inspectKey=(e:KeyboardEvent)=>{
      if(e.key==='Escape'){e.preventDefault();mini.blur();releaseInspection();return;}
      if(!race||!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
      e.preventDefault();const p=inspection??{...camera.position},step=e.shiftKey?12:3;
      inspection={x:Math.max(0,Math.min(MINI_UNITS,p.x+(e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0))),y:Math.max(0,Math.min(race.stage.goalY+2,e.key==='Home'?0:e.key==='End'?race.stage.goalY:p.y+(e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0)))};mini.setAttribute('data-inspecting','true');
    };
    mini.addEventListener('pointermove',inspectPointer);mini.addEventListener('pointerdown',inspectDown);mini.addEventListener('pointerup',inspectUp);mini.addEventListener('pointerleave',releaseInspection);mini.addEventListener('pointercancel',releaseInspection);mini.addEventListener('focus',inspectFocus);mini.addEventListener('blur',releaseInspection);mini.addEventListener('keydown',inspectKey);window.addEventListener('blur',releaseInspection);
    const tracker = new RankTracker();
    let start = run?.startedAt ?? Date.now();
    const saved = !!run?.finishedAt, host = window as GameWindow;
    let pendingTime=0, lastPresentationTime=start, simSeconds=0, frameScale=1, frameIntensity=0, lastFrame=performance.now();
    let worldScale=INITIAL_ZOOM;
    const viewSize={x:W/INITIAL_ZOOM,y:H/INITIAL_ZOOM};
    // The reference renders 60 CSS pixels per world unit at 1x. Compensate for
    // this app's contained high-resolution canvas, including fullscreen/resizes.
    const measure=()=>{const el=stageRef.current,action=actionLayerRef.current;if(!el||!action)return;const scale=Math.min(el.clientWidth/W,el.clientHeight/H)||1;worldScale=INITIAL_ZOOM/scale;viewSize.x=W/worldScale;viewSize.y=H/worldScale;action.style.width=`${W*scale}px`;action.style.height=`${H*scale}px`;action.style.left=`${Math.round((el.clientWidth-W*scale)/2)}px`;action.style.top=`${Math.round((el.clientHeight-H*scale)/2)}px`;};
    const observer=new ResizeObserver(measure);if(stageRef.current)observer.observe(stageRef.current);measure();
    setStatus('코스를 불러오는 중');
    const finishCount=mapExtra?2:entrants.length;
    // Sound cues compare each frame with the last. The first look adopts the state silently, so reopening a finished or running
    // draw does not replay its fanfare; a countdown seen first still beeps. Hits come from markers the physics step leaves behind.
    const sfx=(name:Sfx)=>{if(!stageRef.current?.closest('[hidden]'))playSfx(name);};
    let cuePrimed=false,cueCountdown=0,cueMoving=false,cueArrived=0,cueFinished=false,cueSlow=false,cueTick=-1,cueEntities=0;
    function cueSounds(countdown:number,moving:boolean,finished:boolean,arrived:number,slow:boolean){
      if(!cuePrimed){cuePrimed=true;cueCountdown=countdown>0?countdown+1:0;cueMoving=moving;cueArrived=arrived;cueFinished=finished;cueSlow=slow;}
      if(countdown>0&&countdown!==cueCountdown)sfx('countdown');
      if(moving&&!cueMoving&&!finished)sfx('go');
      if(arrived>cueArrived&&!finished)sfx('finish');
      if(finished&&!cueFinished){sfx('win');setTimeout(()=>sfx('cheer'),500);}
      if(slow&&!cueSlow&&!finished)sfx('tension');
      cueCountdown=countdown;cueMoving=moving;cueArrived=arrived;cueFinished=finished;cueSlow=slow;
    }
    function cueHits(){
      if(!race)return;
      if(cueTick<0){cueTick=race.tick;cueEntities=race.entities.length;return;}
      if(race.marbles.some(m=>m.bumpTick>cueTick))sfx('pinballBounce');
      if(race.entities.some(e=>(e.hitTick??-1)>cueTick))sfx('pinballBumper');
      if(race.entities.length<cueEntities)sfx('pinballBreak');
      cueTick=race.tick;cueEntities=race.entities.length;
    }
    const complete = () => !!latest.current?.finishedAt || !!race && entrants.length > 0 && race.results.length >= finishCount;
    const order = () => latest.current?.finishedAt ? latest.current.results : (race?.results ?? []).slice(0,finishCount);
    let ranked: string[] = [];
    // Remaining marbles in rank order (smoothed by RankTracker), excluding ones already in the result.
    const remaining = () => { if (!race) return []; const arrived = order(); const byId = new Map(race.marbles.map(m => [m.item.id, m])); return ranked.map(id => byId.get(id)!).filter(m => m && !race!.done.has(m.item.id) && !arrived.includes(m.item.id)); };
    function text(value: string, x: number, y: number, size = 14, color = '#a7aeab', weight = 500, align: CanvasTextAlign = 'left', stroke?: string) {
      ctx!.font = `${weight} ${size}px ${font}`; ctx!.textAlign = align;
      if (stroke) { ctx!.strokeStyle = stroke; ctx!.lineWidth = 3; ctx!.lineJoin = 'round'; ctx!.strokeText(value, x, y); }
      ctx!.fillStyle = color; ctx!.fillText(value, x, y); ctx!.textAlign = 'left';
    }
    function pill(x: number, y: number, w: number, h: number, color: string, r = 5) { ctx!.beginPath(); ctx!.roundRect(x, y, w, h, r); ctx!.fillStyle = color; ctx!.fill(); }
    function circle(x: number, y: number, r: number, color: string) { ctx!.beginPath(); ctx!.arc(x, y, r, 0, Math.PI * 2); ctx!.fillStyle = color; ctx!.fill(); }
    const subjects=[...new Set(entrants.map(p=>p.label))];
    const colorFor=(index:number)=>{const label=entrants[index]?.label;return ({극락:'#d6bc80',나락:'#ce8e81',자연:'#a5bd99'} as Record<string,string>)[label]??MARBLE_COLORS[subjects.indexOf(label)%MARBLE_COLORS.length];};
    function marble(index: number, x: number, y: number, r: number, outline = false, tag = false) {
      const color = colorFor(index), img = images[index]; circle(x, y + 2, r + 2, '#0006'); circle(x, y, r + 1.5, color);
      if (img?.complete && img.naturalWidth && showPortraitsRef.current) {
        ctx!.save(); ctx!.beginPath(); ctx!.arc(x, y, r - 1, 0, Math.PI * 2); ctx!.clip(); const side = Math.min(img.naturalWidth, img.naturalHeight);
        ctx!.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) * .2, side, side, x - r, y - r, r * 2, r * 2); ctx!.restore();
      } else { circle(x, y, Math.max(1, r - 2), '#1b2224'); if (aceMode || mapMode || !showPortraitsRef.current) text(shortName(entrants[index]?.label ?? '', aceMode || mapMode), x, y + r * .26, Math.max(9, r * .74), color, 700, 'center'); else text(String(index + 1).padStart(2, '0'), x, y + 4, Math.max(9, r * .7), color, 700, 'center'); }
      if (outline) { ctx!.beginPath(); ctx!.arc(x, y, r + 3.5, 0, Math.PI * 2); ctx!.strokeStyle = '#ffffff'; ctx!.lineWidth = 2; ctx!.stroke(); }
      if (tag) { const label = shortName(entrants[index]?.label ?? '', aceMode || mapMode), size = Math.max(11, Math.round(r * .6)); ctx!.font = `700 ${size}px ${font}`; const w = ctx!.measureText(label).width + size * .7, h = size * 1.45, tx = x + r * .55, ty = y + r * .35; pill(tx, ty, w, h, '#0b0f10e6', h / 2); ctx!.strokeStyle = color + 'aa'; ctx!.lineWidth = 1; ctx!.beginPath(); ctx!.roundRect(tx, ty, w, h, h / 2); ctx!.stroke(); text(label, tx + w / 2, ty + h * .74, size, color, 700, 'center'); }
    }
    // Course geometry in world units. `scale` is pixels per unit so line widths and glow stay constant on screen.
    function course(scale: number, miniature = false, alpha = 1) {
      if (!race) return;
      ctx!.lineCap = 'round'; ctx!.lineJoin = 'round';
      for (const e of race.entities) {
        const p = e.body.GetPosition(), s = e.shape, angle = e.body.GetAngle(); ctx!.save(); ctx!.translate(p.get_x(), p.get_y()); ctx!.rotate(e.prevAngle + (angle - e.prevAngle) * alpha);
        const color = s.color ?? (e.rotating ? race.stage.accent : '#e8f1f2');
        const core = s.type === 'polyline' ? '#f4fbff' : color, haloColor = s.type === 'polyline' ? '#8fe0ff' : color;
        ctx!.beginPath();
        if (s.type === 'polyline') s.points.forEach(([x, y], i) => i ? ctx!.lineTo(x, y) : ctx!.moveTo(x, y));
        else if (s.type === 'box') { ctx!.rotate(s.rotation); ctx!.translate(e.arm, 0); ctx!.rect(-s.width, -s.height, s.width * 2, s.height * 2); }
        else ctx!.arc(0, 0, s.radius, 0, Math.PI * 2);
        // Neon: two soft halos under a bright core, breathing slowly so the outline shimmers.
        if (!miniature) { const pulse = .8 + .2 * Math.sin(performance.now() / 700); ctx!.globalAlpha = .18 * pulse; ctx!.strokeStyle = haloColor; ctx!.lineWidth = 30 / scale; ctx!.stroke(); ctx!.globalAlpha = .45 * pulse; ctx!.lineWidth = 11 / scale; ctx!.stroke(); ctx!.globalAlpha = 1; }
        if (s.type !== 'polyline') { ctx!.fillStyle = color + (miniature ? '' : '66'); ctx!.fill(); }
        if (e.life > 0 && !miniature) ctx!.setLineDash([.25, .18]);
        ctx!.strokeStyle = core; ctx!.lineWidth = (miniature ? 1 : 3) / scale; ctx!.stroke(); ctx!.setLineDash([]);
        if (e.rotating && !miniature) circle(0, 0, .14, '#fff3cc');
        ctx!.restore();
      }
      const goal = race.stage.goalY;
      for (let x = 12; x < 14; x += .5) for (let row = 0; row < 2; row++) { ctx!.fillStyle = (Math.round(x / .5) + row) % 2 ? '#22373b' : '#ddc69f'; ctx!.fillRect(x, goal + row * .25, .5, .25); }
    }
    // Cut-line marble, its rival and the slow-motion scale for this frame (after lazygyu's _updateMarbles/_calcTimeScale).
    function focusState() {
      const arrived = order(), active = remaining();
      const targetIndex = Math.max(0, Math.min(active.length - 1, selectedRank - 1 - arrived.length));
      const target = active[targetIndex], rival = active[targetIndex + 1] ?? active[targetIndex - 1];
      const intensityOf = (m?: { y: number }) => m && race ? finishIntensity(race.stage.zoomY, m.y) : 0;
      const focusOnRival = !!target && !!rival && intensityOf(rival) > intensityOf(target);
      const intensity = intensityOf(focusOnRival ? rival : target);
      const decided = arrived.length >= selectedRank;
      // Once the pick is decided the rest of the field is just clearing the course (3x); a lone last marble has nothing left to race, so 8x.
      return { arrived, active, targetIndex, target, rival, focusOnRival, intensity, scale: active.length <= 1 ? 8 : decided ? 3 : timeScale(intensity, !!rival) };
    }
    function advance(budget = 400) {
      if (!race || !run || saved || complete()) return;
      const now=Date.now()+virtualOffset;
      if(now<start)return;
      pendingTime+=Math.max(0,now-Math.max(start,lastPresentationTime));lastPresentationTime=now;
      const cost=10/(frameScale*speedRef.current);
      while(race.results.length<finishCount&&budget-->0){if(pendingTime<cost)break;pendingTime-=cost;race.step();simSeconds+=.01;}
      cueHits();
      if (race.results.length >= finishCount && !sent) { sent = true; callback.current?.(race.results.slice(0,finishCount)); }
    }
    function render() {
      if (!ctx || !race || disposed) return;
      const finished = complete(), countdown = run && !finished ? Math.ceil((start - Date.now() - virtualOffset) / 1000) : 0, moving = !!run && countdown <= 0;
      // Rank the remaining marbles with the physics time that elapsed since the last frame.
      const live = race.marbles.filter(m => !race!.done.has(m.item.id));
      ranked = tracker.update(live.map(m => ({ id: m.item.id, x: m.x, y: m.y })), (x, y) => race!.progress.distanceAt(x, y), simSeconds); simSeconds = 0;
      const state = focusState(); frameScale = moving && !finished ? state.scale : 1; frameIntensity = state.intensity;
      // Draw between the last two physics steps so slow motion (one 10ms step per several frames) still glides.
      const alpha = moving && !finished && !saved ? Math.max(0, Math.min(1, pendingTime / (10 / (frameScale * speedRef.current)))) : 1;
      const mx = (m: { x: number; px: number }) => m.px + (m.x - m.px) * alpha, my = (m: { y: number; py: number }) => m.py + (m.y - m.py) * alpha;
      cueSounds(countdown, moving, finished, state.arrived.length, moving && !finished && frameScale < .9);
      const { arrived, active } = state, frameNow = performance.now(), dt = Math.min(100, frameNow - lastFrame); lastFrame = frameNow;
      if(inspection)camera.inspect(inspection,dt);
      else if (moving && active.length) {
        const marbles = active.map(m => ({ id: m.item.id, x: mx(m), y: my(m) }));
        // Match the reference: front pair first, then the winning cut-line; zoom
        // intensity uses that same cut-line throughout, just like slow motion.
        // Wheel of fortune uses free pair tracking; our old scripted room
        // centres overrode it and introduced extra pans/1.5x zooms mid-course.
        camera.update({ ...cameraFocus(marbles, state.targetIndex, arrived.length, race.stage.zoomY), marbles, zones: [], viewSize, dt });
      } else { camera.update({ intensity: 0, focusOnRival: false, zones: [], viewSize, dt }); }
      const Z = worldScale * camera.zoom, sx = (x: number) => W / 2 + (x - camera.position.x) * Z, sy = (y: number) => H / 2 + (y - camera.position.y) * Z;
      ctx.fillStyle = '#0b0f10'; ctx.fillRect(0, 0, W, H);
      ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(Z, Z); ctx.translate(-camera.position.x, -camera.position.y);
      course(Z, false, alpha);
      active.forEach(m => { ctx.beginPath(); m.trail.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.lineWidth = .07; ctx.strokeStyle = colorFor(m.index) + '40'; ctx.stroke(); });
      ctx.restore();
      const target = state.target;
      active.slice().reverse().forEach(m => { const x = sx(mx(m)), y = sy(my(m)); if (x > -40 && x < W + 40 && y > -40 && y < H + 40) marble(m.index, x, y, Math.max(8, .25 * Z), moving && !finished && arrived.length > 0 && m === target, showNamesRef.current && !finished); });
      // HUD: title line, minimap, standings.
      const left = MINI_INSET * 2 + MINI_UNITS * MINI_SCALE;
      text(mapMode?'경기 맵 추첨':aceMode?'ACE 결정전':PINBALL_MAPS[mapIndex], left, 30, 20, '#e8e7df', 700, 'left', '#000000');
      text(mapMode?(mapExtra?`${mapPool+1}·${mapPool+2}경기 · 먼저 도착한 2개`:`1~${mapPool}경기 · 도착순`):!lastWinner?'첫번째 당첨':'마지막 당첨', left + 230, 30, 14, '#c9c8b6', 500, 'left', '#000000');
      text(finished ? '완료' : !run ? '대기' : countdown > 0 ? '출발 준비' : frameScale < 1 ? 'SLOW' : frameScale > 1 ? '정리 중' : '진행 중', W - 300, 30, 13, '#d0bc94', 600, 'right', '#000000');
      text(`${String(Math.floor(race.tick / 6000)).padStart(2, '0')}:${String(Math.floor(race.tick / 100) % 60).padStart(2, '0')}`, W - 200, 30, 16, '#c0c5bf', 600, 'right', '#000000');
      const ms = Math.min(MINI_SCALE, (H - MINI_INSET * 2) / (race.stage.goalY + 2)), mw = MINI_UNITS * ms, mh = (race.stage.goalY + 2) * ms;
      ctx.fillStyle = '#161c1d'; ctx.fillRect(MINI_INSET, MINI_INSET, mw, mh);
      ctx.save(); ctx.beginPath(); ctx.rect(MINI_INSET, MINI_INSET, mw, mh); ctx.clip(); ctx.translate(MINI_INSET, MINI_INSET); ctx.scale(ms, ms);
      course(ms, true);
      active.forEach(m => circle(mx(m), my(m), .55, colorFor(m.index)));
      ctx.strokeStyle = '#ffffffcc'; ctx.lineWidth = 1 / ms; ctx.strokeRect(camera.position.x - W / Z / 2, camera.position.y - H / Z / 2, W / Z, H / Z);
      ctx.restore();
      ctx.strokeStyle = inspection?'#f0ce86':'#4caf50'; ctx.lineWidth = inspection?2:1; ctx.strokeRect(MINI_INSET + .5, MINI_INSET + .5, mw - 1, mh - 1);
      if(inspection){const y=MINI_INSET+inspection.y*ms;ctx.strokeStyle='#f0ce86';ctx.beginPath();ctx.moveTo(MINI_INSET,y);ctx.lineTo(MINI_INSET+mw,y);ctx.stroke();text('코스 살펴보는 중',left,54,13,'#f0ce86');}
      const standings = [...arrived.map(id => race!.marbles.find(m => m.item.id === id)!), ...active];
      if (mapMode) {
        const schedule=[...(run?.mapOpening??[]),...arrived];
        text('경기 맵', W - 14, 150, 16, '#d7dcd6', 700, 'right', '#000000'); text(`${(run?.mapOpening?.length??0)+arrived.length} / ${mapGames}`, W - 14, 170, 13, '#9caaa1', 600, 'right', '#000000');
        for(let i=0;i<mapGames;i++){const id=schedule[i],m=race.marbles.find(p=>p.item.id===id),y=198+i*Math.min(30,Math.floor(600/Math.max(1,mapGames)));text(`${i+1}경기  ${m?.item.label??'대기'}`,W-14,y,16,m?'#eee7d6':'#5b6b62',700,'right','#000000');}
      } else {
        text('도착 순위', W - 14, 150, 16, '#d7dcd6', 700, 'right', '#000000'); text(`${arrived.length} / ${entrants.length}`, W - 14, 170, 13, '#9caaa1', 600, 'right', '#000000');
        const maxRows = Math.floor((H - 220) / 22), rows = standings.slice(0, maxRows); if (selectedRank > maxRows && standings[selectedRank - 1]) rows[maxRows - 1] = standings[selectedRank - 1];
        rows.forEach(m => { if (!m) return; const place = standings.indexOf(m) + 1, i = rows.indexOf(m), y = 196 + i * 22, chosen = place === selectedRank, done = arrived.includes(m.item.id);
          if (chosen) { pill(W - 184, y - 16, 174, 22, '#ffd70026', 3); ctx.fillStyle = '#ffd700cc'; ctx.fillRect(W - 184, y - 16, 3, 22); }
          text(`${done ? '✓ ' : ''}${m.item.label.length > 6 ? m.item.label.slice(0, 6) + '…' : m.item.label} #${place}`, W - 14, y, done ? 16 : 15, colorFor(m.index), done ? 700 : 500, 'right', '#000000'); });
        if (standings.length > maxRows) text(`외 ${standings.length - maxRows}명`, W - 14, 196 + maxRows * 22, 13, '#8a958f', 500, 'right');
      }
      if (run && countdown > 0 && !finished) { pill(W / 2 - 80, H / 2 - 86, 160, 172, '#0b0f10f0', 12); text(String(countdown), W / 2, H / 2 + 18, 84, '#e1c595', 600, 'center'); text('잠시 후 출발', W / 2, H / 2 + 58, 17, '#b9c2b9', 500, 'center'); }
      if(mapMode&&finished&&!inspection){
        const schedule=[...(run?.mapOpening??[]),...arrived];
        pill(W/2-230,H/2-200,460,420,'#131a1bf8',10);text(run?.mapFormat==='winners'&&!mapExtra?`1~${mapPool}경기 확정 · ${mapPool+1}·${mapPool+2}경기 추첨 대기`:'경기 맵 확정',W/2,H/2-160,22,'#dcc598',700,'center');
        for(let i=0;i<schedule.length;i++){const m=race.marbles.find(p=>p.item.id===schedule[i]),y=H/2-114+i*Math.min(36,Math.floor(320/Math.max(1,schedule.length)));text(`${i+1}경기`,W/2-150,y+6,17,'#a8b6aa',600);text(m?.item.label??'대기',W/2+50,y+6,24,'#f0eee3',700,'center');}
      } else if (!inspection&&(finished || !lastWinner&&arrived.length>0)) {
        // A short landscape card near the top: the settings panel reopens over the lower stage once the draw ends and used to hide
        // the winner's name when the card sat in the middle.
        const winner = race.marbles.find(m => m.item.id === arrived[selectedRank - 1]), top = 56, left = W / 2 - 230;
        pill(left, top, 460, 170, '#131a1bf8', 10); if (winner) marble(winner.index, left + 85, top + 85, 50);
        text(!lastWinner?'첫번째 당첨':'마지막 당첨', left + 160, top + 50, 18, '#d5bb8e', 600, 'left');
        text(winner?.item.label ?? '추첨 완료', left + 160, top + 104, 40, '#f1ece0', 700, 'left'); text('추첨 완료', left + 160, top + 140, 16, '#9cb3bf', 500, 'left');
      }
    }
    function frame() { if (disposed) return; advance(); if (!stageRef.current?.closest('[hidden]')) render(); raf = requestAnimationFrame(frame); }
    const debug = () => JSON.stringify({ mode: !race ? 'loading' : !run ? 'ready' : complete() ? 'complete' : Date.now() + virtualOffset < start ? 'countdown' : 'racing', coordinates: 'world meters, origin top-left, x right, y down', map: mapIndex, tick: race?.tick, camera: { x: camera.position.x, y: camera.position.y, zoom: camera.zoom,inspection }, minimap:race?{x:MINI_INSET,y:MINI_INSET,width:MINI_UNITS*MINI_SCALE,height:(race.stage.goalY+2)*MINI_SCALE}:null,rotors:race?.entities.filter(e=>e.rotating).map(e=>({length:e.shape.type==='box'?e.shape.width*2:0,speed:e.body.GetAngularVelocity(),angle:e.body.GetAngle()})), timeScale: frameScale, intensity: frameIntensity, selectedSpeed:speedRef.current, seed:run?.seed, targetRank: selectedRank, results: order(), balls: remaining().map(m => ({ id: m.item.id, name: m.item.label, x: m.x, y: m.y })) });
    const advanceTime = (ms: number) => { virtualOffset += Math.max(0, ms); advance(60000); render(); };
    createPinball(entrants, run?.seed ?? previewSeed, mapIndex).then(value => {
      if (disposed) { value.dispose(); return; } race = value; setStatus('');
      const ms=Math.min(MINI_SCALE,(H-MINI_INSET*2)/(race.stage.goalY+2));mini.style.width=`${MINI_UNITS*ms/W*100}%`;mini.style.height=`${(race.stage.goalY+2)*ms/H*100}%`;releaseInspection();
      // Marbles drop the moment the course is ready; persisted timestamps remain the run identity.
      if (run && !saved && start < Date.now()) start = Date.now();
      if (import.meta.env.DEV) { host.render_game_to_text = debug; host.advanceTime = advanceTime; } frame();
    }).catch(error => { if (!disposed) { setStatus('코스를 불러오지 못했습니다. 다시 시작해주세요.'); console.error(error); } });
    return () => { disposed = true; observer.disconnect();cancelAnimationFrame(raf);race?.dispose();releaseInspection();mini.removeEventListener('pointermove',inspectPointer);mini.removeEventListener('pointerdown',inspectDown);mini.removeEventListener('pointerup',inspectUp);mini.removeEventListener('pointerleave',releaseInspection);mini.removeEventListener('pointercancel',releaseInspection);mini.removeEventListener('focus',inspectFocus);mini.removeEventListener('blur',releaseInspection);mini.removeEventListener('keydown',inspectKey);window.removeEventListener('blur',releaseInspection);if (host.render_game_to_text === debug) { delete host.render_game_to_text; delete host.advanceTime; } };
    // Result updates preserve the physical race and its final frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.seed, run?.startedAt, itemKey, selectedRank, mapIndex, variant, lastWinner, mapMode, aceMode, mapExtra, mapGames, mapPool, run?undefined:previewSeed]);

  return <div className="pinball-stage" ref={stageRef}>
    <canvas className="draw-canvas pinball-canvas" ref={canvasRef} aria-label="핀볼 추첨 화면"/>
    <div className="pinball-action-layer" ref={actionLayerRef}><button className="pinball-minimap-control" ref={miniRef} aria-label="미니맵 탐색" title="마우스를 올려 코스 보기 · 벗어나면 자동 추적 · 방향키로 이동, Esc로 복귀"/>{onCopyMaps&&run?.finishedAt?<button className="button pinball-map-copy" onClick={onCopyMaps}><Copy size={15}/>결과 복사하기</button>:null}{onNextDraw&&run?.finishedAt&&mapMode&&run.mapFormat==='winners'&&!mapExtra?<button className="button primary pinball-map-copy pinball-map-next" onClick={onNextDraw}><Play size={15} fill="currentColor"/>{`${mapPool+1}·${mapPool+2}경기 추첨`}</button>:null}</div>
    {status ? <div className="pinball-loading" role="status">{status}</div> : null}
    <div className="pinball-speed-controls" role="group" aria-label="핀볼 재생 속도">{([1,2,4] as const).map(value=><button key={value} aria-label={`${value}배속`} aria-pressed={speed===value} onClick={()=>{speedRef.current=value;setSpeed(value);}}>{value}×</button>)}</div>
    <button className="pinball-fullscreen" title="전체 화면 · F" aria-label={fullscreen ? '핀볼 전체 화면 종료' : '핀볼 전체 화면'} onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); else void stageRef.current?.requestFullscreen().catch(() => {}); }}>{fullscreen ? <Minimize2 size={14}/> : <Maximize2 size={14}/>}</button>
  </div>;
}
