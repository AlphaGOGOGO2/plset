import test from 'node:test';
import assert from 'node:assert/strict';
import { MAP_SEASONS, MATCH_MAPS, addMap, mapDrawGames, mapSeasonOf, removeMap, sessionMaps, setMapSeason, validMapDraw, validateSession, createSession } from './domain';
import { rebaseClock } from './share';
import { INTRO_MS, mapDrawFrame, mapDrawPlan, mapOrderText } from './mapDraw';

const items = MATCH_MAPS.map(m => ({ ...m })), ids = items.map(m => m.id);

test('games 1-7 use every map once and games 8-9 are two different maps from the pool', () => {
  for (let seed = 1; seed <= 500; seed++) {
    const games = mapDrawGames({ format: 'plus', seed, items });
    assert.equal(games.length, 9);
    assert.deepEqual([...games.slice(0, 7)].sort(), [...ids].sort());
    assert.notEqual(games[7], games[8]);
    assert.ok(ids.includes(games[7]) && ids.includes(games[8]));
  }
});

test('the schedule depends only on the seed and the pool', () => {
  assert.deepEqual(mapDrawGames({ format: 'plus', seed: 42, items }), mapDrawGames({ format: 'plus', seed: 42, items }));
  const seen = new Set(Array.from({ length: 200 }, (_, seed) => mapDrawGames({ format: 'plus', seed, items }).join()));
  assert.ok(seen.size > 150);
});

test('every map can land in every game', () => {
  const counts = Array.from({ length: 9 }, () => new Map<string, number>());
  for (let seed = 0; seed < 7000; seed++) mapDrawGames({ format: 'plus', seed: seed * 2654435761 >>> 0, items }).forEach((id, game) => counts[game].set(id, (counts[game].get(id) ?? 0) + 1));
  for (const game of counts) { assert.equal(game.size, 7); for (const n of game.values()) assert.ok(n > 800 && n < 1200, `uneven share: ${n}`); }
});

test('the reveal places one game at a time, in order, and ends on the full schedule', () => {
  const plan = mapDrawPlan({ format: 'plus', seed: 7, items });
  assert.equal(mapDrawFrame(plan, 0).phase, 'intro');
  assert.equal(mapDrawFrame(plan, INTRO_MS - 1).placed, 0);
  let placed = 0;
  for (let t = 0; t <= plan.total + 500; t += 20) {
    const frame = mapDrawFrame(plan, t);
    assert.ok(frame.placed === placed || frame.placed === placed + 1);
    placed = frame.placed;
    if (frame.phase === 'hold') assert.equal(frame.face, plan.games[frame.game]);
    if (frame.phase === 'roll' && frame.face) assert.ok(ids.includes(frame.face));
  }
  assert.equal(placed, 9);
  assert.equal(mapDrawFrame(plan, plan.total).phase, 'done');
});

test('a flicker only shows maps that can still come up and stops on the result', () => {
  const plan = mapDrawPlan({ format: 'plus', seed: 99, items });
  plan.steps.forEach((step, game) => {
    const allowed = game < 7 ? plan.games.slice(game, 7) : ids.filter(id => !plan.games.slice(7, game).includes(id));
    for (const face of step.faces) assert.ok(allowed.includes(face));
    if (step.faces.length) assert.equal(step.faces.at(-1), step.result);
  });
  assert.equal(plan.steps[6].faces.length, 0); // one map left: nothing to flicker through
  assert.ok(plan.steps[7].roll > plan.steps[0].roll);
});

