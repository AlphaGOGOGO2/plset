const {_electron}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..'),env={...process.env,PLSET_TEST:'1',PLSET_TEST_DATA:path.join(root,'output',`navigation-native-${Date.now()}`)};delete env.ELECTRON_RUN_AS_NODE;let app;
(async()=>{
 app=await _electron.launch({executablePath:path.join(root,'release-build/win-unpacked/PLSet.exe'),args:['--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding','--disable-background-timer-throttling','--disable-features=CalculateNativeWinOcclusion'],cwd:root,env,timeout:30000});
 const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await app.evaluate(({BrowserWindow})=>{const win=BrowserWindow.getAllWindows()[0];win.setPosition(-20000,-20000);win.showInactive();});
 await page.getByRole('button',{name:'핀볼 Pinball 03',exact:true}).click();const panel=page.locator('.pinball-layout:not(.race-layout)'),mini=panel.getByRole('button',{name:'미니맵 탐색',exact:true});
 assert.equal(await panel.getByRole('combobox',{name:'코스',exact:true}).inputValue(),'14');assert.equal(await page.evaluate(()=>typeof window.advanceTime),'undefined');
 await page.waitForTimeout(400);let b=await mini.boundingBox();await page.mouse.move(b.x+b.width*.5,b.y+b.height*.95);await page.waitForTimeout(500);assert.equal(await mini.getAttribute('data-inspecting'),'true');await page.screenshot({path:path.join(root,'output/playwright/pinball-navigation-native-preview.png')});
 await page.mouse.move(900,600);assert.equal(await mini.getAttribute('data-inspecting'),null);
 await panel.getByRole('button',{name:'추첨 시작',exact:true}).click();await page.waitForTimeout(5000);await page.screenshot({path:path.join(root,'output/playwright/pinball-camera-native-follow.png')});b=await mini.boundingBox();await page.mouse.move(b.x+b.width*.5,b.y+b.height*.95);await page.waitForTimeout(500);assert.equal(await mini.getAttribute('data-inspecting'),'true');
 await page.screenshot({path:path.join(root,'output/playwright/pinball-navigation-native-racing.png')});await page.mouse.move(900,600);await panel.getByRole('button',{name:'4배속',exact:true}).click();
 await panel.locator('.draw-result strong').waitFor({timeout:120000});let saved;
 for(let i=0;i<20;i++){saved=(await page.evaluate(()=>window.plset.load())).state.draw;if(saved.finishedAt&&saved.results.length===10)break;await page.waitForTimeout(100);}
 assert.equal(saved.map,14);assert.equal(saved.results.length,10);assert.equal(new Set(saved.results).size,10);
 await page.reload();await page.getByRole('button',{name:'핀볼 Pinball 03',exact:true}).click();await page.waitForTimeout(500);assert.deepEqual((await page.evaluate(()=>window.plset.load())).state.draw.results,saved.results);
 await mini.focus();await mini.press('End');await page.waitForTimeout(500);assert.equal(await mini.getAttribute('data-inspecting'),'true');await mini.press('Escape');assert.equal(await mini.getAttribute('data-inspecting'),null);
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:['new course IDs','no dev hooks','native hover and return','live navigation','real-time ten finishes','IPC persistence and reload','keyboard navigation'],errors}));
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(app)await app.close();});
