const { test } = require('node:test');
const assert = require('node:assert/strict');
const { generateKeyPairSync, sign, createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { EventEmitter } = require('node:events');
const { StarjoaUpdater, verifyManifest, compareVersions, launchInstaller } = require('./updater.cjs');
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const config = { baseUrl: 'https://updates.example', appId: 'plset', channel: 'stable', publicKey, downloadHosts: ['files.example'] };
const bytes = Buffer.from('MZ test installer fixture; never executed');
function payload(patch = {}) { return { schemaVersion: 1, appId: 'plset', channel: 'stable', version: '0.1.1', updateAvailable: true, filename: 'PL SET Setup 0.1.1.exe', sha256: createHash('sha256').update(bytes).digest('hex'), size: bytes.length, downloadUrl: 'https://updates.example/api/download/12345678-1234-1234-1234-123456789012', releaseNotes: '업데이트 연결', ...patch }; }
function envelope(value) { const text = JSON.stringify(value); return { algorithm: 'Ed25519', payload: text, signature: sign(null, Buffer.from(text), privateKey).toString('base64') }; }
async function fixture(t, options = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'plset-updater-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const tracker = { downloads: 0, installs: 0, quits: 0, saved: 0, manifest: payload(), body: bytes, downloadHost: 'files.example' };
  const fetchImpl = async url => {
    const u = new URL(url);
    if (u.pathname.startsWith('/api/updates/')) return Response.json(envelope(tracker.manifest));
    if (u.pathname.startsWith('/api/download/')) return new Response(null, { status: 302, headers: { location: `https://${tracker.downloadHost}/installer.exe` } });
    tracker.downloads++;
    return new Response(tracker.body);
  };
  const updater = new StarjoaUpdater({ currentVersion: '0.1.0', config, cacheDir: dir, installDir: 'C:\\Apps With Spaces\\PL SET', fetchImpl, beforeInstall: async () => { tracker.saved++; }, install: async () => { tracker.installs++; }, quit: () => { tracker.quits++; }, ...options });
  return { updater, tracker, dir };
}

test('versions compare numerically and reject malformed or unsafe numbers', () => {
  assert.equal(compareVersions('1.10.0', '1.9.0'), 1);
  for (const version of ['1.01.0', '1.0', '1.0.0-beta', '9007199254740992.0.0']) assert.throws(() => compareVersions(version, '0.1.0'));
  assert.equal(verifyManifest(envelope(payload({ version: '0.0.9', updateAvailable: false })), '0.1.0', config), null);
});
test('publisher signature, app, channel, safe origin/path, installer and size are enforced', () => {
  assert.equal(verifyManifest(envelope(payload()), '0.1.0', config).version, '0.1.1');
  const tampered = envelope(payload()); tampered.payload += ' ';
  assert.throws(() => verifyManifest(tampered, '0.1.0', config), /서명/);
  for (const patch of [{ appId: 'keykey' }, { channel: 'beta' }, { downloadUrl: 'https://evil.example/setup.exe' }, { downloadUrl: 'https://updates.example/api/admin/session' }, { filename: '../setup.exe' }, { filename: 'setup.zip' }, { size: 513 * 1024 * 1024 }, { updateAvailable: false }]) {
    assert.throws(() => verifyManifest(envelope(payload(patch)), '0.1.0', config));
  }
});
test('download URLs on a listed alternate origin are accepted; unlisted origins stay rejected', () => {
  const alt = { ...config, origins: ['https://alt.example'] }, onAlt = payload({ downloadUrl: 'https://alt.example/api/download/12345678-1234-1234-1234-123456789012' });
  assert.equal(verifyManifest(envelope(onAlt), '0.1.0', alt).version, '0.1.1');
  assert.throws(() => verifyManifest(envelope(onAlt), '0.1.0', config), /허용되지 않은/);
  assert.throws(() => verifyManifest(envelope(payload({ downloadUrl: 'https://other.example/api/download/12345678-1234-1234-1234-123456789012' })), '0.1.0', alt), /허용되지 않은/);
  assert.throws(() => verifyManifest(envelope(payload({ downloadUrl: 'http://alt.example/api/download/12345678-1234-1234-1234-123456789012' })), '0.1.0', alt), /허용되지 않은/);
});
test('concurrent checks download once; verified cache is reused; check never installs', async t => {
  const { updater, tracker } = await fixture(t);
  await Promise.all([updater.check(), updater.check(), updater.check()]);
  assert.equal(updater.snapshot().status, 'ready'); assert.equal(tracker.downloads, 1); assert.equal(tracker.installs, 0);
  await updater.check(); assert.equal(tracker.downloads, 1);
  assert.equal(await updater.apply(), true); assert.equal(tracker.saved, 1); assert.equal(tracker.installs, 1); assert.equal(tracker.quits, 1);
});
test('hash mismatch, oversize and truncated transfers never produce an installable file', async t => {
  for (const body of [Buffer.alloc(bytes.length, 1), Buffer.concat([bytes, bytes]), bytes.subarray(0, 3)]) {
    const { updater, tracker, dir } = await fixture(t); tracker.body = body;
    await updater.check(); assert.equal(updater.snapshot().status, 'error');
    assert.deepEqual(await fs.readdir(dir), []); assert.equal(await updater.apply(), false); assert.equal(tracker.installs, 0);
  }
});
test('redirect to an unapproved host is rejected before requesting it', async t => {
  const { updater, tracker } = await fixture(t); tracker.downloadHost = 'evil.example';
  await updater.check(); assert.equal(updater.snapshot().status, 'error'); assert.equal(tracker.downloads, 0);
});
test('cache tampering is rechecked immediately before installer execution', async t => {
  const { updater, tracker } = await fixture(t); await updater.check();
  await fs.writeFile(updater.file, Buffer.alloc(bytes.length, 0));
  assert.equal(await updater.apply(), false); assert.equal(tracker.installs, 0); assert.equal(tracker.quits, 0);
});
test('withdrawn or replaced release cannot execute from cache', async t => {
  const { updater, tracker } = await fixture(t); await updater.check();
  tracker.manifest = payload({ version: '0.1.0', updateAvailable: false });
  assert.equal(await updater.apply(), false); assert.equal(tracker.installs, 0);
});
test('offline check, save failure and spawn failure leave the application running', async t => {
  const offline = await fixture(t, { fetchImpl: async () => { throw Error('offline'); } });
  await offline.updater.check(); assert.equal(offline.updater.snapshot().status, 'error');
  for (const options of [{ beforeInstall: async () => { throw Error('save failed'); } }, { install: async () => { throw Error('spawn failed'); } }]) {
    const { updater, tracker } = await fixture(t, options); await updater.check();
    assert.equal(await updater.apply(), false); assert.equal(tracker.quits, 0);
  }
});
test('NSIS uses exact argv, existing directory and hidden detached process without shell', async () => {
  let invocation;
  await launchInstaller('C:\\Cache\\setup.exe', 'D:\\My Apps\\PL SET', (...args) => {
    invocation = args; const child = new EventEmitter(); child.unref = () => {};
    queueMicrotask(() => child.emit('spawn')); return child;
  });
  assert.deepEqual(invocation, ['C:\\Cache\\setup.exe', ['--updated', '/S', '--force-run', '/D=D:\\My Apps\\PL SET'], { detached: true, stdio: 'ignore', windowsHide: true }]);
});
