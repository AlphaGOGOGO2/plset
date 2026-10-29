// Camera, ranking and slow-motion rules for the pinball stage, in world units.
// Ported from lazygyu/roulette (camera.ts, roulette.ts _sortMarbles/_calcTimeScale), MIT. See public/licenses/marble-course.txt.
// 60px per unit on the 1600px scene shows ~27 units across, matching lazygyu's half-resolution scene canvas (30px/unit on 800px).
export const INITIAL_ZOOM = 60, VIEW_W = 1600, VIEW_H = 900;
export type Point = { x: number; y: number };
export type Zone = { x: number; y: number; w: number; h: number };
export type Tracked = Point & { id: string };

const FRAME_PADDING = 2, MIN_FRAME_ZOOM = .6, FRAME_RELEASE_ZOOM = .35, FOCUS_BLEND_FRAMES = 40, ZONE_BLEND_FRAMES = 60, SWITCH_DELAY_FRAMES = 20, SWITCH_BLEND_FRAMES = 36;
const RANK_EMA_SEC = .4, RANK_MARGIN = .25;
const FOLLOW_ZOOM = 1, MAX_RACE_ZOOM = 1;

export function smoothstep(t: number) { const x = Math.min(1, Math.max(0, t)); return x * x * (3 - 2 * x); }
// 0 outside a zone, rising to 1 at its centre (square falloff). Several zones: the strongest wins.
export function zoneIntensity(zones: Zone[], x: number, y: number) {
  let best = 0;
  for (const z of zones) { if (z.w <= 0 || z.h <= 0) continue; const t = 1 - Math.max(Math.abs(x - z.x) / (z.w / 2), Math.abs(y - z.y) / (z.h / 2)); if (t > best) best = t; }
  return best;
}
// Slow motion only while the cut-line marble is inside a zone and has someone to race.
export function timeScale(intensity: number, contested: boolean) { return contested && intensity > 0 ? Math.max(.2, 1 - intensity) : 1; }
// Finish drama is height-based, like reference zoomY; lateral movement must not cancel it.
export function finishIntensity(zoomY: number, y: number) { return Math.max(0, 1 - Math.abs(zoomY - y) / 5); }
export function cameraFocus(active: Tracked[], targetIndex: number, arrived: number, zoomY: number) {
  const index = arrived > 0 ? targetIndex : 0, target = active[index], rival = active[index + 1] ?? active[index - 1];
  // Reference follows the front pair until the first finish, but zoom/slow motion
  // always belong to the selected winning cut-line. Do not zoom early on a leader.
  const cut = active[targetIndex], cutRival = active[targetIndex + 1] ?? active[targetIndex - 1];
  const a = cut ? finishIntensity(zoomY, cut.y) : 0, b = cutRival ? finishIntensity(zoomY, cutRival.y) : 0;
  return { target, rival, intensity: Math.max(a, b), focusOnRival: index === targetIndex && b > a };
}

// Rank by remaining distance, smoothed over RANK_EMA_SEC; a marble must lead by RANK_MARGIN to overtake.
export class RankTracker {
  private keys = new Map<string, number>();
  private order: string[] = [];
  update(marbles: Tracked[], distanceAt: (x: number, y: number) => number, dt: number): string[] {
    const alpha = 1 - Math.exp(-Math.max(0, dt) / RANK_EMA_SEC), keys = new Map<string, number>();
    let known = 0;
    for (const m of marbles) { const raw = distanceAt(m.x, m.y), prev = this.keys.get(m.id); if (prev !== undefined) known++; keys.set(m.id, prev !== undefined ? prev + (raw - prev) * alpha : raw); }
    this.keys = keys;
    const ids = marbles.map(m => m.id);
    if (known < marbles.length / 2) { this.order = [...ids].sort((a, b) => keys.get(a)! - keys.get(b)!); return [...this.order]; }
    // Start from last frame's order (dropping finished marbles), then insertion-sort with a margin.
    const list = this.order.filter(id => keys.has(id)); for (const id of ids) if (!list.includes(id)) list.push(id);
    for (let i = 1; i < list.length; i++) { const id = list[i], k = keys.get(id)! + RANK_MARGIN; let j = i; while (j > 0 && k < keys.get(list[j - 1])!) { list[j] = list[j - 1]; j--; } list[j] = id; }
    this.order = list; return [...list];
  }
  reset() { this.keys = new Map(); this.order = []; }
}

