async(page)=>{
 await page.getByRole('button',{name:'핀볼 Pinball 03',exact:true}).click();
 if(await page.getByRole('button',{name:'추첨 취소',exact:true}).count())await page.getByRole('button',{name:'추첨 취소',exact:true}).click();
 const output=[];
 for(const map of ['1','2','3']){
  await page.getByRole('combobox',{name:'코스',exact:true}).selectOption(map);
  await page.getByRole('button',{name:'추첨 시작',exact:true}).click();
  await page.waitForFunction(m=>window.render_game_to_text&&JSON.parse(window.render_game_to_text()).map===m&&JSON.parse(window.render_game_to_text()).mode==='countdown',Number(map));
  await page.evaluate(()=>window.advanceTime(10000));
  await page.evaluate(async()=>{for(let i=0;i<20;i++)await new Promise(requestAnimationFrame);});
  await page.locator('.pinball-canvas').screenshot({path:`output/playwright/pinball-course-${map}.png`});
  output.push(JSON.parse(await page.evaluate(()=>window.render_game_to_text())));
  await page.getByRole('button',{name:'추첨 취소',exact:true}).click();
 }
 return output.map(s=>({map:s.map,mode:s.mode,tick:s.tick,balls:s.balls.length}));
}
