// Race sound effects (generated with ElevenLabs). Silent in the ?output broadcast window so the operator window is the only audio source.
export type RaceSfx = 'countdown' | 'go' | 'boost' | 'win' | 'finish' | 'bumper' | 'click' | 'lead' | 'tension' | 'cheer';
export const RACE_SFX_VOLUME = 0.5;
const KEY = 'plset-race-sfx-volume', OUTPUT = new URLSearchParams(location.search).has('output');
// The files are loudness-normalised to -16 LUFS, so `gain` alone sets the balance relative to the SFX slider; `gap` is the
// minimum ms between repeats so 30 marbles cannot flood the mix.
const MIX: Record<RaceSfx, { gain: number; gap: number }> = {
  countdown: { gain: .7, gap: 300 }, go: { gain: .9, gap: 1000 }, boost: { gain: .5, gap: 250 }, win: { gain: 1, gap: 2000 },
  finish: { gain: .6, gap: 150 }, bumper: { gain: .3, gap: 120 }, click: { gain: .2, gap: 90 }, lead: { gain: .7, gap: 2500 },
  tension: { gain: .8, gap: 4000 }, cheer: { gain: .6, gap: 3000 },
};
const sources = new Map<RaceSfx, HTMLAudioElement>(), lastPlayed = new Map<RaceSfx, number>();

export function savedSfxVolume() { try { const raw = localStorage.getItem(KEY), v = Number(raw); return raw !== null && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : RACE_SFX_VOLUME; } catch { return RACE_SFX_VOLUME; } }
let volume = savedSfxVolume();
export function setSfxVolume(value: number) {
  volume = value;
  try { localStorage.setItem(KEY, String(value)); } catch { /* Storage may be unavailable; the volume still applies for this session. */ }
}

export function playSfx(name: RaceSfx) {
  if (OUTPUT || volume <= 0) return;
  const now = performance.now(), mix = MIX[name];
  if (now - (lastPlayed.get(name) ?? -Infinity) < mix.gap) return;
  lastPlayed.set(name, now);
  let source = sources.get(name);
  if (!source) { source = new Audio(`${import.meta.env.BASE_URL}audio/sfx/${name}.mp3`); source.preload = 'auto'; sources.set(name, source); }
  // Clone so overlapping hits of the same sound do not cut each other off.
  const voice = source.cloneNode() as HTMLAudioElement;
  voice.volume = Math.min(1, volume * mix.gain);
  void voice.play().catch(() => { /* Autoplay may be blocked before the first user gesture. */ });
}
