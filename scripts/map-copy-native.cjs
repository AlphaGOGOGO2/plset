const {_electron}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const root=path.resolve(__dirname,'..'),testData=path.join(root,'output',`map-copy-native-${Date.now()}`);
const source=fs.readdirSync(path.join(root,'output')).filter(n=>/^map-native-/.test(n)).sort().at(-1);assert.ok(source,'completed map fixture');
fs.mkdirSync(testData,{recursive:true});fs.copyFileSync(path.join(root,'output',source,'session-v1.json'),path.join(testData,'session-v1.json'));
const env={...process.env,PLSET_TEST:'1',PLSET_TEST_DATA:testData};delete env.ELECTRON_RUN_AS_NODE;let app,oldClipboard;
(async()=>{
 app=await _electron.launch({executablePath:path.join(root,'release-build/win-unpacked/PLSet.exe'),cwd:root,env,timeout:30000});const page=await app.firstWindow();
 oldClipboard=await app.evaluate(({clipboard})=>clipboard.readText());
 await page.getByRole('button',{name:'핀볼 Pinball 03',exact:true}).click();const {state}=await page.evaluate(()=>window.plset.load());
 const expected=state.draw.results.map(id=>state.draw.items.find(i=>i.id===id).label).join(' ');assert.equal(expected.split(' ').length,7);
 await page.getByRole('button',{name:'결과 복사하기',exact:true}).click();await page.getByRole('status').filter({hasText:'맵 순서를 복사했습니다.'}).waitFor();assert.equal(await app.evaluate(({clipboard})=>clipboard.readText()),expected);
 await page.screenshot({path:path.join(root,'output/playwright/map-copy-native.png')});
 await page.getByRole('combobox',{name:'모드',exact:true}).selectOption('ace');assert.equal(await page.getByRole('button',{name:'결과 복사하기',exact:true}).count(),0);
 console.log(JSON.stringify({passed:['native clipboard plain text','game order preserved','single spaces no extra labels','maps result only'],copied:expected}));
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(app){if(oldClipboard!==undefined)await app.evaluate(({clipboard},text)=>clipboard.writeText(text),oldClipboard);await app.close()}});
