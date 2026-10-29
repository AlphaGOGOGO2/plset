async (page) => {
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const check=(value,message)=>{if(!value)throw new Error(message);};
  await page.setViewportSize({width:1536,height:980});
  const panel=page.locator('.race-layout');
  await page.getByRole('button',{name:'레이스 Marble race 05',exact:true}).click();
  await page.waitForFunction(()=>window.render_game_to_text&&JSON.parse(window.render_game_to_text()).mode==='ready');
  for(const [i,name] of ['정글','은하수','설산','도심','화산','협곡'].entries()){
    await panel.getByRole('group',{name:'레이스 테마'}).getByRole('button').nth(i).click();
    await page.waitForFunction(i=>JSON.parse(window.render_game_to_text()).track===i,i);
    await page.waitForTimeout(500);
    await page.screenshot({path:`output/playwright/race-theme-${i}.png`});
  }
  await panel.getByRole('group',{name:'레이스 테마'}).getByRole('button').first().click();
  await panel.getByRole('button',{name:'레이스 시작',exact:true}).click();
  await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).mode==='countdown');
  await page.evaluate(()=>window.advanceTime(4000));
  await page.waitForTimeout(500);
  await page.evaluate(()=>window.advanceTime(8000));
  await page.waitForTimeout(500);
  check(JSON.parse(await page.evaluate(()=>window.render_game_to_text())).mode==='racing','racing state');
  await page.screenshot({path:'output/playwright/race-chase.png'});
  await panel.getByRole('button',{name:'전체 코스',exact:true}).click();await page.waitForTimeout(1200);
  await page.screenshot({path:'output/playwright/race-overview.png'});
  await panel.getByRole('button',{name:'선두 추적',exact:true}).click();
  await panel.getByRole('button',{name:'2.5배속',exact:true}).click();
  await panel.getByRole('button',{name:'순위표 접기',exact:true}).click();check(await panel.locator('.race-board ol').count()===0,'collapse board');
  await panel.getByRole('button',{name:'순위표 펴기',exact:true}).click();
  await panel.getByRole('button',{name:'레이스 전체 화면',exact:true}).click();
  await page.waitForFunction(()=>!!document.fullscreenElement);await page.screenshot({path:'output/playwright/race-fullscreen.png'});
  await page.evaluate(()=>document.exitFullscreen());
  for(let i=0;i<20;i++){if(JSON.parse(await page.evaluate(()=>window.render_game_to_text())).mode==='complete')break;await page.evaluate(()=>window.advanceTime(5000));await page.waitForTimeout(120);}
  const result=JSON.parse(await page.evaluate(()=>window.render_game_to_text()));check(result.mode==='complete','all finish');check(result.results.length===10&&new Set(result.results).size===10,'unique results');
  await page.waitForTimeout(250);await page.screenshot({path:'output/playwright/race-finished.png'});
  check(errors.length===0,errors.join('\n'));
  return {errors,result};
}