type Pair = { target: Tracked; rival?: Tracked };
export class Camera {
  position: Point = { x: 13, y: 2 };
  zoom = 1;
  private targetPosition: Point = { x: 13, y: 2 };
  private targetZoom = 1;
  private zoneWeight = 0; private zone: Zone | null = null;
  private shown: Pair | null = null; private pending: Pair | null = null; private pendingFrames = 0;
  private switchFrom: { position: Point; zoom: number } | null = null; private switchProgress = 1;
  private focusWeight = 0;
  private inspecting = false;
  reset(center: Point, zoom: number) {
    this.position = { ...center }; this.targetPosition = { ...center }; this.zoom = zoom; this.targetZoom = zoom;
    this.inspecting = false;
    this.zoneWeight = 0; this.zone = null; this.shown = null; this.pending = null; this.pendingFrames = 0; this.switchFrom = null; this.switchProgress = 1; this.focusWeight = 0;
  }
  // Minimap navigation changes presentation only, never the simulated race.
  inspect(point: Point, dt = 1000 / 60) {
    this.inspecting = true;
    const k = 1 - Math.exp(-Math.max(0, Math.min(100, dt)) / 90);
    this.position.x = interpolate(this.position.x, point.x, k);
    this.position.y = interpolate(this.position.y, point.y, k);
  }
  // `dt` is the frame time in ms; smoothing is tuned to 1/10 per frame at 60fps and scales with dropped frames.
  update({ target, rival, intensity, focusOnRival, zones, viewSize, marbles, dt = 1000 / 60 }: { target?: Tracked; rival?: Tracked; intensity: number; focusOnRival: boolean; zones: Zone[]; viewSize: Point; marbles?: Tracked[]; dt?: number }) {
    dt = Math.max(0, Math.min(100, dt));
    if(this.inspecting){this.inspecting=false;this.switchFrom={position:{...this.position},zoom:this.zoom};this.switchProgress=0;}
    if (target) this.aim(target, rival, intensity, focusOnRival, zones, viewSize, dt / (1000 / 60), marbles);
    const k = 1 - Math.pow(.9, dt / (1000 / 60));
    this.position.x = interpolate(this.position.x, this.targetPosition.x, k); this.position.y = interpolate(this.position.y, this.targetPosition.y, k);
    this.zoom = interpolate(this.zoom, this.targetZoom, k);
  }
  private aim(current: Tracked, currentRival: Tracked | undefined, intensity: number, focusOnRival: boolean, zones: Zone[], viewSize: Point, frames: number, marbles?: Tracked[]) {
    const { target, rival } = this.pickPair({ target: current, rival: currentRival }, frames, marbles);
    const isCurrent = target.id === current.id && rival?.id === currentRival?.id;
    const fitZoom = rival ? Math.min(viewSize.x / 2 / (Math.abs(rival.x - target.x) / 2 + FRAME_PADDING), viewSize.y / 2 / (Math.abs(rival.y - target.y) / 2 + FRAME_PADDING)) : 0;
    const step = frames / FOCUS_BLEND_FRAMES;
    this.focusWeight = focusOnRival && isCurrent && rival ? Math.min(1, this.focusWeight + step) : Math.max(0, this.focusWeight - step);
    let { position, zoom } = frameView(target, rival, fitZoom, intensity, viewSize);
    if (rival && this.focusWeight > 0) { const w = smoothstep(this.focusWeight), view = frameView(rival, target, fitZoom, intensity, viewSize); position = { x: position.x + (view.position.x - position.x) * w, y: position.y + (view.position.y - position.y) * w }; zoom += (view.zoom - zoom) * w; }
    // These are cameraZones, separate from finish intensity / slow motion.
    const zone = zones.find(z => z.w > 0 && z.h > 0 && Math.abs(target.x - z.x) <= z.w / 2 && Math.abs(target.y - z.y) <= z.h / 2);
    if (zone) this.zone = zone;
    const zoneStep = frames / ZONE_BLEND_FRAMES;
    this.zoneWeight = zone ? Math.min(1, this.zoneWeight + zoneStep) : Math.max(0, this.zoneWeight - zoneStep);
    if (this.zone && this.zoneWeight > 0) { const z = this.zone, zoneZoom = Math.min(viewSize.x / z.w, viewSize.y / z.h), t = smoothstep(this.zoneWeight) * (1 - intensity); position = { x: position.x + (z.x - position.x) * t, y: position.y + (z.y - position.y) * t }; zoom += (zoneZoom - zoom) * t; } else this.zone = null;
    if (this.switchFrom && this.switchProgress < 1) { this.switchProgress = Math.min(1, this.switchProgress + frames / SWITCH_BLEND_FRAMES); const from = this.switchFrom, w = smoothstep(this.switchProgress); position = { x: from.position.x + (position.x - from.position.x) * w, y: from.position.y + (position.y - from.position.y) * w }; zoom = from.zoom + (zoom - from.zoom) * w; }
    this.targetPosition = position; this.targetZoom = zoom;
  }
  // Keep showing the old pair until the new one has held for SWITCH_DELAY_FRAMES, unless the old target is gone.
  private pickPair(current: Pair, frames: number, marbles?: Tracked[]): Pair {
    const shown = this.shown;
    if (shown && shown.target.id === current.target.id && shown.rival?.id === current.rival?.id) { this.pending = null; return { target: current.target, rival: current.rival }; }
    if (this.pending && this.pending.target.id === current.target.id && this.pending.rival?.id === current.rival?.id) this.pendingFrames += frames; else { this.pending = current; this.pendingFrames = frames; }
    const live = marbles ?? [current.target, ...(current.rival ? [current.rival] : [])];
    const gone = !shown || !live.some(m => m.id === shown.target.id) || !!shown.rival && !live.some(m => m.id === shown.rival!.id);
    if (gone || this.pendingFrames >= SWITCH_DELAY_FRAMES) { if (shown) { this.switchFrom = { position: { ...this.targetPosition }, zoom: this.targetZoom }; this.switchProgress = 0; } this.shown = current; this.pending = null; return current; }
    // Refresh the shown pair's coordinates from the current frame so the camera keeps moving with them.
    const target = live.find(m => m.id === shown!.target.id) ?? shown!.target, rival = live.find(m => m.id === shown!.rival?.id);
    return { target, rival };
  }
}
// Frame `subject` with `other`: zoom out (down to MIN_FRAME_ZOOM) to fit both, release toward subject-only as they drift apart, zoom in with intensity.
function frameView(subject: Tracked, other: Tracked | undefined, fitZoom: number, intensity: number, viewSize: Point) {
  let position: Point = { x: subject.x, y: subject.y }, zoom = FOLLOW_ZOOM;
  if (other) { const frame = smoothstep((fitZoom - FRAME_RELEASE_ZOOM) / (MIN_FRAME_ZOOM - FRAME_RELEASE_ZOOM)); position = { x: subject.x + (other.x - subject.x) / 2 * frame, y: subject.y + (other.y - subject.y) / 2 * frame }; zoom = FOLLOW_ZOOM + (Math.max(MIN_FRAME_ZOOM, Math.min(MAX_RACE_ZOOM, fitZoom)) - FOLLOW_ZOOM) * frame; }
  // Reference preserves the ordinary wide view until finish intensity overtakes
  // it, then ramps linearly to 4x. A smoothstep here zoomed too early and too far.
  zoom = Math.max(zoom, 4 * intensity);
  if (intensity > 0) { const hx = Math.max(0, viewSize.x / 2 / zoom - FRAME_PADDING), hy = Math.max(0, viewSize.y / 2 / zoom - FRAME_PADDING), cx = Math.min(subject.x + hx, Math.max(subject.x - hx, position.x)), cy = Math.min(subject.y + hy, Math.max(subject.y - hy, position.y)), pull = Math.min(1, intensity * 4); position = { x: position.x + (cx - position.x) * pull, y: position.y + (cy - position.y) * pull }; }
  return { position, zoom };
}
function interpolate(current: number, target: number, k: number) { const d = target - current; return Math.abs(d) < 1 / 30 ? target : current + d * k; }
