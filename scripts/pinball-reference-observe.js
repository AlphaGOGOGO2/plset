async(page)=>{
 await page.setViewportSize({width:1536,height:980});
 if(await page.locator('#closeNotice').isVisible())await page.locator('#closeNotice').click();
 await page.locator('#in_names').fill(Array.from({length:10},(_,i)=>`참가${i+1}`).join(','));
 await page.getByRole('button',{name:'마지막',exact:true}).click();
 const source=await page.evaluate(()=>({camera:window.roulette._camera._frameView.toString(),skill:window.roulette._marbles[0]._updateSkillInformation.toString(),impact:window.roulette.physics.impact.toString(),marble:{cooldown:window.roulette._marbles[0]._maxCoolTime,rate:window.roulette._marbles[0]._skillRate}}));
 await page.getByRole('button',{name:'시작',exact:true}).click();
 const samples=[];
 for(let i=0;i<40;i++){
  await page.waitForTimeout(1000);
  const s=await page.evaluate(()=>{const r=window.roulette;return {timeScale:r._timeScale,zoom:r._camera.zoom,arrived:r._winners.length,running:r._isRunning,balls:r._marbles.map(m=>({name:m.name,x:m.x,y:m.y}))};});
  samples.push({second:i+1,...s});
  if([7,15,23,31,39].includes(i)||s.arrived===10)await page.screenshot({path:`output/playwright/pinball-reference-${i+1}.png`});
  if(s.arrived===10)break;
 }
 return {source,samples};
}
