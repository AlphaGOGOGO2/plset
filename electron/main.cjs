const { app, BrowserWindow, ipcMain, dialog, clipboard, protocol, net, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { StarjoaUpdater } = require('./updater.cjs');
protocol.registerSchemesAsPrivileged([{ scheme: 'plset', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
let control, state = null, loadError = null, updater, updatePrompt = false;
const dev = process.env.PLSET_DEV === '1';
if (process.env.PLSET_TEST_DATA) app.setPath('userData', process.env.PLSET_TEST_DATA);
const statePath = () => path.join(app.getPath('userData'), 'session-v1.json');
function allowed(event) {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win !== control) throw new Error('허용되지 않은 요청입니다.');
}
function validate(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.players) || value.players.length > 60 || typeof value.title !== 'string' || value.title.length > 100 || !Number.isInteger(value.teamSize) || value.teamSize < 1 || value.teamSize > 30) throw new Error('올바른 PL SET 세션 파일이 아닙니다.');
  if(value.patrons===undefined)value.patrons=[];
  if(!Array.isArray(value.patrons)||value.patrons.length>500||value.patrons.some(p=>!p||typeof p.id!=='string'||!p.id||typeof p.nickname!=='string'||!p.nickname.trim()||p.nickname.length>60||!Number.isSafeInteger(p.amount)||p.amount<0||p.amount>100000000||typeof p.note!=='string'||p.note.length>200)||new Set(value.patrons.map(p=>p.id)).size!==value.patrons.length)throw new Error('귀인 펀딩 내역을 확인해주세요.');
  const ids = new Set();
  for (const p of value.players) {
    if (!p || typeof p.id !== 'string' || ids.has(p.id) || typeof p.name !== 'string' || !p.name.trim() || p.name.length > 30 || !['T','P','Z'].includes(p.race) || !['A','B',null].includes(p.team) || typeof p.active !== 'boolean' || !Number.isSafeInteger(p.amount) || p.amount < 0 || p.amount > 100000000) throw new Error('참가자 데이터가 올바르지 않습니다.');
    ids.add(p.id);
  }
  if (typeof value.notes !== 'string' || value.notes.length > 5000 || !value.teams || !['A','B'].every(k => typeof value.teams[k] === 'string' && value.teams[k].length <= 30) || !value.score || !['A','B'].every(k => Number.isInteger(value.score[k]) && value.score[k] >= 0 && value.score[k] <= 99)) throw new Error('진행판 데이터가 올바르지 않습니다.');
  if (!value.timer || !Number.isFinite(value.timer.remaining) || value.timer.remaining < 0 || value.timer.remaining > 86400000 || !(value.timer.deadline === null || Number.isFinite(value.timer.deadline)) || typeof value.timer.label !== 'string' || value.timer.label.length > 100) throw new Error('타이머 데이터가 올바르지 않습니다.');
  if (!['board','teams','draw','timer'].includes(value.scene) || !Array.isArray(value.logs) || value.logs.length > 100 || value.logs.some(l => !l || typeof l.id !== 'string' || typeof l.text !== 'string' || l.text.length > 500 || !Number.isFinite(l.at))) throw new Error('진행 기록이 올바르지 않습니다.');
  if (value.draw !== null) {
    const d = value.draw;
    if (!d || !['pinball','wheel','race'].includes(d.mode) || !Array.isArray(d.items) || d.items.length < (d.mode === 'pinball' ? 1 : 2) || d.items.length > 60 || (d.mode === 'race' && d.items.length > 30) || d.items.some(p => !p || typeof p.id !== 'string' || typeof p.label !== 'string' || p.label.length > 80) || !Number.isInteger(d.seed) || !Number.isFinite(d.startedAt) || !Number.isInteger(d.rank) || d.rank < 1 || d.rank > d.items.length || !(d.finishedAt === null || Number.isFinite(d.finishedAt)) || !Array.isArray(d.results) || d.results.some(id => typeof id !== 'string' || !d.items.some(p => p.id === id)) || new Set(d.results).size !== d.results.length) throw new Error('추첨 데이터가 올바르지 않습니다.');
  }
  if(value.draw){
    const d=value.draw,ids=['match-map-1','match-map-2','match-map-3','match-map-4','match-map-5','match-map-6','match-map-7'];
    if(d.mapFormat!==undefined&&!['proleague','winners'].includes(d.mapFormat))throw new Error('맵 추첨 형식을 확인해주세요.');
    if(d.variant==='maps'){
      const labels=['컬러리스페이트','오디세이','녹아웃','아이올로스','백룸','옥타곤','애티튜드'],oldNames=['컬러','오디','넉아','아이','백룸','옥타','에티'];
      d.items=d.items.map(item=>{const i=ids.indexOf(item.id);return i>=0&&item.label===oldNames[i]?{...item,label:labels[i]}:item;});
      const n=d.items.length,itemIds=new Set(d.items.map(item=>item.id));
      if(d.mode!=='pinball'||n<2||n>30||itemIds.size!==n)throw new Error('경기 맵 목록을 확인해주세요.');
      if(d.mapOpening!==undefined&&(d.mapFormat!=='winners'||!Array.isArray(d.mapOpening)||d.mapOpening.length!==n||new Set(d.mapOpening).size!==n||d.mapOpening.some(id=>!itemIds.has(id))))throw new Error(`1~${n}경기 맵을 확인해주세요.`);
      const count=d.mapOpening?2:n;
      if(d.rank!==count||d.results.length>count||(d.finishedAt!==null&&d.results.length!==count))throw new Error('경기 맵 결과를 확인해주세요.');
    }else if(d.mapFormat!==undefined||d.mapOpening!==undefined)throw new Error('맵 추첨 데이터를 확인해주세요.');
  }
  if(value.maps!==undefined&&(!Array.isArray(value.maps)||value.maps.length>30||value.maps.some(m=>!m||typeof m.id!=='string'||!m.id||typeof m.label!=='string'||!m.label.trim()||m.label.length>30)||new Set(value.maps.map(m=>m.id)).size!==value.maps.length))throw new Error('경기 맵 목록을 확인해주세요.');
  if (Buffer.byteLength(JSON.stringify(value)) > 250000) throw new Error('세션 데이터가 너무 큽니다.');
  return value;
}
function persist(next) {
  const text = JSON.stringify(validate(next));
  fs.writeFileSync(statePath() + '.tmp', text, 'utf8');
  fs.renameSync(statePath() + '.tmp', statePath());
  state = next;
}
function broadcast() { if(control && !control.isDestroyed())control.webContents.send('session:changed', state); }
function focusControl() { if(!control || control.isDestroyed())return; if(control.isMinimized())control.restore(); if(!control.isVisible() && process.env.PLSET_TEST !== '1')control.show(); control.focus(); }
function createWindow() {
  const win = new BrowserWindow({ width: 1536, height: 980, minWidth: 1120, minHeight: 680, title: 'PL SET', frame: false, backgroundColor: '#101514', autoHideMenuBar: true, show: false, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  // Block navigation away from the app, but allow same-URL reloads (Vite full reload in dev).
  win.webContents.on('will-navigate', (e, url) => { if (url !== win.webContents.getURL()) e.preventDefault(); });
  win.setIcon(path.join(__dirname, 'assets', 'icon.ico'));
  win.once('ready-to-show', () => { if(process.env.PLSET_TEST !== '1') win.show(); });
  win.loadURL((dev ? 'http://127.0.0.1:5173/' : 'plset://app/index.html'));
  return win;
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', focusControl);
  app.on('activate', focusControl);
  app.whenReady().then(() => {
    protocol.handle('plset', request => {
      const u = new URL(request.url);
      const relative = decodeURIComponent(u.pathname).replace(/^\/+/, '');
      const root = path.resolve(__dirname, '..', 'dist');
      const target = path.resolve(root, relative || 'index.html');
      if (u.host !== 'app' || !target.startsWith(root + path.sep)) return new Response('Forbidden', { status: 403 });
      return net.fetch(pathToFileURL(target).toString());
    });
    session.defaultSession.setPermissionRequestHandler((_, __, callback) => callback(false));
    updater = new StarjoaUpdater({
      currentVersion: app.getVersion(),
      cacheDir: path.join(app.getPath('userData'), 'starjoa-updates'),
      enabled: process.platform === 'win32' && app.isPackaged && !dev,
      installDir: path.dirname(process.execPath),
      onChange: next => { if (control && !control.isDestroyed()) control.webContents.send('update:changed', next); },
      beforeInstall: async () => {
        // electron-builder uses win.executableName for PRODUCT_FILENAME, not productName.
        const uninstaller = path.join(path.dirname(process.execPath), `Uninstall ${path.basename(process.execPath)}`);
        if (!fs.existsSync(uninstaller)) throw Error('설치형 PL SET에서 업데이트할 수 있습니다. 스타조아에서 최신 설치 파일을 받아 설치해 주세요.');
        if (state) { persist(state); fs.copyFileSync(statePath(), statePath() + '.before-update'); }
      },
      quit: () => app.quit(),
    });
    ipcMain.handle('update:status', e => { allowed(e); return updater.snapshot(); });
    ipcMain.handle('update:check', e => { allowed(e); return updater.check(); });
    ipcMain.handle('update:install', async e => {
      allowed(e);
      if (updatePrompt || updater.snapshot().status !== 'ready') return false;
      updatePrompt = true;
      try {
        const { response } = await dialog.showMessageBox(control, {
          type: 'question', title: 'PL SET 업데이트', message: `PL SET ${updater.snapshot().version}을 설치할까요?`,
          detail: '현재 진행 내용을 저장한 뒤 PL SET을 닫고 다시 실행합니다.',
          buttons: ['나중에', '설치 및 재시작'], defaultId: 0, cancelId: 0, noLink: true,
        });
        return response === 1 ? updater.apply() : false;
      } finally { updatePrompt = false; }
    });
    try { if (fs.existsSync(statePath())) state = validate(JSON.parse(fs.readFileSync(statePath(), 'utf8'))); }
    catch { loadError = '저장 파일을 읽지 못했습니다. 기존 파일을 보관하고 새 세션을 시작합니다.'; try { fs.copyFileSync(statePath(), statePath() + '.recovery-' + Date.now()); } catch {} }
    ipcMain.handle('session:load', e => { allowed(e); return { state, error: loadError }; });
    ipcMain.handle('session:save', (e, next) => { allowed(e); persist(next); broadcast(); return true; });
    ipcMain.handle('clipboard:write-text', (e, text) => { allowed(e); if(typeof text !== 'string' || text.length > 10000) throw new Error('복사할 텍스트를 확인해주세요.'); clipboard.writeText(text); return true; });
    // Legacy clients requesting an output window now focus the only control window.
    ipcMain.handle('output:open', e => { allowed(e); focusControl(); });
    ipcMain.handle('report:export', async (e, name, text) => {
      allowed(e);
      if (typeof name !== 'string' || !/^[\w가-힣.-]{1,60}$/.test(name) || typeof text !== 'string' || text.length > 1000000) throw new Error('저장할 내용을 확인해주세요.');
      const { filePath } = await dialog.showSaveDialog(control, { defaultPath: name, filters: [{ name: '텍스트 파일', extensions: ['txt'] }] });
      if (!filePath) return false;
      fs.writeFileSync(filePath, '\ufeff' + text, 'utf8');
      return true;
    });
    ipcMain.handle('session:export', async e => { allowed(e); const { filePath } = await dialog.showSaveDialog(control, { defaultPath: `PLSET-${new Date().toISOString().slice(0,10)}.json`, filters: [{ name: 'PL SET 세션', extensions: ['json'] }] }); if (filePath) { fs.writeFileSync(filePath, JSON.stringify(state, null, 2)); return true; } return false; });
    ipcMain.handle('session:import', async e => { allowed(e); const { filePaths, canceled } = await dialog.showOpenDialog(control, { filters: [{ name: 'PL SET 세션', extensions: ['json'] }], properties: ['openFile'] }); if (canceled) return null; if(fs.statSync(filePaths[0]).size > 250000) throw new Error('파일 크기가 너무 큽니다.'); const next = validate(JSON.parse(fs.readFileSync(filePaths[0], 'utf8'))); persist(next); broadcast(); return next; });
    for (const action of ['minimize','maximize','close']) ipcMain.handle('window:' + action, e => { allowed(e); const win = BrowserWindow.fromWebContents(e.sender); if (action === 'maximize') win.isMaximized() ? win.unmaximize() : win.maximize(); else win[action](); });
    control = createWindow();
    control.on('closed', () => { control = null; });
    // Silent checks and downloads never quit an ongoing broadcast.
    const startupCheck = setTimeout(() => void updater.check(), 5000);
    const periodicCheck = setInterval(() => { if (updater.snapshot().status !== 'ready') void updater.check(); }, 4 * 60 * 60 * 1000);
    startupCheck.unref(); periodicCheck.unref();
  });
  app.on('window-all-closed', () => app.quit());
}
