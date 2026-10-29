import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';

export const BGM_VOLUME = 0.2;
const saved = (key: string) => { try { const raw = localStorage.getItem(key), v = Number(raw); return raw !== null && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : BGM_VOLUME; } catch { return BGM_VOLUME; } };

// Loops a tab's music while `playing` and remembers its volume per tab. Call it from the page, not from a collapsible
// panel, so folding the settings away does not stop the music.
export function useBgm(file: string, playing: boolean, storageKey: string) {
  const [volume, setVolume] = useState(() => saved(storageKey)), audioRef = useRef<HTMLAudioElement | null>(null), volumeRef = useRef(volume);
  volumeRef.current = volume;
  useEffect(() => {
    if (!playing) return;
    const audio = new Audio(`${import.meta.env.BASE_URL}audio/${file}`);
    audio.loop = true; audio.volume = volumeRef.current; audioRef.current = audio;
    // Autoplay is blocked until the page has had a user gesture (e.g. opening the console straight onto this tab), so retry on the first click.
    const retry = () => { void audio.play().catch(() => {}); };
    audio.play().catch(() => window.addEventListener('pointerdown', retry, { once: true }));
    return () => { window.removeEventListener('pointerdown', retry); audio.pause(); audio.removeAttribute('src'); audio.load(); audioRef.current = null; };
  }, [file, playing]);
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
    try { localStorage.setItem(storageKey, String(volume)); } catch { /* Storage may be unavailable; the volume still applies for this session. */ }
  }, [volume, storageKey]);
  return [volume, setVolume] as const;
}

export function BgmVolumeControl({ volume, onChange }: { volume: number; onChange: (value: number) => void }) {
  return <div className="race-bgm-volume" role="group" aria-label="BGM 볼륨">
    <button type="button" aria-pressed={volume > 0} aria-label={volume > 0 ? 'BGM 끄기' : 'BGM 켜기'} onClick={() => onChange(volume > 0 ? 0 : BGM_VOLUME)}>{volume > 0 ? <Volume2 size={14}/> : <VolumeX size={14}/>} BGM</button>
    <input type="range" aria-label="BGM 볼륨" min={0} max={1} step={0.05} value={volume} onChange={e => onChange(e.currentTarget.valueAsNumber)}/>
  </div>;
}

export const SOUND_CREDIT = 'AI(Suno·ElevenLabs)로 직접 제작한 BGM·효과음 · 기존 곡 저작권과 무관';
