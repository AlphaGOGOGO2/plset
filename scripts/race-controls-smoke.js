async (page)=>{
 const errors=[],warnings=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='warning')warnings.push(m.text());});
 const check=(v,m)=>{if(!v)throw Error(m);};const panel=page.locator('.race-layout');
 await page.getByRole('button',{name:'레이스 Marble race 05',exact:true}).click();
 await page.waitForFunction(()=>!!window.render_game_to_text);
 await panel.getByRole('group',{name:'레이스 테마'}).getByRole('button').nth(2).click();
 for(const size of [{width:1120,height:680},{width:1536,height:980}]){
  await page.setViewportSize(size);await page.waitForTimeout(350);
  const box=await panel.boundingBox();check(box.x+box.width<=size.width+1&&box.y+box.height<=size.height+1,'stage fits '+size.width);
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow');
  await page.screenshot({path:`output/playwright/race-layout-${size.width}.png`});
 }
 await panel.getByRole('combobox',{name:'참가 대상',exact:true}).click();await panel.getByRole('option',{name:'A팀',exact:true}).click();check(await panel.getByRole('button',{name:'레이스 시작',exact:true}).isDisabled(),'empty team guard');
 await panel.getByRole('combobox',{name:'참가 대상',exact:true}).click();await panel.getByRole('option',{name:'직접 입력',exact:true}).click();
 for(const name of ['가나다라마바사아자차카타파하','민준','서연']){await panel.getByRole('textbox',{name:'참가자 입력',exact:true}).fill(name);await panel.getByRole('textbox',{name:'참가자 입력',exact:true}).press('Enter');}
 check(await panel.locator('.draw-custom-badge').count()===3,'add names');
 await panel.getByRole('button',{name:'민준 삭제',exact:true}).click();check(await panel.locator('.draw-custom-badge').count()===2,'delete name');
 await panel.getByRole('button',{name:'이름표 ON',exact:true}).click();await page.waitForTimeout(150);check(await panel.locator('.race-label:visible').count()===0,'hide names');
 await panel.getByRole('button',{name:'이름표 OFF',exact:true}).click();check(await panel.getByRole('button',{name:/사진 (ON|OFF)/}).count()===0,'portraits always off');
 const before=JSON.parse(await page.evaluate(()=>window.render_game_to_text())).balls;
 await panel.getByRole('button',{name:'출발 순서 섞기',exact:true}).click();await page.waitForTimeout(200);
 await panel.getByRole('button',{name:'레이스 시작',exact:true}).click();await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).mode==='countdown');
 await panel.getByRole('button',{name:'설정',exact:true}).click();check(await panel.getByRole('group',{name:'레이스 테마'}).getByRole('button').first().isDisabled(),'lock during race');
 await panel.getByRole('button',{name:'레이스 취소',exact:true}).click();await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).mode==='ready');
 await panel.getByRole('button',{name:'레이스 시작',exact:true}).click();await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).mode==='countdown');
 await panel.getByRole('button',{name:'2.5배속',exact:true}).click();
 for(let i=0;i<30;i++){if(JSON.parse(await page.evaluate(()=>window.render_game_to_text())).mode==='complete')break;await page.evaluate(()=>window.advanceTime(4000));await page.waitForTimeout(100);}
 let result=JSON.parse(await page.evaluate(()=>window.render_game_to_text()));check(result.mode==='complete'&&result.results.length===2,'snow custom finish');
 await page.screenshot({path:'output/playwright/race-custom-result.png'});
 await page.reload();await page.getByRole('button',{name:'레이스 Marble race 05',exact:true}).click();await page.waitForFunction(()=>window.render_game_to_text&&JSON.parse(window.render_game_to_text()).mode==='complete');
 check(JSON.parse(await page.evaluate(()=>window.render_game_to_text())).results.join()===result.results.join(),'saved results');
 await panel.getByRole('button',{name:'다시 경주',exact:true}).click();await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).mode==='countdown');
 await panel.getByRole('button',{name:'설정',exact:true}).click();await panel.getByRole('button',{name:'레이스 취소',exact:true}).click();
 await page.getByRole('button',{name:'핀볼 Pinball 03',exact:true}).click();check(await page.locator('.pinball-canvas:visible').count()===1,'pinball canvas');
 await page.getByRole('button',{name:'룰렛 Roulette 04',exact:true}).click();check(await page.locator('canvas:visible').count()===1,'wheel canvas');
 await page.getByRole('button',{name:'레이스 Marble race 05',exact:true}).click();
 check(!errors.length,errors.join('\n'));check(!warnings.some(w=>w.includes('INVALID_OPERATION')),warnings.join('\n'));
 return {passed:['responsive','empty team','custom add/delete','labels/photos','shuffle','cancel/restart','locks','snow finish','reload','pinball/wheel'],errors,warnings};
}
