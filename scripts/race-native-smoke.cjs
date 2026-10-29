const {_electron}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const root=path.resolve(__dirname,'..'),data=path.join(root,'output',`race-native-${Date.now()}`),env={...process.env,PLSET_TEST:'1',PLSET_TEST_DATA:data};delete env.ELECTRON_RUN_AS_NODE;
let app,clipboardBefore;
(async()=>{
 app=await _electron.launch({executablePath:path.join(root,'release-build/win-unpacked/PLSet.exe'),args:['--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding','--disable-background-timer-throttling','--disable-features=CalculateNativeWinOcclusion'],cwd:root,env,timeout:30000});
 const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await app.evaluate(({BrowserWindow})=>{const win=BrowserWindow.getAllWindows()[0];win.setPosition(-20000,-20000);win.showInactive();});
 await page.getByRole('button',{name:'레이스 Marble race 05',exact:true}).click();const panel=page.locator('.race-layout');
 await panel.locator('.race-label:visible').first().waitFor();
 assert.equal(await page.evaluate(()=>typeof window.advanceTime),'undefined');
 assert.equal(await panel.getByRole('group',{name:'레이스 테마'}).getByRole('button').count(),6);
 assert.equal(await panel.getByRole('button',{name:'마지막 추적',exact:true}).count(),0);
 assert.equal(await panel.getByRole('button',{name:/사진 (ON|OFF)/}).count(),0);
 const source=panel.getByRole('combobox',{name:'참가 대상',exact:true});
 for(const view of ['전체 코스','선두 추적']){
  await panel.getByRole('button',{name:view,exact:true}).click();
  for(const label of ['A팀','B팀','직접 입력','전체 참가자']){
   await source.click();await panel.getByRole('option',{name:label,exact:true}).click();assert.equal(await source.innerText(),label);
  }
 }
 await panel.getByRole('group',{name:'레이스 테마'}).getByRole('button').nth(5).click();
 assert.equal(await panel.getByRole('button',{name:'1.5배속',exact:true}).getAttribute('aria-pressed'),'true');
 const names=await panel.locator('.quantity-card>strong').allTextContents();
 await panel.getByRole('spinbutton',{name:names[0]+' 수량',exact:true}).fill('0');
 await panel.getByRole('spinbutton',{name:names[1]+' 수량',exact:true}).fill('2');
 await page.waitForTimeout(350);
 await page.evaluate(()=>{window.raceContextRequests=0;const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(...args){if(this.classList.contains('race-canvas')&&args[0]==='webgl2')window.raceContextRequests++;return get.apply(this,args);};});
 await page.screenshot({path:path.join(root,'output/playwright/race-native-ready.png')});
 await panel.getByRole('button',{name:'레이스 시작',exact:true}).click();
 assert.equal(await page.evaluate(()=>window.raceContextRequests),0,'start reuses the prepared WebGL context');
 await page.waitForTimeout(6500);
 await page.screenshot({path:path.join(root,'output/playwright/race-native-racing.png')});
 const frameTimes=await page.evaluate(()=>new Promise(resolve=>{const frames=[],start=performance.now();let previous=start;function frame(now){frames.push(now-previous);previous=now;if(now-start>2000)resolve(frames);else requestAnimationFrame(frame);}requestAnimationFrame(frame);}));
 await panel.getByRole('button',{name:'다시 경주',exact:true}).waitFor({timeout:180000});
 await page.waitForTimeout(250);
 const {state}=await page.evaluate(()=>window.plset.load());assert.equal(state.draw.results.length,10);assert.equal(new Set(state.draw.results).size,10);
 assert.equal(state.draw.items.filter(i=>i.label===names[0]).length,0);assert.equal(state.draw.items.filter(i=>i.label===names[1]).length,2);
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(data,'session-v1.json'),'utf8')).draw.results,state.draw.results);
 clipboardBefore=await app.evaluate(({clipboard})=>clipboard.readText());
 await panel.getByRole('button',{name:'결과 복사',exact:true}).click();
 const expected=state.draw.results.map((id,i)=>`${i+1}위 ${state.draw.items.find(p=>p.id===id).label}`).join('\n');
 assert.equal((await app.evaluate(({clipboard})=>clipboard.readText())).replace(/\r\n/g,'\n'),expected);
 await page.screenshot({path:path.join(root,'output/playwright/race-native-finished.png')});
 await page.reload();await page.getByRole('button',{name:'레이스 Marble race 05',exact:true}).click();
 await panel.getByRole('button',{name:'다시 경주',exact:true}).waitFor();assert.deepEqual((await page.evaluate(()=>window.plset.load())).state.draw.results,state.draw.results);
 assert.equal(await panel.getByRole('spinbutton',{name:names[0]+' 수량',exact:true}).inputValue(),'0');assert.equal(await panel.getByRole('spinbutton',{name:names[1]+' 수량',exact:true}).inputValue(),'2');
 await panel.getByRole('group',{name:'레이스 테마'}).getByRole('button').nth(4).click();await page.waitForTimeout(500);
 await page.screenshot({path:path.join(root,'output/playwright/race-native-volcano.png')});
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:['packaged WebGL','six themes','participant dropdown in both camera modes','no photos or last-place camera','no dev hooks','real-time 10-player canyon finishes','IPC and disk persistence','clipboard exact ranks','reload','theme switch'],averageFrameMs:frameTimes.reduce((a,b)=>a+b,0)/frameTimes.length,errors}));
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(app){if(clipboardBefore!==undefined)await app.evaluate(({clipboard},text)=>clipboard.writeText(text),clipboardBefore).catch(()=>{});await app.close();}});
