import { useSyncExternalStore } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { getSfxVolume, setSfxVolume, SFX_VOLUME, subscribeSfxVolume } from './sfx';

// Shared effect-volume slider; the race and roulette tabs stay mounted together, so both read one store and never disagree.
export default function SfxVolumeControl() {
  const volume = useSyncExternalStore(subscribeSfxVolume, getSfxVolume);
  return <div className="race-bgm-volume" role="group" aria-label="효과음 볼륨">
    <button type="button" aria-pressed={volume > 0} aria-label={volume > 0 ? '효과음 끄기' : '효과음 켜기'} onClick={() => setSfxVolume(volume > 0 ? 0 : SFX_VOLUME)}>{volume > 0 ? <Volume2 size={14}/> : <VolumeX size={14}/>} 효과음</button>
    <input type="range" aria-label="효과음 볼륨" min={0} max={1} step={0.05} value={volume} onChange={e => setSfxVolume(e.currentTarget.valueAsNumber)}/>
  </div>;
}
