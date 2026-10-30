import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';

const output = 'output/race-gate';
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const errors = [], results = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  // Expose the simulation only in this isolated test browser. No production hook.
  await page.route(/\/src\/race\.ts(?:\?|$)/, async route => {
    const response = await route.fetch(), source = await response.text();
    assert.ok(/return \{\s*track,/.test(source));
    const body = source.replace('export async function createRace(items, seed, trackIndex = 0) {', 'export async function createRace(items, seed, trackIndex = 0) { seed = window.__gateSeed ?? seed;')
      .replace(/return \{\s*track,/, 'return window.__gateRace = { track,');
    await route.fulfill({ response, body });
  });
  for (const [seed, side] of [[6, -1], [42, 1]]) {
    await page.goto('http://127.0.0.1:5173');
    await page.evaluate(seed => { localStorage.clear(); window.__gateSeed = seed; }, seed);
    await page.reload();
    await page.evaluate(seed => { window.__gateSeed = seed; }, seed);
    await page.getByRole('button', { name: /레이스 Marble race/ }).click();
    const panel = page.locator('.race-layout');
    await page.waitForFunction(() => window.__gateRace && window.render_game_to_text);
    await panel.getByRole('button', { name: '레이스 시작', exact: true }).click();
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'countdown');
    await page.evaluate(() => window.advanceTime(3200));
    await page.evaluate(side => {
      const race = window.__gateRace, gate = race.samples[Math.round(.45 * (race.samples.length - 1))];
      const q = race.samples.filter(s => s.s < gate.s - 1.5).at(-1), m = race.marbles[0];
      const pos = q.p.clone().addScaledVector(q.side, side * 3.45).addScaledVector(q.up, .52);
      m.body.position.set(pos.x, pos.y, pos.z); m.body.previousPosition.copy(m.body.position);
      m.body.interpolatedPosition.copy(m.body.position); m.body.aabbNeedsUpdate = true;
      m.body.velocity.set(q.tangent.x * 5, q.tangent.y * 5, q.tangent.z * 5); m.body.angularVelocity.set(0, 0, 0);
      m.x = m.px = pos.x; m.y = m.py = pos.y; m.z = m.pz = pos.z;
      m.sampleIndex = m.safeSampleIndex = race.samples.indexOf(q); m.progress = m.bestProgress = q.s;
      m.stall = m.stalls = m.recoveries = 0;
      window.__gateTarget = gate.s + 3;
    }, side);
    let state;
    for (let i = 0; i < 120; i++) {
      await page.evaluate(() => window.advanceTime(100));
      state = await page.evaluate(() => {
        const r = window.__gateRace, m = r.marbles[0];
        return { tick: r.tick, progress: m.progress, target: window.__gateTarget, recoveries: m.recoveries, x: m.x, y: m.y, z: m.z };
      });
      assert.equal(state.recoveries, 0, `seed ${seed}: unexpected respawn`);
      if (i === 2) await panel.locator('.race-canvas').screenshot({ path: `${output}/side-${side}-gate.png` });
      if (state.progress >= state.target) break;
    }
    assert.ok(state.progress >= state.target, `seed ${seed}: did not pass the opening`);
    await panel.locator('.race-canvas').screenshot({ path: `${output}/side-${side}-released.png` });
    results.push({ seed, side, ...state });
  }
  assert.deepEqual(errors, []);
  writeFileSync(`${output}/results.json`, JSON.stringify({ results, errors }, null, 2));
  console.log(JSON.stringify({ results, errors }));
} finally { await browser.close(); }
