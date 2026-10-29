async(page)=>{const check=(v,m)=>{if(!v)throw Error(m)},key='plset.session.v1',original=await page.evaluate(k=>localStorage.getItem(k),key);try{
 await page.getByRole('button',{name:'핀볼 Pinball 03',exact:true}).click();
 for(const field of await page.locator('.all-player-quantities input').all())await field.fill('0');await page.locator('.all-player-quantities input').first().fill('1');await page.getByRole('combobox',{name:'당첨자 설정',exact:true}).selectOption('last');
 await page.getByRole('button',{name:'추첨 시작',exact:true}).click();await page.waitForFunction(()=>window.render_game_to_text&&JSON.parse(window.render_game_to_text()).mode==='countdown');
 check(JSON.parse(await page.evaluate(()=>window.render_game_to_text())).playbackSpeed===5,'single remaining ball speed five');check(await page.getByRole('button',{name:'배치 섞기',exact:true}).isDisabled(),'cannot shuffle running race');
 await page.evaluate(()=>window.advanceTime(4000));check(JSON.parse(await page.evaluate(()=>window.render_game_to_text())).tick>=490,'one second wall time advances five seconds physics');await page.evaluate(()=>window.advanceTime(600000));await page.getByRole('heading',{name:'추첨 순위',exact:true}).waitFor();return ['single last ball5x','shuffle locked during race','fast completion'];
 }finally{await page.evaluate(({k,v})=>localStorage.setItem(k,v),{k:key,v:original});await page.reload();}}
