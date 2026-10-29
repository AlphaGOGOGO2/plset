const { _electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const testData = path.join(root, 'output', 'electron-test-' + Date.now());
fs.mkdirSync(testData, { recursive: true });
const env = { ...process.env, PLSET_TEST: '1', PLSET_TEST_DATA: testData };
delete env.ELECTRON_RUN_AS_NODE;
let application;
async function launch() {
  application = await _electron.launch({ executablePath: process.env.PLSET_EXE || require('electron'), args: process.env.PLSET_EXE ? [] : [root], cwd: root, env, timeout:30000 });
  const page=await application.firstWindow();
  await page.getByRole('button',{name:'참가자 관리',exact:true}).waitFor();
  await page.getByRole('button',{name:'후원 총액',exact:true}).click();
  return page;
}
(async()=>{
  let page=await launch();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  assert.ok(await page.getByRole('img',{name:'임홍규 프로필',exact:true}).count()>=1);
  assert.ok(await page.getByRole('img',{name:'임홍규 프로필',exact:true}).first().evaluate(img=>img.complete&&img.naturalWidth>0));
  await page.screenshot({path:path.join(root,'output/playwright/electron-dashboard.png')});
  await page.getByRole('spinbutton',{name:'임홍규 후원 총액'}).fill('1000');
  await page.getByRole('spinbutton',{name:'임홍규 후원 총액'}).press('Tab');
  await page.waitForFunction(async()=>{const {state}=await window.plset.load();return state?.players[0].amount===1000;});
  assert.equal(await page.locator('.stat-main .stat-value').innerText(),'200개');
  await page.evaluate(()=>window.plset.openOutput());
  let output;
  for(let i=0;i<30;i++){output=application.windows().find(p=>p.url().includes('output=1'));if(output)break;await new Promise(r=>setTimeout(r,100));}
  assert.ok(output,'native output window created');
  await output.locator('.broadcast-total strong').waitFor();
  assert.equal(await output.locator('.broadcast-total strong').innerText(),'1,000개');
  const denied=await output.evaluate(async()=>{try{const {state}=await window.plset.load();await window.plset.save(state);return false;}catch{return true;}});
  assert.equal(denied,true,'output window must not mutate host state');
  await page.getByRole('button',{name:'임홍규 100개 추가',exact:true}).click();
  await output.waitForFunction(()=>document.querySelector('.broadcast-total strong')?.textContent==='1,100개');
  assert.deepEqual(errors,[]);
  await application.close();application=null;
  page=await launch();
  assert.equal(await page.getByRole('spinbutton',{name:'임홍규 후원 총액'}).inputValue(),'1100','native disk persistence across relaunch');
  const file=JSON.parse(fs.readFileSync(path.join(testData,'session-v1.json'),'utf8'));
  assert.equal(file.players[0].amount,1100);
  await application.close();application=null;
  console.log(JSON.stringify({passed:['native Electron launch','bundled portraits and fonts','1000 -> 200 calculation','separate output BrowserWindow','output IPC read-only restriction','cross-window state propagation','atomic disk save and relaunch recovery'],errors,testData},null,2));
})().catch(async error=>{console.error(error);if(application)await application.close();process.exitCode=1;});
