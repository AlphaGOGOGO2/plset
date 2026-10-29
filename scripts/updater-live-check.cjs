// Runs the actual app updater against Starjoa. It never executes an installer.
const { StarjoaUpdater } = require('../electron/updater.cjs');
const { version } = require('../package.json');
const path = require('node:path');
const fs = require('node:fs/promises');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..', 'output');
const cacheDir = path.join(root, `updater-live-${Date.now()}`);
const currentVersion = process.argv[2] || version;
(async () => {
  const updater = new StarjoaUpdater({ currentVersion, cacheDir, install: async () => { throw Error('Installer execution is prohibited in this check'); } });
  try {
    const state = await updater.check();
    assert(['latest', 'ready'].includes(state.status), state.message || state.status);
    if (state.status === 'ready') {
      assert.equal(state.version, version);
      console.log(`PASS live Starjoa: ${currentVersion} -> ${state.version}, pinned Ed25519 signature and complete R2 download SHA-256 verified`);
    } else console.log(`PASS live Starjoa: ${currentVersion} is current; no downgrade or reinstall`);
  } finally {
    if (path.dirname(cacheDir) === root && path.basename(cacheDir).startsWith('updater-live-')) await fs.rm(cacheDir, { recursive: true, force: true });
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
