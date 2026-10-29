import { useEffect, useRef, useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import * as THREE from 'three';
import { givenName, type DrawItem, type DrawRun } from './domain';
import { createRace, MARBLE_R, RACE_TRACKS, RACE_THEMES, ROAD_HALF, sampleAt, seconds, STEP, type Sample } from './race';
import { buildRaceWorld, marbleTexture } from './raceWorld';
import { portraitUrl } from './roster';
import { createFinishSlowMotion } from './racePlayback';

type Race = Awaited<ReturnType<typeof createRace>>;
type GameWindow = Window & { render_game_to_text?: () => string; advanceTime?: (ms: number) => void };
type Row = { id: string; label: string; color: string; done: boolean; detail: string; portrait: string | null; x: number; z: number; progress: number };
type Hud = { status: string; clock: string; countdown: number; rows: Row[]; finished: number; total: number; winner: Row | null; podium: Row[]; complete: boolean };
const EMPTY: Hud = { status: '대기', clock: '00:00', countdown: 0, rows: [], finished: 0, total: 0, winner: null, podium: [], complete: false };
const MARBLE_COLORS=['#ff794d','#369eff','#c562e9','#75c440','#f14b6e','#ffc632','#24c8ac','#8271ed','#f46ea7','#39bfde'];

// Quads between consecutive samples that pass `keep`, laid a hair above the road (ice tint, booster pads).
function stripGeometry(samples: Sample[], keep: (s: Sample) => boolean, half = ROAD_HALF, lift = .03) {
  const pos: number[] = [], idx: number[] = [];
  for (let i = 0; i < samples.length - 1; i++) {
    const a = samples[i], b = samples[i + 1]; if (!keep(a) || !keep(b) || a.gap || b.gap) continue;
    const base = pos.length / 3;
    for (const [q, sign] of [[a, -1], [a, 1], [b, 1], [b, -1]] as const) { const v = q.p.clone().addScaledVector(q.side, sign * half).addScaledVector(q.up, lift); pos.push(v.x, v.y, v.z); }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}

export default function RaceStage({ run, items, map = 0, previewSeed = 412, showNames = true, showPortraits = true, onFinish }: { run: DrawRun | null; items: DrawItem[]; map?: number; previewSeed?: number; showNames?: boolean; showPortraits?: boolean; onFinish?: (ids: string[]) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null), stageRef = useRef<HTMLDivElement>(null), labelsRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false), [status, setStatus] = useState(''), [hud, setHud] = useState<Hud>(EMPTY);
  const [speed, setSpeed] = useState(1.5); const speedRef = useRef(1.5);
  const [boardOpen,setBoardOpen]=useState(true),[view,setView]=useState<'chase'|'overview'>('chase');const viewRef=useRef(view);viewRef.current=view;
  const [mini,setMini]=useState({path:'',viewBox:'0 0 100 100'});
  const callback = useRef(onFinish); callback.current = onFinish;
  const showNamesRef = useRef(showNames); showNamesRef.current = showNames;
  const showPortraitsRef = useRef(showPortraits); showPortraitsRef.current = showPortraits;
  const latest = useRef(run); latest.current = run;
  const itemKey = JSON.stringify((run?.items ?? items).map(p => [p.id, p.label])), trackIndex = run?.map ?? map;
  const sceneSeed=run?.seed??previewSeed;

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
    const canvas = canvasRef.current, stageNode = stageRef.current, labelNode = labelsRef.current; if (!canvas || !stageNode || !labelNode) return;
    const stage: HTMLDivElement = stageNode, labelLayer: HTMLDivElement = labelNode;
    const entrants: DrawItem[] = JSON.parse(itemKey).map(([id, label]: string[]) => ({ id, label }));
    const subjects = [...new Set(entrants.map(p => p.label))], colorFor = (index: number) => MARBLE_COLORS[subjects.indexOf(entrants[index]?.label) % MARBLE_COLORS.length];
    const portraits = entrants.map(p => portraitUrl({ name: p.label }) ?? null);
    let renderer: THREE.WebGLRenderer; try {
      // React reuses the canvas across themes; reset pixel-upload flags before Three creates its default textures.
      const gl=canvas.getContext('webgl2',{antialias:true,powerPreference:'high-performance'});
      if(!gl)throw new Error('WebGL 2 unavailable');
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
      renderer = new THREE.WebGLRenderer({ canvas,context:gl, antialias: true, powerPreference: 'high-performance' });
    } catch (error) { setStatus('이 화면은 WebGL을 쓸 수 없습니다.'); console.error(error); return; }
    renderer.setPixelRatio(Math.min(1.5, devicePixelRatio || 1));
    renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.35;
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(60, 16 / 9, .1, 1800);
    const resize = () => { const w = Math.max(1, stage.clientWidth), h = Math.max(1, stage.clientHeight); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
    const observer = new ResizeObserver(resize); observer.observe(stage); resize();
    let race: Race | undefined, disposed = false, raf = 0, sent = false, virtualOffset = 0, started = false, hudAt = 0;
    let start = run?.startedAt ?? Date.now();
    const host = window as GameWindow,sceneId=crypto.randomUUID();let runStamp=run?.startedAt;
    const clockOrigin=performance.now(),epochOrigin=Date.now(),clockNow=()=>epochOrigin+performance.now()-clockOrigin+virtualOffset;
    let pendingTime = 0, lastPresentationTime = start, frameScale = 1, lastStepCost=STEP*1000/1.5, lastFrame = performance.now();
    let finishSlow = createFinishSlowMotion(), finalDuel = false, playbackAt = clockNow();
    const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), target = new THREE.Vector3(), look = new THREE.Vector3();
    const marbleMeshes: THREE.Mesh[] = [], obstacleMeshes: THREE.Object3D[] = [], labels: HTMLDivElement[] = [];
    const marbleShadows:THREE.Mesh[]=[];let worldArt:ReturnType<typeof buildRaceWorld>|undefined;
    const previousRotation=new THREE.Quaternion(),currentRotation=new THREE.Quaternion(),worldUp=new THREE.Vector3(0,0,1);
    const overviewCenter=new THREE.Vector3(),overviewOffset=new THREE.Vector3();
    const labelOffsets=entrants.map(()=>({x:0,y:0,ready:false,width:0}));
    let labelMeasureAt=0,lastPortraits=showPortraitsRef.current;
    setStatus('트랙을 준비하는 중'); setHud(EMPTY);
    const complete = () => !!latest.current?.finishedAt || !!race && entrants.length > 0 && race.results.length >= entrants.length;
    const order = () => latest.current?.finishedAt ? latest.current.results : (race?.results ?? []);
    const live = () => race ? race.marbles.filter(m => !race!.done.has(m.item.id) && !order().includes(m.item.id)).sort((p, q) => q.progress - p.progress) : [];
    function syncRun(){
      if(latest.current?.startedAt===runStamp)return;
      runStamp=latest.current?.startedAt;start=runStamp??clockNow();
      pendingTime=0;lastPresentationTime=start;virtualOffset=0;frameScale=1;lastFrame=performance.now();
      finishSlow=createFinishSlowMotion();finalDuel=false;playbackAt=clockNow();
    }
    function build(value: Race) {
      const { track, samples, geometry } = value;
      scene.background = new THREE.Color(track.sky[0]); scene.fog = new THREE.Fog(track.sky[1], trackIndex===5?220:110, trackIndex===5?1400:trackIndex===1?650:430);
      scene.add(new THREE.HemisphereLight('#dcefff', '#7b7668', 2));
      const sun = new THREE.DirectionalLight('#fff1d5', 2.5); sun.position.set(60, 140, 40); scene.add(sun);
      worldArt=buildRaceWorld(scene,track,samples,trackIndex,value.finish);
      const bounds=new THREE.Box3().setFromPoints(samples.map(s=>s.p));setMini({path:samples.filter((_,i)=>i%6===0).map((s,i)=>`${i?'L':'M'}${s.p.x.toFixed(1)},${s.p.z.toFixed(1)}`).join(' '),viewBox:`${bounds.min.x-12} ${bounds.min.z-12} ${bounds.max.x-bounds.min.x+24} ${bounds.max.z-bounds.min.z+24}`});
      bounds.getCenter(overviewCenter);const radius=bounds.getSize(tmp).length()*.65;overviewOffset.set(radius*.75,radius*.8,radius*.65);
      const wallGeo = new THREE.BufferGeometry(); wallGeo.setAttribute('position', new THREE.Float32BufferAttribute(geometry.wall, 3)); wallGeo.setIndex(geometry.wallIdx); wallGeo.computeVertexNormals();
      scene.add(new THREE.Mesh(wallGeo, new THREE.MeshStandardMaterial({ color: track.wall, roughness: .5, transparent: true, opacity: .22, depthWrite:false, side: THREE.DoubleSide })));
      scene.add(new THREE.Mesh(stripGeometry(samples, s => s.ice), new THREE.MeshStandardMaterial({ color: '#cfe9ff', emissive: '#9fd8ff', emissiveIntensity: .25, roughness: .1, transparent: true, opacity: .45 })));
      for (const z of value.boosters) scene.add(new THREE.Mesh(stripGeometry(samples, s => Math.abs(s.s - z.s) < 2.5, ROAD_HALF - .6, .05), new THREE.MeshBasicMaterial({ color: track.accent, transparent: true, opacity: .55 })));
      // Finish line: a checker strip on the road and a glowing gate bar above it.
      const finishSample = samples.reduce((best, s) => Math.abs(s.s - value.finish) < Math.abs(best.s - value.finish) ? s : best, samples[0]);
      const checker = document.createElement('canvas'); checker.width = 64; checker.height = 8; const c2 = checker.getContext('2d')!; for (let i = 0; i < 8; i++) { c2.fillStyle = i % 2 ? '#111' : '#eee'; c2.fillRect(i * 8, 0, 8, 8); }
      scene.add(new THREE.Mesh(stripGeometry(samples, s => Math.abs(s.s - value.finish) < 1.2, ROAD_HALF, .06), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(checker) })));
      const gate = new THREE.Mesh(new THREE.BoxGeometry(ROAD_HALF * 2 + 1, .25, .25), new THREE.MeshStandardMaterial({ color: track.accent, emissive: track.accent, emissiveIntensity: .8 })); gate.position.copy(finishSample.p).addScaledVector(finishSample.up, 4); gate.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), finishSample.side); scene.add(gate);
      for (const o of value.obstacles) {
        const mat = new THREE.MeshStandardMaterial({ color: track.accent, emissive: track.accent, emissiveIntensity: o.kind === 'bumper' ? .6 : .3, roughness: .4 });
        const geo = o.kind === 'bumper' ? new THREE.SphereGeometry(o.size[0], 18, 12) : o.kind === 'peg' || o.kind === 'piston' ? new THREE.CylinderGeometry(o.size[0], o.size[0], o.size[1], 12) : new THREE.BoxGeometry(o.size[0] * 2, o.size[1] * 2, o.size[2] * 2);
        const mesh = new THREE.Mesh(geo, mat); scene.add(mesh); obstacleMeshes.push(mesh);
        if(o.kind==='bumper'||o.kind==='peg'){const ring=new THREE.Mesh(new THREE.TorusGeometry(o.size[0]*1.02,.09,6,24),new THREE.MeshBasicMaterial({color:'#fff1c0'}));ring.rotation.x=Math.PI/2;ring.position.y=o.kind==='peg'?.3:0;mesh.add(ring);}
        if(o.kind==='spinner'){const hub=new THREE.Mesh(new THREE.CylinderGeometry(.5,.6,1.1,16),new THREE.MeshStandardMaterial({color:'#e8dfbd',metalness:.45,roughness:.3}));mesh.add(hub);}
        if(o.kind==='piston'){
          mat.color.set('#edae47');mat.emissive.set('#65431b');mat.emissiveIntensity=.18;
          for(const y of [-.28,.25]){const band=new THREE.Mesh(new THREE.CylinderGeometry(.425,.425,.13,12),new THREE.MeshStandardMaterial({color:'#3b4147',roughness:.6}));band.position.y=y;mesh.add(band);}
          const q=sampleAt(samples,o.size[2]),collar=new THREE.Mesh(new THREE.TorusGeometry(.48,.035,6,20),new THREE.MeshStandardMaterial({color:'#644c39',roughness:.8}));
          collar.position.copy(q.p).addScaledVector(q.side,o.size[3]).addScaledVector(q.up,.015);collar.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),q.up);scene.add(collar);
        }
        if(o.kind==='sweeper'){
          mat.color.set('#288e91');mat.emissive.set('#16464b');mat.emissiveIntensity=.2;
          for(const x of [-1.3,-.5,.3,1.1]){const marker=new THREE.Mesh(new THREE.BoxGeometry(.22,.58,.39),new THREE.MeshStandardMaterial({color:'#ffe2ac',roughness:.6}));marker.position.x=x;mesh.add(marker);}
          const hinge=new THREE.Mesh(new THREE.CylinderGeometry(.32,.38,.95,12),new THREE.MeshStandardMaterial({color:'#73533d',metalness:.3,roughness:.6}));hinge.position.x=o.size[3]*1.9;mesh.add(hinge);
        }
        if(o.kind==='gate'){
          mat.color.set('#26313e');mat.emissive.set('#26313e');mat.emissiveIntensity=.1;
          // Readable hazard slats on both faces, moving with the actual collider.
          for(const face of [-1,1])for(let x=-2.4;x<=2.4;x+=.8){const stripe=new THREE.Mesh(new THREE.BoxGeometry(.32,1.35,.025),new THREE.MeshStandardMaterial({color:'#ffd168',emissive:'#ffbd48',emissiveIntensity:.35}));stripe.position.set(x,0,face*.415);stripe.rotation.z=-.28;mesh.add(stripe);}
          const top=new THREE.Mesh(new THREE.BoxGeometry(5.6,.09,.86),new THREE.MeshBasicMaterial({color:track.accent}));top.position.y=.81;mesh.add(top);
        }
      }
      entrants.forEach((entrant, i) => {
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(MARBLE_R, 28, 20), new THREE.MeshPhysicalMaterial({ map:marbleTexture(colorFor(i)), roughness: .18, metalness: .12,clearcoat:1,clearcoatRoughness:.12 })); scene.add(mesh); marbleMeshes.push(mesh);
        const shadow=new THREE.Mesh(new THREE.CircleGeometry(.6,20),new THREE.MeshBasicMaterial({color:'#0c1620',transparent:true,opacity:.25,depthWrite:false}));scene.add(shadow);marbleShadows.push(shadow);
        const label = document.createElement('div'); label.className = 'race-label'; label.style.display = 'none'; const dot = document.createElement('i'); dot.style.background = colorFor(i); label.append(dot);
        if (portraits[i]) { const img = document.createElement('img'); img.src = portraits[i]!; img.alt = ''; label.append(img); }
        label.append(document.createTextNode(givenName(entrant.label))); labelLayer.append(label); labels.push(label);
      });
      const s0 = samples.find(s=>s.s>=9)!; camPos.copy(s0.p).addScaledVector(s0.up, 11).addScaledVector(s0.tangent, -17).addScaledVector(s0.side,4); camLook.copy(s0.p).addScaledVector(s0.tangent,10);
    }
    function advance(budget = 600) {
      syncRun();const run=latest.current,saved=!!run?.finishedAt;
      if (!race || !run || saved || complete()) return;
      const now = clockNow(); if (now < start) return;
      if (!started) { started = true; race.start(); }
      pendingTime += Math.max(0, now - Math.max(start, lastPresentationTime)); lastPresentationTime = now;
      const cost = STEP * 1000 / (frameScale * speedRef.current);
      lastStepCost=cost;
      while (race.results.length < entrants.length && budget-- > 0) { if (pendingTime < cost) break; pendingTime -= cost; race.step(); }
      if (race.results.length >= entrants.length && !sent) { sent = true; callback.current?.(race.results); }
    }
    function render() {
      if (!race || disposed) return;
      syncRun();const run=latest.current,saved=!!run?.finishedAt;
      const finished = complete(), countdown = run && !finished ? Math.ceil((start - clockNow()) / 1000) : 0, moving = !!run && countdown <= 0;
      const arrived = order(), active = live(), decided = arrived.length >= 1, leader = active[0];
      const frameNow = performance.now(), dt = Math.min(100, frameNow - lastFrame); lastFrame = frameNow;
      // Ease automatic slow-motion/catch-up changes instead of abruptly jumping speed.
      const presentationNow=clockNow(),playbackDelta=Math.max(0,presentationNow-playbackAt);playbackAt=presentationNow;
      const playback = finishSlow.update({ now: presentationNow, moving, finished, progress: active.map(m=>m.progress), finish: race.finish, arrived: arrived.length, speed: speedRef.current });
      finalDuel=playback.slow;
      frameScale += (playback.scale-frameScale)*(1-Math.exp(-playbackDelta/180));
      const alpha = moving && !finished && !saved ? Math.max(0, Math.min(1, pendingTime / lastStepCost)) : 1;
      race.marbles.forEach((m, i) => { const mesh = marbleMeshes[i], gone = race!.done.has(m.item.id) || arrived.includes(m.item.id); mesh.visible = !gone;const shadow=marbleShadows[i];shadow.visible=!gone; if (gone) return; mesh.position.set(m.px + (m.x - m.px) * alpha, m.py + (m.y - m.py) * alpha, m.pz + (m.z - m.pz) * alpha); previousRotation.set(m.body.previousQuaternion.x,m.body.previousQuaternion.y,m.body.previousQuaternion.z,m.body.previousQuaternion.w);currentRotation.set(m.body.quaternion.x,m.body.quaternion.y,m.body.quaternion.z,m.body.quaternion.w);mesh.quaternion.slerpQuaternions(previousRotation,currentRotation,alpha);const q=race!.samples[m.sampleIndex];shadow.position.copy(mesh.position);shadow.position.y=race!.started?q.p.y+.04:mesh.position.y-MARBLE_R;shadow.quaternion.setFromUnitVectors(worldUp,q.up); });
      worldArt?.animate(frameNow/1000);
      race.obstacles.forEach((o, i) => { const mesh = obstacleMeshes[i],p=o.body.previousPosition,c=o.body.position; mesh.position.set(p.x+(c.x-p.x)*alpha,p.y+(c.y-p.y)*alpha,p.z+(c.z-p.z)*alpha); previousRotation.set(o.body.previousQuaternion.x,o.body.previousQuaternion.y,o.body.previousQuaternion.z,o.body.previousQuaternion.w);currentRotation.set(o.body.quaternion.x,o.body.quaternion.y,o.body.quaternion.z,o.body.quaternion.w);mesh.quaternion.slerpQuaternions(previousRotation,currentRotation,alpha); });
      // Camera: orbit overview before the race, top view in the countdown, chase the front pack while racing, hold the finish after.
      if (viewRef.current==='overview') {target.copy(overviewCenter).add(overviewOffset);look.copy(overviewCenter);}
      else if (!run||!moving) { const s0 = race.samples.find(s=>s.s>=9)!; target.copy(s0.p).addScaledVector(s0.up, 11).addScaledVector(s0.tangent, -17).addScaledVector(s0.side,4+Math.sin(frameNow/6000)*1.5); look.copy(s0.p).addScaledVector(s0.tangent, 10); }
      else if (active.length) {
        const pack = active.slice(0, finalDuel ? 2 : 5), weights = pack.map((m, i) => finalDuel ? 1 : i ? Math.max(0,1-Math.abs(pack[0].progress-m.progress)/32) : 1.4), total = weights.reduce((a, b) => a + b, 0);
        tmp.set(0, 0, 0); pack.forEach((m, i) => tmp.addScaledVector(marbleMeshes[m.index].position,weights[i])); tmp.divideScalar(total);
        const spread = Math.min(24,pack.length > 1 ? Math.abs(pack[0].progress - pack[pack.length - 1].progress) : 0), meanProgress=pack.reduce((a,m,i)=>a+m.progress*weights[i],0)/total,s = race.samples.reduce((a,b)=>Math.abs(a.s-meanProgress)<Math.abs(b.s-meanProgress)?a:b);
        const finishFocus=Math.max(0,1-(race.finish-pack[0].progress)/32);
        target.copy(tmp).addScaledVector(s.tangent, -(12 + spread * .28-finishFocus*1.8)).add(tmp2.set(0, 6.8 + spread * .16-finishFocus*.7, 0)); look.copy(tmp).addScaledVector(s.tangent, 5);
      } else { const s = race.samples[race.samples.length - 1]; target.copy(s.p).addScaledVector(s.up, 14).addScaledVector(s.tangent, -16); look.copy(s.p); }
      camPos.lerp(target, 1-Math.exp(-dt/190)); camLook.lerp(look, 1-Math.exp(-dt/145));
      const cameraSubject=leader;
      const finishTension=moving&&cameraSubject?Math.max(0,1-(race.finish-cameraSubject.progress)/32):0;
      const desiredFov=viewRef.current==='overview'?60:!moving?60:58+Math.min(6,(cameraSubject?.body.velocity.length()??0)*.2)-finishTension*10;
      const nextFov=camera.fov+(desiredFov-camera.fov)*(1-Math.exp(-dt/450));
      if(Math.abs(nextFov-camera.fov)>.002){camera.fov=nextFov;camera.updateProjectionMatrix();}
      camera.position.copy(camPos); camera.lookAt(camLook);
      renderer.render(scene, camera);
      const w = stage.clientWidth, h = stage.clientHeight;
      // Batch visibility/measurement, then only compositor transforms during motion.
      const projected=marbleMeshes.map((mesh,i)=>{
        const label=labels[i];tmp.copy(mesh.position).add(tmp2.set(0,MARBLE_R+.7,0)).project(camera);
        const visible=showNamesRef.current&&mesh.visible&&!finished&&tmp.z<=1&&Math.abs(tmp.x)<=1&&Math.abs(tmp.y)<=1;
        label.style.display=visible?'flex':'none';
        const img=label.querySelector('img');if(img)img.style.display=showPortraitsRef.current?'':'none';
        return visible?{i,x:(tmp.x+1)/2*w,y:(1-tmp.y)/2*h}:null;
      }).filter((p):p is {i:number;x:number;y:number}=>p!==null);
      if(frameNow-labelMeasureAt>500||lastPortraits!==showPortraitsRef.current||projected.some(p=>!labelOffsets[p.i].width)){
        for(const p of projected)labelOffsets[p.i].width=labels[p.i].offsetWidth;
        labelMeasureAt=frameNow;lastPortraits=showPortraitsRef.current;
      }
      const placed:{x:number;y:number;width:number}[]=[];
      for(const p of projected){
        const slot=labelOffsets[p.i],width=slot.width;let x=p.x,y=p.y;
        for(let tries=0;tries<24;tries++){
          const column=[0,-1,1][tries%3],row=Math.floor(tries/3);
          x=Math.max(width/2+5,Math.min(w-width/2-5,p.x+column*(width+6)));y=Math.max(26,p.y-row*25);
          if(!placed.some(other=>Math.abs(other.x-x)<(other.width+width)/2+3&&Math.abs(other.y-y)<24))break;
        }
        placed.push({x,y,width});const blend=slot.ready?1-Math.exp(-dt/110):1;
        slot.x+=(x-p.x-slot.x)*blend;slot.y+=(y-p.y-slot.y)*blend;slot.ready=true;
        const label=labels[p.i];label.style.left='0';label.style.top='0';
        label.style.transform=`translate3d(${p.x+slot.x}px,${Math.max(25,p.y+slot.y)}px,0) translate(-50%,-100%)`;
      }
      if (frameNow - hudAt > 120) {
        hudAt = frameNow;
        const row = (m: Race['marbles'][number]): Row => { const done = arrived.includes(m.item.id), ticks = race!.finishTicks.get(m.item.id); return { id: m.item.id, label: givenName(m.item.label), color: colorFor(m.index), done, detail: done ? (ticks !== undefined ? seconds(ticks) : '완주') : `${Math.max(0, Math.min(99, Math.round(m.progress / race!.finish * 100)))}%`, portrait: portraits[m.index],x:m.x,z:m.z,progress:done?100:Math.max(0,Math.min(100,m.progress/race!.finish*100)) }; };
        const standings = [...arrived.map(id => race!.marbles.find(m => m.item.id === id)!), ...active].map(row);
        setHud({ status: finished ? '완료' : !run ? '대기' : countdown > 0 ? '출발 준비' : frameScale < .9 ? 'SLOW' : frameScale > 1.1 ? '정리 중' : '진행 중', clock: `${String(Math.floor(race.tick * STEP / 60)).padStart(2, '0')}:${String(Math.floor(race.tick * STEP) % 60).padStart(2, '0')}`, countdown: run && !finished ? countdown : 0, rows: standings.slice(0, 30), finished: arrived.length, total: entrants.length, winner: decided ? standings[0] : null, podium: standings.slice(0, 3).filter(r => r.done), complete: finished });
      }
    }
    function frame() { if (disposed) return; advance(); if (!stage.closest('[hidden]')) render(); raf = requestAnimationFrame(frame); }
    const debug = () => JSON.stringify({ sceneId, mode: !race ? 'loading' : !latest.current ? 'ready' : complete() ? 'complete' : clockNow() < start ? 'countdown' : 'racing', coordinates: 'world metres, y up', track: trackIndex, tick: race?.tick, seconds: race ? +(race.tick * STEP).toFixed(2) : 0, view: viewRef.current, followedId: viewRef.current==='overview'?null:live()[0]?.item.id, finalDuel, effectiveSpeed: +(frameScale*speedRef.current).toFixed(3), camera: { x: +camPos.x.toFixed(1), y: +camPos.y.toFixed(1), z: +camPos.z.toFixed(1) }, timeScale: frameScale, playbackSpeed:speedRef.current, seed: latest.current?.seed, finish: race?.finish, length: race?.length, results: order(), balls: live().map(m => ({ id: m.item.id, name: m.item.label, progress: +m.progress.toFixed(1), x: +m.x.toFixed(1), y: +m.y.toFixed(1), z: +m.z.toFixed(1) })) });
    const advanceTime = (ms: number) => { syncRun();virtualOffset += Math.max(0, ms); advance(60000); render(); };
    createRace(entrants, sceneSeed, trackIndex).then(value => {
      if (disposed) { value.dispose(); return; } race = value; build(value);
      renderer.compile(scene,camera);setStatus('');
      if (latest.current && !latest.current.finishedAt && start < clockNow()) {start=clockNow();lastPresentationTime=start;}
      if (import.meta.env.DEV) { host.render_game_to_text = debug; host.advanceTime = advanceTime; } frame();
    }).catch(error => { if (!disposed) { setStatus('트랙을 불러오지 못했습니다. 다시 시작해주세요.'); console.error(error); } });
    return () => { disposed = true; observer.disconnect(); cancelAnimationFrame(raf); race?.dispose();worldArt?.dispose(); labels.forEach(l => l.remove()); scene.traverse(obj => { const mesh = obj as THREE.Mesh; mesh.geometry?.dispose?.(); const mat = mesh.material as THREE.MeshStandardMaterial | undefined;mat?.map?.dispose(); mat?.dispose?.(); }); renderer.dispose(); if (host.render_game_to_text === debug) { delete host.render_game_to_text; delete host.advanceTime; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneSeed, itemKey, trackIndex]);

  const accent = hud.winner?.color ?? '#d5bb8e';
  return <div className={`pinball-stage race-stage${hud.complete?' race-stage-complete':''}`} ref={stageRef}>
    <canvas className="race-canvas" ref={canvasRef} aria-label="레이스 추첨 화면"/>
    <div className="race-labels" ref={labelsRef} aria-hidden="true"/>
    <div className="race-hud"><span className="race-live-dot"/><h3>{RACE_TRACKS[trackIndex] ?? '레이스'}</h3><span>{hud.status}</span><b>{hud.clock}</b></div>
    <aside className={`race-board${boardOpen?'':' collapsed'}`} aria-label="레이스 순위"><header><strong>순위 <small>{hud.finished}/{hud.total}</small></strong><button aria-label={boardOpen?'순위표 접기':'순위표 펴기'} onClick={()=>setBoardOpen(!boardOpen)}>{boardOpen?'−':'+'}</button></header>{boardOpen?<ol>{hud.rows.map((r, i) => <li key={r.id} className={`${r.done ? 'done' : ''}${i === 0 && r.done ? ' winner' : ''}`}><span>{String(i + 1).padStart(2,'0')}</span><span><i style={{ background: r.color }}/>{r.label}</span><small>{r.detail}</small><div className="race-row-progress" style={{width:`${r.progress}%`,background:r.color}}/></li>)}</ol>:null}</aside>
    <div className="race-minimap"><span>COURSE MAP</span><svg viewBox={mini.viewBox} aria-label="레이스 코스 미니맵"><path d={mini.path} fill="none" stroke="#ffffff22" strokeWidth="7" strokeLinecap="round"/><path d={mini.path} fill="none" stroke="#cdd9e0" strokeWidth="1.8"/>{hud.rows.filter(r=>!r.done).slice().reverse().map(r=><circle key={r.id} cx={r.x} cy={r.z} r="3" fill={r.color} stroke="#fff" strokeWidth=".7"/>)}</svg></div>
    {!run?<div className="race-ready-caption"><span>PL SET / MARBLE RACE</span><strong>{RACE_THEMES[trackIndex]?.subtitle}</strong><p>{RACE_THEMES[trackIndex]?.detail}</p></div>:null}
    {hud.countdown > 0 ? <div className="race-countdown"><strong>{hud.countdown}</strong><span>잠시 후 출발</span></div> : null}
    {hud.winner ? <div className={`race-result${hud.complete?'':' race-result-live'}`} style={{ ['--race-accent' as string]: accent }}><div className="race-result-label">{hud.complete?'RACE FINISHED':'WINNER'} · 첫번째 완주</div>{hud.winner.portrait && showPortraits ? <img src={hud.winner.portrait} alt=""/> : <div className="race-result-ball" style={{ background: accent }}/>}<h2>{hud.winner.label}</h2>{hud.complete?<ol>{hud.podium.map((r, i) => <li key={r.id}>{i + 1}위 {r.label} {r.detail}</li>)}</ol>:<small>나머지 참가자 레이스 진행 중</small>}</div> : null}
    {status ? <div className="pinball-loading" role="status">{status}</div> : null}
    <div className="race-camera-controls" role="group" aria-label="레이스 카메라"><button aria-pressed={view==='chase'} onClick={()=>setView('chase')}>선두 추적</button><button aria-pressed={view==='overview'} onClick={()=>setView('overview')}>전체 코스</button></div>
    <div className="pinball-speed-controls" role="group" aria-label="레이스 재생 속도">{([1, 1.5, 2, 2.5] as const).map(value => <button key={value} aria-label={`${value}배속`} aria-pressed={speed === value} onClick={() => { speedRef.current = value; setSpeed(value); }}>{value}×</button>)}</div>
    <button className="pinball-fullscreen" title="전체 화면 · F" aria-label={fullscreen ? '레이스 전체 화면 종료' : '레이스 전체 화면'} onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); else void stageRef.current?.requestFullscreen().catch(() => {}); }}>{fullscreen ? <Minimize2 size={14}/> : <Maximize2 size={14}/>}</button>
  </div>;
}
