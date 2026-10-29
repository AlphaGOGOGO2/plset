// Race and roulette sound effects (generated with ElevenLabs). Silent in the ?output broadcast window so the operator window is the only audio source.
export type Sfx = 'countdown' | 'go' | 'boost' | 'win' | 'finish' | 'bumper' | 'click' | 'lead' | 'tension' | 'cheer' | 'wheelStart' | 'wheelTick';
export type SfxLoop = 'wheelSpin';
export const SFX_VOLUME = 0.5;
const KEY = 'plset-race-sfx-volume', OUTPUT = new URLSearchParams(location.search).has('output');
// The files are loudness-normalised to -16 LUFS, so `gain` alone sets the balance relative to the SFX slider; `gap` is the
// minimum ms between repeats so 30 marbles (or a fast wheel) cannot flood the mix.
const MIX: Record<Sfx | SfxLoop, { file: string; gain: number; gap: number }> = {
  countdown: { file: 'countdown.mp3', gain: .7, gap: 300 }, go: { file: 'go.mp3', gain: .9, gap: 1000 }, boost: { file: 'boost.mp3', gain: .5, gap: 250 },
  win: { file: 'win.mp3', gain: 1, gap: 2000 }, finish: { file: 'finish.mp3', gain: .6, gap: 150 }, bumper: { file: 'bumper.mp3', gain: .3, gap: 120 },
  click: { file: 'click.mp3', gain: .2, gap: 90 }, lead: { file: 'lead.mp3', gain: .7, gap: 2500 }, tension: { file: 'tension.mp3', gain: .8, gap: 4000 },
  cheer: { file: 'cheer.mp3', gain: .6, gap: 3000 }, wheelStart: { file: 'wheel-start.mp3', gain: .8, gap: 1000 },
  wheelTick: { file: 'wheel-tick.mp3', gain: .45, gap: 35 }, wheelSpin: { file: 'wheel-spin.wav', gain: .6, gap: 0 },
};
const sources = new Map<Sfx, HTMLAudioElement>(), lastPlayed = new Map<Sfx, number>(), listeners = new Set<() => void>();
const url = (name: Sfx | SfxLoop) => `${import.meta.env.BASE_URL}audio/sfx/${MIX[name].file}`;

let volume = (() => { try { const raw = localStorage.getItem(KEY), v = Number(raw); return raw !== null && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : SFX_VOLUME; } catch { return SFX_VOLUME; } })();
export const getSfxVolume = () => volume;
export function subscribeSfxVolume(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function setSfxVolume(value: number) {
  volume = value; listeners.forEach(listener => listener());
  try { localStorage.setItem(KEY, String(value)); } catch { /* Storage may be unavailable; the volume still applies for this session. */ }
}

export function playSfx(name: Sfx) {
  if (OUTPUT || volume <= 0) return;
  const now = performance.now(), mix = MIX[name];
  if (now - (lastPlayed.get(name) ?? -Infinity) < mix.gap) return;
  lastPlayed.set(name, now);
  let source = sources.get(name);
  if (!source) { source = new Audio(url(name)); source.preload = 'auto'; sources.set(name, source); }
  // Clone so overlapping hits of the same sound do not cut each other off.
  const voice = source.cloneNode() as HTMLAudioElement;
  voice.volume = Math.min(1, volume * mix.gain);
  void voice.play().catch(() => { /* Autoplay may be blocked before the first user gesture. */ });
}

// A looping bed whose loudness (0..1 of its mix gain) and playback rate the caller drives every frame; it follows the slider live.
export function startLoop(name: SfxLoop) {
  if (OUTPUT) return { set() {}, stop() {} };
  const audio = new Audio(url(name)), gain = MIX[name].gain;
  audio.loop = true; audio.preservesPitch = false; audio.volume = 0;
  void audio.play().catch(() => { /* Autoplay may be blocked before the first user gesture. */ });
  return {
    set(level: number, rate: number) { audio.volume = Math.min(1, Math.max(0, volume * gain * level)); audio.playbackRate = rate; },
    stop() { audio.pause(); audio.removeAttribute('src'); audio.load(); },
  };
}
