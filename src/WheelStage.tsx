import { useEffect, useRef, useState } from 'react';
import { Maximize2, Minimize2, Play, RotateCcw } from 'lucide-react';
import { seeded, shuffle, type DrawItem, type DrawRun } from './domain';
import { playSfx, startLoop } from './sfx';

const W=1000,H=640,CX=500,CY=370,R=232,TAU=Math.PI*2,DURATION=7600,REVEAL=650,FLASH=600,TILT=.38;
const COLORS=['#e7b879','#89bca8','#91b7d8','#d39baa','#b9acd1','#c1cc8e','#82bfbd','#d7a889','#a3b4cb','#d7c17f'];
const font='"Manrope Variable", "Noto Sans KR", sans-serif';
type GameWindow=Window&{render_game_to_text?:()=>string;advanceTime?:(ms:number)=>void};
const wrap=(angle:number)=>(angle%TAU+TAU)%TAU;
// Mix a hex colour toward white (amount>0) or black (amount<0) for the bevelled sector gradients.
const shade=(hex:string,amount:number)=>{const n=parseInt(hex.slice(1),16),r=n>>16&255,g=n>>8&255,b=n&255,to=amount<0?0:255,k=Math.abs(amount);return `rgb(${Math.round(r+(to-r)*k)},${Math.round(g+(to-g)*k)},${Math.round(b+(to-b)*k)})`;};

