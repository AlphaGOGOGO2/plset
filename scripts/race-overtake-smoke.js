async(page)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.evaluate(()=>localStorage.removeItem('plset.session.v1'));await page.reload();
 await page.setViewportSize({width:1536,height:980});await page.getByRole('button',{name:'레이스 Marble race 05',exact:true}).click();
 await page.waitForFunction(()=>window.render_game_to_text&&JSON.parse(window.render_game_to_text()).mode==='ready');
 const gateProgress=await page.evaluate(async()=>{const {tracks,sampleTrack,sampleAt}=await import('/src/race.ts');const samples=sampleTrack(tracks[0]);return tracks[0].features.filter(f=>f.kind==='gate').map(f=>sampleAt(samples,f.t).s);});
 const panel=page.locator('.race-layout');await panel.getByRole('button',{name:'레이스 시작',exact:true}).click();
 await page.evaluate(()=>window.advanceTime(3500));
 const captures=[];
 for(let i=0;i<gateProgress.length;i++){
  for(let j=0;j<150;j++){
   const state=await page.evaluate(()=>JSON.parse(window.render_game_to_text()));
   if(state.balls[0]?.progress>=gateProgress[i]-10||state.mode==='complete')break;
   await page.evaluate(()=>window.advanceTime(250));await page.waitForTimeout(25);
  }
  await page.waitForTimeout(200);await page.screenshot({path:`output/playwright/race-switch-gate-${i}.png`});captures.push(await page.evaluate(()=>JSON.parse(window.render_game_to_text())));
 }
 if(errors.length)throw Error(errors.join('\n'));
 return {errors,gateProgress,captures:captures.map(s=>({seconds:s.seconds,mode:s.mode,front:s.balls.slice(0,5)}))};
}
