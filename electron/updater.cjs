const { verify, createHash } = require('node:crypto');
const { createReadStream, createWriteStream } = require('node:fs');
const fs = require('node:fs/promises');
const path = require('node:path');
const { Readable, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { spawn } = require('node:child_process');
const defaults = require('./update-config.cjs');
const MAX_SIZE = 512 * 1024 * 1024;

function compareVersions(a, b) {
  function parts(v) {
    if (typeof v !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(v)) throw Error('버전 정보를 확인할 수 없습니다.');
    const p = v.split('.').map(Number);
    if (!p.every(Number.isSafeInteger)) throw Error('버전 정보를 확인할 수 없습니다.');
    return p;
  }
  const aa = parts(a), bb = parts(b);
  for (let i = 0; i < 3; i++) if (aa[i] !== bb[i]) return aa[i] > bb[i] ? 1 : -1;
  return 0;
}

const allowedOrigins = config => [new URL(config.baseUrl).origin, ...(config.origins ?? []).map(o => new URL(o).origin)];

function verifyManifest(envelope, current, config = defaults) {
  if (!envelope || envelope.algorithm !== 'Ed25519' || typeof envelope.payload !== 'string' || Buffer.byteLength(envelope.payload) > 32768 || typeof envelope.signature !== 'string' || envelope.signature.length > 256 || !verify(null, Buffer.from(envelope.payload), config.publicKey, Buffer.from(envelope.signature, 'base64'))) throw Error('업데이트 서명 검증에 실패했습니다.');
  const p = JSON.parse(envelope.payload);
  if (p.schemaVersion !== 1 || p.appId !== config.appId || p.channel !== config.channel) throw Error('PL SET 업데이트가 아닙니다.');
  const newer = compareVersions(p.version, current) > 0;
  if (typeof p.updateAvailable !== 'boolean' || p.updateAvailable !== newer) throw Error('업데이트 버전 정보가 일치하지 않습니다.');
  if (!newer) return null;
  if (typeof p.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(p.sha256) || !Number.isSafeInteger(p.size) || p.size <= 0 || p.size > MAX_SIZE) throw Error('업데이트 파일 정보를 확인할 수 없습니다.');
  if (typeof p.filename !== 'string' || !/^[\w .()-]{1,150}\.exe$/i.test(p.filename) || typeof p.releaseNotes !== 'string' || p.releaseNotes.length > 10000) throw Error('업데이트 설치 파일 정보를 확인할 수 없습니다.');
  const url = new URL(p.downloadUrl);
  if (url.protocol !== 'https:' || !allowedOrigins(config).includes(url.origin) || url.username || url.password || url.search || url.hash || !/^\/api\/download\/[a-f0-9-]{36}$/i.test(url.pathname)) throw Error('허용되지 않은 업데이트 주소입니다.');
  return p;
}

async function hashFile(file, expected) {
  const info = await fs.lstat(file);
  if (!info.isFile() || info.isSymbolicLink() || info.size !== expected.size) throw Error('설치 파일 크기가 일치하지 않습니다.');
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  if (hash.digest('hex') !== expected.sha256) throw Error('설치 파일 검증에 실패했습니다. 다시 확인해 주세요.');
}

async function boundedJson(response) {
  if (!response.ok || !response.body) throw Error('업데이트 서버에 연결하지 못했습니다. 다시 확인해 주세요.');
  let size = 0; const chunks = [];
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 65536) throw Error('업데이트 응답이 너무 큽니다.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function launchInstaller(file, directory, spawnProcess = spawn) {
  // NSIS /D must be last. No shell, command string, PowerShell, or batch wrapper.
  return new Promise((resolve, reject) => {
    const child = spawnProcess(file, ['--updated', '/S', '--force-run', `/D=${directory}`], { detached: true, stdio: 'ignore', windowsHide: true });
    child.once('error', reject);
    child.once('spawn', () => { child.unref(); resolve(); });
  });
}

class StarjoaUpdater {
  constructor({ currentVersion, cacheDir, enabled = true, config = defaults, fetchImpl = (...args) => fetch(...args), onChange = () => {}, install = launchInstaller, beforeInstall = async () => {}, quit = () => {}, installDir = '' }) {
    compareVersions(currentVersion, currentVersion);
    Object.assign(this, { currentVersion, cacheDir, enabled, config, fetchImpl, onChange, install, beforeInstall, quit, installDir });
    this.state = { status: enabled ? 'idle' : 'disabled', currentVersion, version: null, progress: 0, message: '', notes: '' };
    this.operation = null; this.candidate = null; this.file = null;
  }
  snapshot() { return { ...this.state }; }
  set(patch) { this.state = { ...this.state, ...patch }; this.onChange(this.snapshot()); }
  async manifest() {
    const url = new URL(`/api/updates/${this.config.appId}`, this.config.baseUrl);
    url.searchParams.set('current', this.currentVersion); url.searchParams.set('channel', this.config.channel);
    const data = await boundedJson(await this.fetchImpl(url, { signal: AbortSignal.timeout(15000), redirect: 'error', cache: 'no-store' }));
    if (data.updateAvailable === false && data.reason === 'no-versioned-release') return null;
    return verifyManifest(data, this.currentVersion, this.config);
  }
  async download(manifest) {
    await fs.mkdir(this.cacheDir, { recursive: true });
    const file = path.join(this.cacheDir, `${manifest.version}-${manifest.sha256}.exe`);
    try { await hashFile(file, manifest); return file; } catch { await fs.rm(file, { force: true }); }
    const partial = file + '.partial';
    await fs.rm(partial, { force: true });
    let url = new URL(manifest.downloadUrl), response;
    const signal = AbortSignal.timeout(10 * 60 * 1000);
    for (let i = 0; i < 5; i++) {
      if (url.protocol !== 'https:' || url.username || url.password || (!allowedOrigins(this.config).includes(url.origin) && !this.config.downloadHosts.includes(url.hostname))) throw Error('허용되지 않은 다운로드 주소입니다.');
      response = await this.fetchImpl(url, { signal, redirect: 'manual' });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      await response.body?.cancel();
      const location = response.headers.get('location');
      if (!location) throw Error('다운로드 주소를 확인할 수 없습니다.');
      url = new URL(location, url); response = null;
    }
    if (!response?.ok || !response.body) throw Error('설치 파일을 내려받지 못했습니다. 다시 확인해 주세요.');
    const length = response.headers.get('content-length');
    if (length && Number(length) !== manifest.size) { await response.body.cancel(); throw Error('설치 파일 크기가 일치하지 않습니다.'); }
    const hash = createHash('sha256'); let size = 0, lastProgress = -1;
    try {
      await pipeline(Readable.fromWeb(response.body), new Transform({ transform: (chunk, _, done) => {
        size += chunk.length;
        if (size > manifest.size) return done(Error('설치 파일 크기가 일치하지 않습니다.'));
        hash.update(chunk);
        const progress = Math.floor(size / manifest.size * 100);
        if (progress !== lastProgress) { lastProgress = progress; this.set({ progress }); }
        done(null, chunk);
      } }), createWriteStream(partial, { flags: 'wx' }), { signal });
      if (size !== manifest.size || hash.digest('hex') !== manifest.sha256) throw Error('설치 파일 검증에 실패했습니다. 다시 확인해 주세요.');
      await fs.rename(partial, file);
      return file;
    } catch (error) { await fs.rm(partial, { force: true }); throw error; }
  }
  check() {
    if (!this.enabled || this.state.status === 'installing') return Promise.resolve(this.snapshot());
    if (this.operation) return this.operation;
    this.operation = this.checkOnce().finally(() => { this.operation = null; });
    return this.operation;
  }
  async checkOnce() {
    this.set({ status: 'checking', message: '', progress: 0 });
    this.candidate = null; this.file = null;
    try {
      const manifest = await this.manifest();
      if (!manifest) { this.set({ status: 'latest', version: null, notes: '' }); return this.snapshot(); }
      this.set({ status: 'downloading', version: manifest.version, notes: manifest.releaseNotes });
      const file = await this.download(manifest);
      this.candidate = manifest; this.file = file;
      this.set({ status: 'ready', progress: 100 });
    } catch (error) {
      this.set({ status: 'error', message: /[가-힣]/.test(error.message) ? error.message : '업데이트를 확인하지 못했습니다. 잠시 후 다시 확인해 주세요.' });
    }
    return this.snapshot();
  }
  async apply() {
    if (!this.enabled || this.operation || this.state.status !== 'ready' || !this.candidate || !this.file) return false;
    this.set({ status: 'installing', message: '' });
    try {
      // Recheck the publisher before execution: withdrawn/replaced releases must not install.
      const fresh = await this.manifest(), candidate = this.candidate;
      if (!fresh || fresh.version !== candidate.version || fresh.sha256 !== candidate.sha256 || fresh.size !== candidate.size || fresh.downloadUrl !== candidate.downloadUrl) throw Error('배포 정보가 변경되었습니다. 업데이트를 다시 확인해 주세요.');
      await hashFile(this.file, candidate);
      await this.beforeInstall();
      await this.install(this.file, this.installDir);
      this.quit();
      return true;
    } catch (error) {
      this.candidate = null; this.file = null;
      this.set({ status: 'error', message: /[가-힣]/.test(error.message) ? error.message : '설치를 시작하지 못했습니다. 다시 확인해 주세요.' });
      return false;
    }
  }
}
module.exports = { StarjoaUpdater, verifyManifest, compareVersions, hashFile, launchInstaller };