export default function WheelStage({run,items,onFinish,onStart,disabled=false,editing=false,onEdit,onConfirm}:{run:DrawRun|null;items:DrawItem[];onFinish?:(ids:string[])=>void;onStart?:()=>void;disabled?:boolean;editing?:boolean;onEdit?:(index:number,label:string)=>void;onConfirm?:()=>void}){
 const stageRef=useRef<HTMLDivElement>(null),canvasRef=useRef<HTMLCanvasElement>(null),layerRef=useRef<HTMLDivElement>(null);
 const [fullscreen,setFullscreen]=useState(false);
 const callback=useRef(onFinish);callback.current=onFinish;
 const latest=useRef(run);latest.current=run;
 const itemKey=JSON.stringify((run?.items??items).map(item=>[item.id,item.label]));
 const running=!!run&&!run.finishedAt;
 useEffect(()=>{
  const changed=()=>setFullscreen(document.fullscreenElement===stageRef.current);
  const key=(e:KeyboardEvent)=>{if(e.key.toLowerCase()!=='f'||e.repeat||e.ctrlKey||e.metaKey||e.altKey||stageRef.current?.closest('[hidden]')||document.querySelector('dialog[open]')||(e.target as HTMLElement).closest('input,textarea,select,[contenteditable]'))return;
   if(document.fullscreenElement)void document.exitFullscreen();else void stageRef.current?.requestFullscreen().catch(()=>{});
  };
  document.addEventListener('fullscreenchange',changed);window.addEventListener('keydown',key);
  return()=>{document.removeEventListener('fullscreenchange',changed);window.removeEventListener('keydown',key);};
 },[]);
 useEffect(()=>{
  const canvas=canvasRef.current,ctx=canvas?.getContext('2d');if(!canvas||!ctx)return;
  const dpr=Math.min(3,Math.max(2,devicePixelRatio||1));canvas.width=W*dpr;canvas.height=H*dpr;ctx.scale(dpr,dpr);
  const entries:DrawItem[]=JSON.parse(itemKey).map(([id,label]:string[])=>({id,label})),n=Math.max(2,entries.length),sector=TAU/n;
  const order=run?shuffle(entries,run.seed).map(item=>item.id):[],winnerId=run?(run.finishedAt?run.results[run.rank-1]:order[run.rank-1]):undefined,selected=entries.findIndex(item=>item.id===winnerId);
  // Seeded so every window agrees: a third of spins stop within 8% of a border (pointer resting on a peg), the rest anywhere inside 6%..94%.
  const dice=seeded((run?.seed??0)+1),edge=dice()<1/3,side=dice()<.5,roll=dice();
  const landing=run?edge?(side?.04+.08*roll:.96-.08*roll):.06+.88*roll:.5;
  const duration=DURATION+(run?.seed??0)%1800;
  const initialAngle=-Math.PI/2-sector/2,finalAngle=TAU*(8+(run?.seed??0)%3)-Math.PI/2-(selected+landing)*sector;
  let raf=0,disposed=false,sent=false,offset=0,angle=initialAngle,progress=0,lastIndex=-1,releasedAt=0;
  const start=run?.startedAt??Date.now(),host=window as GameWindow;
  const measure=()=>{const stage=stageRef.current,layer=layerRef.current;if(!stage||!layer)return;const scale=Math.min(stage.clientWidth/W,stage.clientHeight/H);layer.style.width=`${W*scale}px`;layer.style.height=`${H*scale}px`;layer.style.left=`${(stage.clientWidth-W*scale)/2}px`;layer.style.top=`${(stage.clientHeight-H*scale)/2}px`;};
  const observer=new ResizeObserver(measure);if(stageRef.current)observer.observe(stageRef.current);measure();
  const complete=()=>!!latest.current?.finishedAt||!!run&&progress>=1;
  function text(value:string,x:number,y:number,size:number,color:string,weight=600,maxWidth=900){
   ctx!.font=`${weight} ${size}px ${font}`;const width=ctx!.measureText(value).width;if(width>maxWidth)ctx!.font=`${weight} ${Math.max(12,size*maxWidth/width)}px ${font}`;
   ctx!.fillStyle=color;ctx!.textAlign='center';ctx!.textBaseline='middle';ctx!.fillText(value,x,y);ctx!.textBaseline='alphabetic';
  }
  // Sound: the crank plays in the short wait before the spin (so reopening the tab mid-spin never replays it), a whirring loop
  // follows the wheel's speed (it falls linearly, so 1-progress is the speed), and every peg the pointer passes ticks.
  let spin:ReturnType<typeof startLoop>|null=null,startCued=false;
  function cueSounds(now:number,stopped:boolean,crossed:boolean){
   const audible=!stageRef.current?.closest('[hidden]'),spinning=!!run&&!stopped&&now>=start&&audible;
   if(run&&!stopped&&now<start&&!startCued&&audible){startCued=true;playSfx('wheelStart');}
   if(!spinning){spin?.stop();spin=null;return;}
   spin??=startLoop('wheelSpin');
   const speed=1-progress;spin.set(.25+.75*speed,.6+.6*speed);
   if(crossed)playSfx('wheelTick');
  }
  function draw(){
   if(!ctx||disposed)return;
   const stopped=complete(),now=Date.now()+offset;
   progress=run?(stopped?1:Math.max(0,Math.min(1,(now-start)/duration))):0;
   // Constant friction: speed falls linearly, so the wheel still visibly moves right up to the stop instead of fading out early.
   const eased=1-(1-progress)*(1-progress);
   angle=run?initialAngle+(finalAngle-initialAngle)*eased:initialAngle;
   const position=wrap(-Math.PI/2-angle)/sector,pointerIndex=Math.min(n-1,Math.floor(position)),peg=position-pointerIndex;
   // Pointer flick: a peg bends the tip as it approaches (peg→0), then the tip springs back once the peg has passed.
   const crossed=lastIndex>=0&&pointerIndex!==lastIndex;if(crossed)releasedAt=now;lastIndex=pointerIndex;
   cueSounds(now,stopped,crossed);
   const tilt=run?TILT*Math.max(peg<.08?1-peg/.08:0,releasedAt?Math.exp(-(now-releasedAt)/70):0):0;
   // Hold a beat after the wheel stops, then reveal the winner with a flash.
   const revealAt=start+duration+REVEAL,finished=stopped&&now>=revealAt,flash=finished?Math.max(0,1-(now-revealAt)/FLASH):0;
   // The name under the heading stays hidden while spinning; it appears only at the reveal.
   const shown=finished?entries.find(item=>item.id===(latest.current?.results[run!.rank-1]??winnerId)):undefined;
   ctx.fillStyle='#141b18';ctx.fillRect(0,0,W,H);
   const glow=ctx.createRadialGradient(CX,CY,120,CX,CY,340);glow.addColorStop(0,'#35433438');glow.addColorStop(1,'#141b1800');ctx.fillStyle=glow;ctx.fillRect(0,0,W,H);
   text(editing?'원판 설정':finished?'당첨':run?stopped?'':'추첨 중':'추첨 대기',CX,26,14,finished?'#d8c598':'#8c9b90',600);
   text(editing?'각 칸에 항목을 입력하세요':finished?shown?.label??'':run?shown?.label??'':entries.length?`${entries.length}개 항목`:'항목을 추가해주세요',CX,67,finished?40+12*flash:30,finished?'#f0e7d0':'#e0e5dc',700,780);
   // Ground shadow + thick bevelled rim so the disc reads as a solid object lit from the upper left.
   const ground=ctx.createRadialGradient(CX,CY+R+30,0,CX,CY+R+30,R*.95);ground.addColorStop(0,'#00000070');ground.addColorStop(1,'#00000000');
   ctx.save();ctx.translate(CX,CY+R+30);ctx.scale(1,.11);ctx.translate(-CX,-(CY+R+30));ctx.fillStyle=ground;ctx.fillRect(CX-R*1.2,CY+R+30-R,R*2.4,R*2);ctx.restore();
   ctx.save();ctx.shadowColor='#000a';ctx.shadowBlur=34;ctx.shadowOffsetY=14;ctx.beginPath();ctx.arc(CX,CY,R+22,0,TAU);ctx.fillStyle='#1c2621';ctx.fill();ctx.restore();
   const rim=ctx.createRadialGradient(CX-60,CY-80,R-40,CX,CY,R+24);rim.addColorStop(0,'#4a5d50');rim.addColorStop(.55,'#2c3a31');rim.addColorStop(1,'#151d18');
   ctx.beginPath();ctx.arc(CX,CY,R+22,0,TAU);ctx.fillStyle=rim;ctx.fill();
   ctx.beginPath();ctx.arc(CX,CY,R+21.5,0,TAU);ctx.strokeStyle='#c9bc8e66';ctx.lineWidth=1.5;ctx.stroke();
   ctx.beginPath();ctx.arc(CX,CY,R+9,0,TAU);ctx.strokeStyle='#0a100c';ctx.lineWidth=3;ctx.stroke();
   ctx.beginPath();ctx.arc(CX,CY,R+5,0,TAU);ctx.strokeStyle='#ffffff14';ctx.lineWidth=1;ctx.stroke();
   for(let i=0;i<n;i++){
    const a=angle+i*sector,b=a+sector,base=COLORS[i%COLORS.length];
    const face=ctx.createRadialGradient(CX,CY,36,CX,CY,R);face.addColorStop(0,shade(base,.3));face.addColorStop(.7,shade(base,.06));face.addColorStop(1,shade(base,-.14));
    ctx.beginPath();ctx.moveTo(CX,CY);ctx.arc(CX,CY,R,a,b);ctx.closePath();ctx.fillStyle=face;ctx.fill();
    ctx.strokeStyle='#0d1510aa';ctx.lineWidth=2;ctx.stroke();
    ctx.beginPath();ctx.moveTo(CX+Math.cos(a)*40,CY+Math.sin(a)*40);ctx.lineTo(CX+Math.cos(a)*(R-2),CY+Math.sin(a)*(R-2));ctx.strokeStyle='#ffffff2e';ctx.lineWidth=1;ctx.stroke();
   }
   // One fixed light source: a soft specular sweep over the top-left and a vignette toward the edge.
   ctx.save();ctx.beginPath();ctx.arc(CX,CY,R,0,TAU);ctx.clip();
   const spec=ctx.createRadialGradient(CX-90,CY-120,10,CX-90,CY-120,R*1.25);spec.addColorStop(0,'#ffffff30');spec.addColorStop(.5,'#ffffff0c');spec.addColorStop(1,'#ffffff00');ctx.fillStyle=spec;ctx.fillRect(0,0,W,H);
   const vignette=ctx.createRadialGradient(CX,CY,R*.72,CX,CY,R);vignette.addColorStop(0,'#00000000');vignette.addColorStop(1,'#00000022');ctx.fillStyle=vignette;ctx.fillRect(0,0,W,H);
   ctx.restore();
   if(finished){
    for(let i=0;i<n;i++){if(i===selected)continue;const a=angle+i*sector;ctx.beginPath();ctx.moveTo(CX,CY);ctx.arc(CX,CY,R,a,a+sector);ctx.closePath();ctx.fillStyle='#0b120d66';ctx.fill();}
    const a=angle+selected*sector,b=a+sector;
    // Spotlight on the winning sector: a lasting warm wash plus the reveal flash that fades out.
    ctx.beginPath();ctx.moveTo(CX,CY);ctx.arc(CX,CY,R,a,b);ctx.closePath();ctx.fillStyle=`rgba(255,240,205,${.14+.7*flash})`;ctx.fill();
    ctx.beginPath();ctx.arc(CX,CY,R-3,a+.009,b-.009);ctx.strokeStyle='#fff0c5';ctx.lineWidth=5;ctx.stroke();
   }
   for(let i=0;i<n;i++){
    const a=angle+i*sector;
    const label=entries[i]?.label;if(!label||editing)continue;
    ctx.save();ctx.translate(CX,CY);ctx.rotate(a+sector/2);
    const labelSize=n<=8?25:n<=16?21:n<=30?17:13;
    ctx.font=`700 ${labelSize}px ${font}`;let display=label;const maxWidth=R-88,width=ctx.measureText(label).width;if(width>maxWidth)ctx.font=`700 ${Math.max(11,labelSize*maxWidth/width)}px ${font}`;
    while(display.length>1&&ctx.measureText(display).width>maxWidth)display=display.slice(0,-2)+'…';
    // Labels always read from the hub toward the rim (as on a real wheel) so they never flip as the sector crosses the left side.
    ctx.translate(R-24,0);ctx.textAlign='right';
    ctx.textBaseline='middle';ctx.globalAlpha=finished&&i!==selected?.55:1;ctx.fillStyle='#ffffff38';ctx.fillText(display,0,1);ctx.fillStyle='#15231c';ctx.fillText(display,0,0);ctx.restore();
   }
   // Metal pegs set into the rim.
   for(let i=0;i<n;i++){const a=angle+i*sector,px=CX+Math.cos(a)*(R+15),py=CY+Math.sin(a)*(R+15);const peg=ctx.createRadialGradient(px-1.2,py-1.4,.5,px,py,4);peg.addColorStop(0,'#fff6dc');peg.addColorStop(.5,'#d8c48f');peg.addColorStop(1,'#6f5f3c');ctx.beginPath();ctx.arc(px,py,3.6,0,TAU);ctx.fillStyle=peg;ctx.fill();}
   // Domed hub with a brass bezel.
   ctx.save();ctx.shadowColor='#000b';ctx.shadowBlur=14;ctx.shadowOffsetY=5;ctx.beginPath();ctx.arc(CX,CY,56,0,TAU);ctx.fillStyle='#1a241e';ctx.fill();ctx.restore();
   const bezel=ctx.createLinearGradient(CX-56,CY-56,CX+56,CY+56);bezel.addColorStop(0,'#e9d7a6');bezel.addColorStop(.5,'#8d7a4e');bezel.addColorStop(1,'#d9c58e');ctx.beginPath();ctx.arc(CX,CY,56,0,TAU);ctx.strokeStyle=bezel;ctx.lineWidth=3;ctx.stroke();
   const dome=ctx.createRadialGradient(CX-16,CY-18,4,CX,CY,54);dome.addColorStop(0,'#3a4b40');dome.addColorStop(.6,'#1c2620');dome.addColorStop(1,'#0e1511');ctx.beginPath();ctx.arc(CX,CY,52,0,TAU);ctx.fillStyle=dome;ctx.fill();
   ctx.beginPath();ctx.arc(CX,CY,46,0,TAU);ctx.strokeStyle='#ffffff10';ctx.lineWidth=1;ctx.stroke();
   if(!onStart)text('PROLEAGUE',CX,CY,12,'#e1d7be',700);
   // Brass pointer on a pivot pin; it rotates by `tilt` when a peg pushes it.
   ctx.save();ctx.shadowColor='#000a';ctx.shadowBlur=10;ctx.shadowOffsetY=4;ctx.translate(CX,CY-R-20);ctx.rotate(tilt);
   const brass=ctx.createLinearGradient(-15,0,15,0);brass.addColorStop(0,'#c7ac70');brass.addColorStop(.42,'#f6e6b8');brass.addColorStop(.6,'#e2cb92');brass.addColorStop(1,'#a88e58');
   ctx.beginPath();ctx.roundRect(-15,-3,30,18,4);ctx.fillStyle=brass;ctx.fill();ctx.beginPath();ctx.moveTo(-15,10);ctx.lineTo(15,10);ctx.lineTo(0,35);ctx.closePath();ctx.fill();
   ctx.shadowColor='transparent';ctx.strokeStyle='#5c4b2a99';ctx.lineWidth=1;ctx.stroke();
   ctx.beginPath();ctx.arc(0,4,4,0,TAU);ctx.fillStyle='#3b3120';ctx.fill();ctx.beginPath();ctx.arc(-1,3,1.6,0,TAU);ctx.fillStyle='#fff3cc';ctx.fill();ctx.restore();
   if(run&&progress>=1&&!sent&&!latest.current?.finishedAt){sent=true;callback.current?.(order);}
  }
  const debug=()=>JSON.stringify({mode:!run?'ready':complete()?(Date.now()+offset>=start+duration+REVEAL?'complete':'stopped'):Date.now()+offset<start?'countdown':'spinning',coordinates:'canvas 1000x640, origin top-left, x right, y down',angle,progress,duration,landing,entries,seed:run?.seed,selectedId:winnerId,pointerId:entries[Math.floor(wrap(-Math.PI/2-angle)/sector)]?.id,results:complete()?(latest.current?.results.length?latest.current.results:order):[]});
  const advanceTime=(ms:number)=>{offset+=Math.max(0,ms);draw();};
  const frame=()=>{if(disposed)return;const visible=!stageRef.current?.closest('[hidden]');if(visible||run&&!latest.current?.finishedAt)draw();if(visible){if(import.meta.env.DEV){host.render_game_to_text=debug;host.advanceTime=advanceTime;}}raf=requestAnimationFrame(frame);};frame();
  return()=>{disposed=true;spin?.stop();observer.disconnect();cancelAnimationFrame(raf);if(host.render_game_to_text===debug){delete host.render_game_to_text;delete host.advanceTime;}};
 },[run?.seed,run?.startedAt,itemKey,run?.rank,editing]);
 return <div className="wheel-stage" ref={stageRef}>
  <canvas ref={canvasRef} className={`draw-canvas wheel-canvas${onStart&&!editing&&!running&&!disabled&&items.length>=2?' can-spin':''}`} aria-label="룰렛 추첨 화면" onClick={e=>{if(!onStart||editing||running||disabled||items.length<2)return;const bounds=layerRef.current?.getBoundingClientRect();if(!bounds)return;const x=(e.clientX-bounds.x)/bounds.width*W,y=(e.clientY-bounds.y)/bounds.height*H;if(Math.hypot(x-CX,y-CY)<=R)onStart();}}/>
  <div className="wheel-action-layer" ref={layerRef}>
   {editing&&onEdit?<div className={`wheel-slot-editor${items.length>12?' wheel-slot-editor-list':''}`} aria-label="원판 항목 입력">{items.map((item,i)=>{const a=-Math.PI/2+i*TAU/items.length,x=CX+Math.cos(a)*155,y=CY+Math.sin(a)*155;return <input key={i} data-wheel-slot={i} aria-label={`${i+1}번 칸`} placeholder={`항목 ${i+1}`} maxLength={80} disabled={disabled} value={item.label} style={items.length<=12?{left:`${x/W*100}%`,top:`${y/H*100}%`,width:items.length>8?'9%':'13%'}:undefined} onChange={e=>onEdit(i,e.target.value)} onFocus={e=>e.currentTarget.select()} onKeyDown={e=>{if(e.key==='Enter'&&!e.nativeEvent.isComposing&&e.keyCode!==229){e.preventDefault();const next=layerRef.current?.querySelector<HTMLInputElement>(`[data-wheel-slot="${i+1}"]`);if(next)next.focus();else onConfirm?.();}}}/>;})}</div>:null}{onStart?<button className="wheel-spin-button" aria-label={editing?'원판 설정 완료':running?'룰렛 추첨 진행 중':run?.finishedAt?'룰렛 다시 돌리기':'룰렛 돌리기'} disabled={disabled||running||items.length<2} onClick={editing?onConfirm:onStart}>{running?<span className="wheel-spinning-mark"/>:run?.finishedAt?<RotateCcw size={22}/>:<Play size={22} fill="currentColor"/>}<span>{editing?'설정 완료':running?'추첨 중':run?.finishedAt?'다시 돌리기':'돌리기'}</span></button>:null}</div>
  <button className="pinball-fullscreen" aria-label={fullscreen?'룰렛 전체 화면 종료':'룰렛 전체 화면'} title="전체 화면 · F" onClick={()=>{if(document.fullscreenElement)void document.exitFullscreen();else void stageRef.current?.requestFullscreen().catch(()=>{});}}>{fullscreen?<Minimize2 size={14}/>:<Maximize2 size={14}/>}</button>
 </div>;
}
