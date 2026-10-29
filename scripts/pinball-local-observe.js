async(page)=>{
 await page.setViewportSize({width:1536,height:980});
 const panel=page.locator('.pinball-layout:not(.race-layout)');
 await page.getByRole('button',{name:'핀볼 Pinball 03',exact:true}).click();
 await page.waitForFunction(()=>window.render_game_to_text&&JSON.parse(window.render_game_to_text()).mode==='ready');
 const controls=await panel.innerText();
 await panel.getByRole('button',{name:'추첨 시작',exact:true}).click();
 const samples=[];
 for(let i=0;i<40;i++){
  await page.waitForTimeout(1000);const s=await page.evaluate(()=>JSON.parse(window.render_game_to_text()));samples.push({second:i+1,...s});
  if([7,15,23,31,39].includes(i)||s.mode==='complete')await page.screenshot({path:`output/playwright/pinball-local-${i+1}.png`});
  if(s.mode==='complete')break;
 }
 return {controls,samples};
}
