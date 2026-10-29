import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';

const dir = 'output/race-recovery'; mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const results = [];
  for (let track = 0; track < 6; track++) {
    await page.goto('http://127.0.0.1:5173');
    await page.evaluate(() => localStorage.clear()); await page.reload();
    await page.getByRole('button', { name: '레이스 Marble race 05', exact: true }).click();
    const panel = page.locator('.race-layout');
    await panel.getByRole('group', { name: '레이스 테마' }).getByRole('button').nth(track).click();
    await page.waitForFunction(track => window.render_game_to_text && JSON.parse(window.render_game_to_text()).track === track, track);
    await panel.getByRole('button', { name: '레이스 시작', exact: true }).click();
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'countdown');
    let state, captured = false;
    for (let i = 0; i < 160; i++) {
      await page.evaluate(() => window.advanceTime(1000));
      state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
      if (!captured && state.balls.some(b => b.progress > (track === 0 ? 328 : state.finish * .65))) {
        await page.waitForTimeout(120);
        await panel.locator('.race-canvas').screenshot({ path: `${dir}/track-${track}-racing.png` }); captured = true;
      }
      if (state.mode === 'complete') break;
    }
    assert.equal(state.mode, 'complete', `track ${track} did not finish`);
    assert.equal(state.results.length, 10);
    assert.equal(new Set(state.results).size, 10);
    results.push({ track, seconds: state.seconds, finishers: state.results.length });
    await page.screenshot({ path: `${dir}/track-${track}-finished.png` });
    console.log(JSON.stringify(results.at(-1)));
  }
  assert.deepEqual(errors, []);
  writeFileSync(`${dir}/results.json`, JSON.stringify({ results, errors }, null, 2));
} finally { await browser.close(); }
