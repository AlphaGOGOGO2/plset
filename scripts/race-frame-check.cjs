const {_electron}=require('playwright'),path=require('node:path');
const root=path.resolve(__dirname,'..');let app;
(async()=>{
 const env={...process.env,PLSET_TEST:'1',PLSET_TEST_DATA:path.join(root,'output',`race-frame-${Date.now()}`)};delete env.ELECTRON_RUN_AS_NODE;
 app=await _electron.launch({executablePath:path.join(root,'release-build/win-unpacked/PLSet.exe'),args:['--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding','--disable-features=CalculateNativeWinOcclusion'],cwd:root,env});
 const page=await app.firstWindow();await page.getByRole('button',{name:'레이스 Marble race 05',exact:true}).click();
 // Show only our isolated test window outside the desktop; never focus or move a user's window.
 await app.evaluate(({BrowserWindow})=>{const win=BrowserWindow.getAllWindows()[0];win.setPosition(-20000,-20000);win.showInactive();});
 await page.locator('.race-layout').getByRole('button',{name:'레이스 시작',exact:true}).click();await page.waitForTimeout(4500);
 const result=await page.evaluate(()=>new Promise(resolve=>{const frames=[],start=performance.now();let prev=start;function frame(now){frames.push(now-prev);prev=now;if(now-start>3000)resolve({visibility:document.visibilityState,frames:frames.length,averageFrameMs:frames.reduce((a,b)=>a+b,0)/frames.length});else requestAnimationFrame(frame);}requestAnimationFrame(frame);}));
 console.log(JSON.stringify(result));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(app)await app.close();});
