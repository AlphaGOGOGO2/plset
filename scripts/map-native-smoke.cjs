const {_electron}=require('playwright');
const assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..'),env={...process.env,PLSET_TEST:'1',PLSET_TEST_DATA:path.join(root,'output',`map-native-${Date.now()}`)};delete env.ELECTRON_RUN_AS_NODE;let app;
(async()=>{
 app=await _electron.launch({executablePath:path.join(root,'release-build/win-unpacked/PLSet.exe'),cwd:root,env,timeout:30000});const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.getByRole('button',{name:'핀볼 Pinball 03',exact:true}).click();
 assert.equal(await page.getByRole('combobox',{name:'당첨자 설정',exact:true}).inputValue(),'last');
 assert.equal(await page.evaluate(()=>typeof window.advanceTime),'undefined');
 await page.getByRole('combobox',{name:'추첨 대상',exact:true}).selectOption('custom');const input=page.getByRole('textbox',{name:'추첨 항목 입력',exact:true});
 for(const label of ['첫 항목','두번째']){await input.fill(label);await input.press('Enter');}
 await page.getByRole('button',{name:'첫 항목 삭제',exact:true}).click();assert.equal(await page.locator('.draw-custom-badge:visible').count(),1);
 await page.getByRole('combobox',{name:'모드',exact:true}).selectOption('ace');
 assert.ok(await page.locator('.draw-ball-count-field').evaluate(el=>getComputedStyle(el).textAlign==='center'));
 await page.getByRole('combobox',{name:'모드',exact:true}).selectOption('maps');await page.getByRole('button',{name:'추첨 시작',exact:true}).click();
 await page.getByRole('heading',{name:'경기별 맵',exact:true}).waitFor({timeout:180000});
 const {state}=await page.evaluate(()=>window.plset.load());assert.equal(state.draw.variant,'maps');assert.equal(state.draw.results.length,7);assert.equal(new Set(state.draw.results).size,7);assert.equal(state.draw.winner,undefined);
 const expected=state.draw.results.map(id=>state.draw.items.find(i=>i.id===id).label);assert.deepEqual(await page.locator('.match-map-schedule b').allTextContents(),expected);
 await page.screenshot({path:path.join(root,'output/playwright/native-map-result.png')});await page.reload();await page.getByRole('button',{name:'핀볼 Pinball 03',exact:true}).click();assert.deepEqual(await page.locator('.match-map-schedule b').allTextContents(),expected);assert.deepEqual(errors,[]);
 await app.close();app=null;console.log(JSON.stringify({passed:['native badges','default last','ACE centered','7 map physical finishes','IPC save/reload','no page errors']}));
})().catch(async e=>{console.error(e);if(app)await app.close();process.exitCode=1;});
