// Verify the public release and both update feed origins. Does not install anything.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { verifyManifest } = require('../electron/updater.cjs');
const { version } = require('../package.json');
const root = path.resolve(__dirname, '..');
const receipt = JSON.parse(fs.readFileSync(path.join(root, `output/release-${version}-published.json`), 'utf8'));
const notes = fs.readFileSync(path.join(root, `docs/releases/${version}.md`), 'utf8').trim();
(async () => {
  for (const base of ['https://starjoa.kr', 'https://starjoa.vercel.app']) {
    const response = await fetch(`${base}/api/catalog`);
    assert.equal(response.status, 200);
    const catalog = await response.json();
    const release = catalog.releases.find(r => r.id === receipt.id);
    assert.ok(release);
    for (const key of ['version', 'filename', 'sha256', 'size']) assert.equal(release[key], receipt[key]);
    assert.equal(release.notes, notes);
    assert.ok(catalog.releases.some(r => r.appId === 'plset' && r.version === '0.2.3'), 'previous release retained');
    for (const current of ['0.2.3', version]) {
      const response = await fetch(`${base}/api/updates/plset?current=${current}&channel=stable`);
      assert.equal(response.status, 200);
      const manifest = verifyManifest(await response.json(), current);
      if (current === version) assert.equal(manifest, null);
      else {
        assert.equal(manifest.version, version);
        assert.equal(manifest.sha256, receipt.sha256);
        assert.equal(manifest.size, receipt.size);
        assert.equal(manifest.releaseNotes, notes);
        assert.equal(new URL(manifest.downloadUrl).pathname, `/api/download/${receipt.id}`);
      }
    }
    console.log(`PASS ${base}: catalog, release notes, signed upgrade and no reinstall`);
  }
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const response = await page.goto('https://starjoa.kr/programs/plset', { waitUntil: 'networkidle' });
    assert.equal(response.status(), 200);
    assert.ok((await page.locator('.detail-hero-action').innerText()).includes(`v${version}`));
    assert.equal(await page.getByRole('link', { name: 'PL SET 다운로드', exact: true }).getAttribute('href'), `/api/download/${receipt.id}`);
    assert.ok((await page.locator('.download-panel').innerText()).includes(receipt.filename));
    const latest = page.locator('.release-history article').first();
    assert.equal(await latest.locator('h3').innerText(), `v${version}`);
    assert.equal((await latest.locator('p').innerText()).trim(), notes);
    await page.screenshot({ path: path.join(root, `output/release-${version}-website.png`), fullPage: true });
    await page.goto('https://starjoa.kr', { waitUntil: 'networkidle' });
    assert.ok((await page.locator('body').innerText()).includes(`v${version}`));
    assert.deepEqual(errors, []);
    console.log('PASS public website: latest version, download button, notes, homepage, no page errors');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
