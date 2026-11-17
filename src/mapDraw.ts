import { mapDrawBase, mapDrawGames, seeded, shuffle, type MapDraw } from './domain';

// Timeline of the map draw reveal. Everything is a pure function of the run and the elapsed time, so the host,
// every viewer and a late joiner all see the same card at the same moment without exchanging anything but the seed.
export const INTRO_MS = 2600, ROLL_MS = 1700, HOLD_MS = 1000, EXTRA_ROLL_MS = 3200, EXTRA_HOLD_MS = 1400;
const INTRO_TICK_MS = 85, ROLL_TICK_MS = 105;

export interface MapDrawStep { start: number; roll: number; hold: number; extra: boolean; result: string; faces: string[] }
export interface MapDrawPlan { games: string[]; steps: MapDrawStep[]; intro: string[]; total: number }
export type MapDrawFrame =
  | { phase: 'intro'; game: -1; placed: 0; face: string; tick: number }
  | { phase: 'roll'; game: number; placed: number; face: string | null; tick: number }
  | { phase: 'hold'; game: number; placed: number; face: string; tick: number }
  | { phase: 'done'; game: number; placed: number; face: null; tick: 0 };

// Built backwards from the last face so the walk can be made to stop on a given one.
function randomFaces(candidates: string[], count: number, seed: number, last?: string): string[] {
  const random = seeded(seed), faces: string[] = [];
  let next = last ?? candidates[Math.floor(random() * candidates.length)];
  for (let k = 0; k < count; k++) { faces.unshift(next); const others = candidates.filter(id => id !== next); next = others[Math.floor(random() * others.length)]; }
  return faces;
}

export function mapDrawPlan(run: Pick<MapDraw, 'format' | 'seed' | 'items'>): MapDrawPlan {
  const games = mapDrawGames(run), n = mapDrawBase(run), ids = run.items.map(item => item.id);
  let at = INTRO_MS;
  const steps = games.map((result, game) => {
    const extra = game >= n, roll = extra ? EXTRA_ROLL_MS : ROLL_MS, hold = extra ? EXTRA_HOLD_MS : HOLD_MS;
    // What can still come up: the maps not used yet in the once-each block, then the whole pool minus the picks already drawn.
    const candidates = extra ? ids.filter(id => !games.slice(n, game).includes(id)) : games.slice(game, n);
    // The flicker is a random walk over the candidates (never the same face twice in a row) that ends on the result.
    const faces = candidates.length < 2 ? [] : randomFaces(candidates, Math.max(8, Math.round(roll / ROLL_TICK_MS)), (run.seed + (game + 1) * 7919) >>> 0, result);
    const step = { start: at, roll, hold, extra, result, faces };
    at += roll + hold;
    return step;
  });
  return { games, steps, intro: randomFaces(ids, Math.ceil(INTRO_MS / INTRO_TICK_MS) + 1, (run.seed ^ 0x51ED270B) >>> 0), total: at };
}

export function mapDrawFrame(plan: MapDrawPlan, elapsed: number): MapDrawFrame {
  if (elapsed >= plan.total) return { phase: 'done', game: plan.games.length - 1, placed: plan.games.length, face: null, tick: 0 };
  if (elapsed < INTRO_MS) { const tick = Math.max(0, Math.floor(elapsed / INTRO_TICK_MS)); return { phase: 'intro', game: -1, placed: 0, face: plan.intro[tick % plan.intro.length], tick }; }
  const game = plan.steps.findIndex(step => elapsed < step.start + step.roll + step.hold), step = plan.steps[game], t = elapsed - step.start;
  if (t >= step.roll) return { phase: 'hold', game, placed: game, face: step.result, tick: 0 };
  // Ease-out: the faces change quickly at first and slow down toward the result.
  const tick = step.faces.length ? Math.min(step.faces.length - 1, Math.floor(step.faces.length * (1 - (1 - t / step.roll) ** 2.2))) : 0;
  return { phase: 'roll', game, placed: game, face: step.faces[tick] ?? null, tick };
}

// Clipboard form the hosts paste into chat: the first two letters of each map, in game order.
export const mapOrderText = (labels: string[]) => labels.map(label => [...label.replace(/\s+/g, '')].slice(0, 2).join('')).join('-');