test('sessions accept a valid map draw, reject a broken one, and viewers rebase its clock', () => {
  const run = { format: 'plus' as const, seed: 5, startedAt: 1000, items };
  assert.ok(validMapDraw(run));
  assert.ok(!validMapDraw({ ...run, items: items.slice(0, 1) }));
  assert.ok(!validMapDraw({ ...run, items: [...items, items[0]] }));
  assert.ok(!validMapDraw({ ...run, seed: 1.5 }));
  assert.ok(!validMapDraw({ ...run, format: 'eleven' }));
  assert.ok(!validMapDraw({ seed: 5, startedAt: 1000, items }));
  assert.equal(validateSession({ ...createSession(), mapDraw: run }).mapDraw, run);
  assert.equal(validateSession({ ...createSession(), mapDraw: null }).mapDraw, null);
  assert.throws(() => validateSession({ ...createSession(), mapDraw: { seed: 1 } }));
  assert.equal(rebaseClock({ ...createSession(), mapDraw: run }, 400).mapDraw?.startedAt, 600);
});

test('the 7-game format uses every map once and nothing more', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const games = mapDrawGames({ format: 'full', seed, items });
    assert.deepEqual([...games].sort(), [...ids].sort());
    assert.deepEqual(games, mapDrawGames({ format: 'plus', seed, items }).slice(0, 7));
  }
  const plan = mapDrawPlan({ format: 'full', seed: 3, items });
  assert.equal(plan.steps.length, 7);
  assert.ok(plan.steps.every(step => !step.extra));
});

test('the super ace format draws one map, and every map can be it', () => {
  const counts = new Map<string, number>();
  for (let seed = 0; seed < 7000; seed++) {
    const games = mapDrawGames({ format: 'ace', seed: seed * 2654435761 >>> 0, items });
    assert.equal(games.length, 1);
    counts.set(games[0], (counts.get(games[0]) ?? 0) + 1);
  }
  assert.equal(counts.size, 7);
  for (const n of counts.values()) assert.ok(n > 800 && n < 1200, `uneven share: ${n}`);
  const plan = mapDrawPlan({ format: 'ace', seed: 11, items }), [step] = plan.steps;
  assert.equal(plan.steps.length, 1);
  assert.ok(step.extra && step.faces.length > 0 && step.faces.every(face => ids.includes(face)));
  assert.equal(step.faces.at(-1), plan.games[0]);
  assert.equal(mapDrawFrame(plan, plan.total).placed, 1);
});

test('the copied order is the first two letters of each map joined by hyphens', () => {
  assert.equal(mapOrderText(['아이올로스', '녹아웃', '컬러리스페이트', '옥타곤']), '아이 녹아 컬러 옥타');
  assert.equal(mapOrderText(['컬러리스 페이트', '백룸', '오디세이', '애티튜드', 'A']), '컬러 백룸 오디 애티 A');
});

test('the flicker is a random walk, not a repeating lap', () => {
  const plan = mapDrawPlan({ format: 'plus', seed: 21, items });
  for (const faces of [plan.intro, ...plan.steps.map(step => step.faces)]) {
    for (let k = 1; k < faces.length; k++) assert.notEqual(faces[k], faces[k - 1]);
  }
  // A lap would repeat with the period of the pool; a random walk does not.
  const faces = plan.steps[7].faces, lap = faces.every((face, k) => k < 7 || face === faces[k - 7]);
  assert.ok(faces.length >= 20 && !lap);
  assert.ok(new Set(plan.intro).size >= 6);
  assert.notDeepEqual(mapDrawPlan({ format: 'plus', seed: 22, items }).steps[7].faces, faces);
});

test('a season replaces the pool with its seven maps, and the pool names the season until it is edited', () => {
  const s = createSession();
  assert.equal(mapSeasonOf(sessionMaps(s)), 'asl22');
  const next = setMapSeason(s, 'asl23');
  assert.equal(mapSeasonOf(sessionMaps(next)), 'asl23');
  assert.equal(sessionMaps(next).length, 7);
  assert.doesNotThrow(() => validateSession(JSON.parse(JSON.stringify(next))));
  assert.equal(mapSeasonOf(sessionMaps(addMap(next, '투혼'))), null);
  assert.equal(mapSeasonOf(sessionMaps(removeMap(next, 'asl23-map-1'))), null);
  assert.throws(() => setMapSeason(s, 'asl99'));
});
