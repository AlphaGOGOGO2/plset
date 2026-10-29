import { chromium, _electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const native=process.argv.includes('--native'),dir=native?'output/race-canyon-native':'output/race-canyon';mkdirSync(dir,{recursive:true});
const env={...process.env,PLSET_DEV:'1',PLSET_TEST:'1',PLSET_TEST_DATA:path.resolve(dir,`session-${Date.now()}`)};delete env.ELECTRON_RUN_AS_NODE;
const app=native?await _electron.launch({executablePath:path.resolve('node_modules/electron/dist/electron.exe'),args:['.'],cwd:process.cwd(),env,timeout:30000}):null;
const browser=native?null:await chromium.launch({channel:'chrome',headless:true,args:['--use-gl=angle','--use-angle=swiftshader']});
try {
 const page=app?await app.firstWindow():await browser.newPage({viewport:{width:1536,height:980}}),errors=[];
 page.setDefaultTimeout(15000);
 if(app)await app.evaluate(({BrowserWindow})=>{const win=BrowserWindow.getAllWindows()[0];win.setPosition(-20000,-20000);win.showInactive();});
 console.log(native?'Electron ready':'Browser ready');
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('http://127.0.0.1:5173');await page.getByRole('button',{name:'레이스 Marble race 05',exact:true}).click();
 const panel=page.locator('.race-layout'),select=panel.getByRole('combobox',{name:'참가 대상',exact:true});
 assert.equal(await panel.getByRole('button',{name:/사진 (ON|OFF)/}).count(),0);
 assert.equal(await panel.getByRole('button',{name:'랜덤 테마',exact:true}).count(),0);
 assert.equal(await panel.getByRole('button',{name:'마지막 추적',exact:true}).count(),0);
 assert.equal(await panel.getByRole('group',{name:'레이스 테마'}).getByRole('button').count(),6);
 for(const size of [{width:1536,height:980},{width:1120,height:680}]){
  await page.setViewportSize(size);
  for(const view of ['선두 추적','전체 코스','선두 추적']){
   await panel.getByRole('button',{name:view,exact:true}).click();
   for(const label of ['A팀','B팀','직접 입력','전체 참가자']){
    assert.ok(await select.isEnabled());await select.click();
    const option=panel.getByRole('option',{name:label,exact:true});
    assert.ok(await option.evaluate(el=>{const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return hit===el||el.contains(hit);}));
    await option.click();assert.equal(await select.innerText(),label);assert.equal(await select.getAttribute('aria-expanded'),'false');
   }
  }
 }
 await select.focus();await select.press('End');await select.press('Enter');assert.equal(await select.innerText(),'직접 입력');
 await select.click();await select.press('Escape');assert.equal(await select.getAttribute('aria-expanded'),'false');
 await select.click();await panel.getByRole('option',{name:'전체 참가자',exact:true}).click();
 await page.setViewportSize({width:1536,height:980});
 await panel.getByRole('group',{name:'레이스 테마'}).getByRole('button').nth(5).click();
 await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).track===5);
 await panel.getByRole('button',{name:'전체 코스',exact:true}).click();await page.waitForTimeout(1000);
 await page.screenshot({path:`${dir}/overview.png`});
 await panel.getByRole('button',{name:'레이스 시작',exact:true}).click();
 await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).mode==='countdown');
 await panel.getByRole('button',{name:'설정',exact:true}).click();assert.ok(await select.isDisabled());
 await panel.getByRole('button',{name:'레이스 취소',exact:true}).click();assert.ok(await select.isEnabled());
 await select.click();await panel.getByRole('option',{name:'전체 참가자',exact:true}).click();
 await panel.getByRole('button',{name:'레이스 시작',exact:true}).click();
 await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).mode==='countdown');
 await panel.getByRole('button',{name:'선두 추적',exact:true}).click();
 await page.evaluate(()=>window.advanceTime(12000));
 const read=async()=>JSON.parse(await page.evaluate(()=>window.render_game_to_text()));
 const first=await read();
 await page.waitForTimeout(350);await panel.locator('.race-canvas').screenshot({path:`${dir}/leader.png`});
 await panel.getByRole('button',{name:'전체 코스',exact:true}).click();await page.waitForTimeout(400);
 const overview=await read();assert.equal(overview.view,'overview');assert.equal(overview.followedId,null);assert.equal(overview.sceneId,first.sceneId);assert.ok(overview.tick>=first.tick);
 assert.ok(Math.hypot(overview.camera.x-first.camera.x,overview.camera.z-first.camera.z)>2);
 await panel.locator('.race-canvas').screenshot({path:`${dir}/overview-racing.png`});
 await panel.getByRole('button',{name:'선두 추적',exact:true}).click();
 assert.equal(await panel.locator('.race-label img:visible').count(),0);
 let state=await read(),captured=false;
 for(let i=0;i<180&&state.mode!=='complete';i++){
  await page.evaluate(()=>window.advanceTime(1000));state=await read();
  if(state.balls.length)assert.equal(state.followedId,state.balls[0].id);
  if(!captured&&state.balls.length&&state.balls.at(-1).progress>state.length*.8){await panel.locator('.race-canvas').screenshot({path:`${dir}/last-stretch.png`});captured=true;}
 }
 assert.equal(state.mode,'complete');assert.equal(state.results.length,10);
 await page.waitForTimeout(250);assert.ok(await select.isEnabled());
 await select.click();await panel.getByRole('option',{name:'A팀',exact:true}).click();assert.equal(await select.innerText(),'A팀');
 await page.screenshot({path:`${dir}/finished.png`});
 assert.deepEqual(errors,[]);
 writeFileSync(`${dir}/results.json`,JSON.stringify({seconds:state.seconds,length:state.length,results:state.results.length,selectionChecks:24,errors},null,2));
 console.log(JSON.stringify({seconds:state.seconds,length:state.length,results:state.results.length,selectionChecks:24,errors}));
} finally {if(app)await app.close();if(browser)await browser.close();}
