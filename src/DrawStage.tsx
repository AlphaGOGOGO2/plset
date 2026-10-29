import PinballStage from './PinballStage';
import WheelStage from './WheelStage';
import RaceStage from './RaceStage';
import { type DrawItem, type DrawRun } from './domain';

export default function DrawStage({run,onFinish,onCopyMaps,onNextDraw,onStart,disabled=false,items=[],rank=1,map=0,variant='players',previewSeed=412,showNames=true,showPortraits=true,mode='pinball'}:{run:DrawRun|null;onFinish?:(ids:string[])=>void;onCopyMaps?:()=>void;onNextDraw?:()=>void;onStart?:()=>void;disabled?:boolean;items?:DrawItem[];rank?:number;map?:number;previewSeed?:number;showNames?:boolean;showPortraits?:boolean;variant?:'players'|'ace'|'maps';mode?:'pinball'|'wheel'|'race'}) {
  const current=run?.mode ?? mode;
  if(current==='race') return <RaceStage run={run} items={items} map={map} previewSeed={previewSeed} showNames={showNames} showPortraits={showPortraits} onFinish={onFinish}/>;
  return current==='pinball' ? <PinballStage run={run} items={items} rank={rank} map={map} variant={variant} previewSeed={previewSeed} showNames={showNames} showPortraits={showPortraits} onFinish={onFinish} onCopyMaps={onCopyMaps} onNextDraw={onNextDraw}/> : <WheelStage run={run} items={items} onFinish={onFinish} onStart={onStart} disabled={disabled}/>;
}
