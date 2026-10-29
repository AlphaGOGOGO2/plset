// Uses the existing publisher key only to sign an in-memory test response.
// No test release is published and no installer is executed.
const { _electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseEnv } = require('node:util');
const { sign, createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const exe = process.env.PLSET_EXE || path.join(root, 'release-build/win-unpacked/PLSet.exe');
const testData = path.join(root, 'output', `updater-native-${Date.now()}`);
const env = { ...process.env, PLSET_TEST: '1', PLSET_TEST_DATA: testData };
delete env.ELECTRON_RUN_AS_NODE;
const privateKey = parseEnv(fs.readFileSync(process.argv[2], 'utf8')).UPDATE_PRIVATE_KEY.replace(/\\n/g, '\n');
const bytes = Buffer.from('MZ PL SET updater test - do not execute');
const payload = JSON.stringify({ schemaVersion: 1, appId: 'plset', channel: 'stable', version: '0.1.3', updateAvailable: true, filename: 'PL SET Setup 0.1.3.exe', size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), downloadUrl: 'https://starjoa.vercel.app/api/download/11111111-2222-3333-4444-555555555555', releaseNotes: '테스트 변경 내역' });
const signed = { algorithm: 'Ed25519', payload, signature: sign(null, Buffer.from(payload), privateKey).toString('base64') };
let app;
(async () => {
  app = await _electron.launch({ executablePath: exe, cwd: root, env, timeout: 30000 });
  const page = await app.firstWindow(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('button', { name: '참가자 관리', exact: true }).waitFor();
  assert.equal(await app.evaluate(({ app }) => app.getVersion()), '0.1.2');
  await app.evaluate(({ dialog }, fixture) => {
    globalThis.__requests = 0; globalThis.__confirmations = 0;
    globalThis.fetch = async url => {
      globalThis.__requests++;
      if (new URL(url).pathname.startsWith('/api/updates/')) return Response.json(fixture.signed);
      return new Response(Buffer.from(fixture.bytes, 'base64'));
    };
    dialog.showMessageBox = async () => { globalThis.__confirmations++; return { response: 0, checkboxChecked: false }; };
  }, { signed, bytes: bytes.toString('base64') });
  // The startup timer must discover and download without a manual check click.
  await page.getByRole('button', { name: '설치 및 재시작', exact: true }).waitFor({ timeout: 20000 });
  assert.equal((await page.evaluate(() => window.plset.updateStatus())).status, 'ready');
  await page.getByText('변경 내역', { exact: true }).click();
  assert.equal(await page.getByText('테스트 변경 내역', { exact: true }).count(), 1);
  assert.equal(await app.evaluate(() => globalThis.__confirmations), 0);
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1);
  await page.getByRole('textbox', { name: '세션 이름', exact: true }).fill('업데이트 중에도 진행 내용 유지');
  await page.getByRole('button', { name: '설치 및 재시작', exact: true }).click();
  await page.waitForFunction(async () => (await window.plset.updateStatus()).status === 'ready');
  await app.evaluate(async () => {
    for (let i = 0; i < 50; i++) {
      if (globalThis.__confirmations === 1) return;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw Error('Install confirmation did not appear');
  });
  assert.equal((await page.evaluate(() => window.plset.load())).state.title, '업데이트 중에도 진행 내용 유지');
  const saved = JSON.parse(fs.readFileSync(path.join(testData, 'session-v1.json'), 'utf8'));
  assert.equal(saved.title, '업데이트 중에도 진행 내용 유지');
  const download = fs.readdirSync(path.join(testData, 'starjoa-updates')).find(f => f.endsWith('.exe'));
  assert.deepEqual(fs.readFileSync(path.join(testData, 'starjoa-updates', download)), bytes);
  assert.deepEqual(errors, []);
  console.log('PASS packaged 0.1.2: automatic startup check, pinned signature, verified download and ready UI');
  console.log('PASS release notes, explicit install confirmation/cancel, no forced quit and saved session');
  console.log('PASS Electron preload IPC and renderer; zero page errors. Installer execution was intentionally not performed.');
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(async () => {
  if (app) await app.close();
  // Only this test's unique fixture directory, verified inside the project output folder.
  if (path.dirname(testData) === path.join(root, 'output') && path.basename(testData).startsWith('updater-native-')) fs.rmSync(testData, { recursive: true, force: true });
});
