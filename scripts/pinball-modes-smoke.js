async(page)=>{
 const check=(ok,m)=>{if(!ok)throw new Error(m)},key='plset.session.v1';
 const original=await page.evaluate(k=>localStorage.getItem(k),key);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.evaluate(k=>{const s=JSON.parse(localStorage.getItem(k));s.players.forEach((p,i)=>p.team=i<5?'A':'B');s.draw=null;localStorage.setItem(k,JSON.stringify(s));},key);
  await page.reload();await page.getByRole('button',{name:'핀볼 Pinball 03',exact:true}).click();
  const state=()=>page.evaluate(()=>JSON.parse(window.render_game_to_text()));
  for(const team of ['A','B']){
   await page.getByRole('combobox',{name:'추첨 대상',exact:true}).selectOption(team);
   await page.waitForFunction(()=>window.render_game_to_text&&JSON.parse(window.render_game_to_text()).mode==='ready');
   const expected=await page.evaluate(({k,team})=>JSON.parse(localStorage.getItem(k)).players.filter(p=>p.active&&p.team===team).map(p=>p.name).sort(),{k:key,team});
   check(JSON.stringify((await state()).balls.map(p=>p.name).sort())===JSON.stringify(expected),team+' only team entrants');
   await page.getByRole('button',{name:'추첨 시작',exact:true}).click();
   await page.waitForFunction(()=>window.render_game_to_text&&JSON.parse(window.render_game_to_text()).mode==='countdown');
   check(await page.getByRole('combobox',{name:'모드',exact:true}).isDisabled(),'mode locked in race');
   if(team==='A'){await page.evaluate(()=>window.advanceTime(7000));await page.screenshot({path:'output/playwright/pinball-team-A.png'});}
   await page.evaluate(()=>window.advanceTime(600000));await page.getByRole('heading',{name:'추첨 순위',exact:true}).waitFor();
   check((await state()).results.length===expected.length,'team completes all entrants');
   await page.getByRole('button',{name:'추첨 시작',exact:true}).click();await page.getByRole('button',{name:'추첨 취소',exact:true}).click();
  }
  await page.getByRole('combobox',{name:'모드',exact:true}).selectOption('ace');
  await page.waitForFunction(()=>window.render_game_to_text&&JSON.parse(window.render_game_to_text()).balls.length===3);
  check((await state()).balls.map(p=>p.name).sort().join(',')==='극락,나락,자연','exact ACE options');
  check(await page.getByRole('combobox',{name:'추첨 대상',exact:true}).count()===0,'player source hidden in ACE');
  for(const [width,height] of [[1120,680],[1280,720],[1536,980]]){
   await page.setViewportSize({width,height});
   const boxes=await page.locator('.pinball-layout .draw-controls select').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().toJSON()));
   check(boxes.every(b=>Math.abs(b.y-boxes[0].y)<1),'horizontal settings');
   const stage=await page.locator('.stage-panel:visible').boundingBox();check(stage.y+stage.height<=height&&stage.x+stage.width<=width,'main stage fits');
  }
  await page.screenshot({path:'output/playwright/pinball-ace-ready.png'});
  await page.getByRole('combobox',{name:'당첨자 설정',exact:true}).selectOption('last');
  await page.getByRole('button',{name:'추첨 시작',exact:true}).click();await page.waitForFunction(()=>window.render_game_to_text&&JSON.parse(window.render_game_to_text()).mode==='countdown');
  await page.evaluate(()=>window.advanceTime(600000));await page.getByRole('heading',{name:'추첨 순위',exact:true}).waitFor();
  check((await state()).results.length===3,'ACE completed');
  const saved=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).draw,key);check(saved.variant==='ace','ACE mode saved');check(['극락','나락','자연'].includes(await page.locator('.draw-result strong:visible').innerText()),'ACE winner named');
  await page.screenshot({path:'output/playwright/pinball-ace-result.png'});
  await page.reload();await page.getByRole('button',{name:'핀볼 Pinball 03',exact:true}).click();check(await page.getByRole('combobox',{name:'모드',exact:true}).inputValue()==='ace','ACE mode restored');check(await page.locator('.ranking-list:visible > div').count()===3,'ACE result restored');
  await page.getByRole('combobox',{name:'모드',exact:true}).selectOption('players');await page.getByRole('button',{name:'팀 편성 Match builder 02',exact:true}).click();await page.getByRole('button',{name:'배정 초기화',exact:true}).click();await page.getByRole('button',{name:'핀볼 Pinball 03',exact:true}).click();await page.getByRole('combobox',{name:'추첨 대상',exact:true}).selectOption('A');check(await page.getByRole('button',{name:'추첨 시작',exact:true}).isDisabled(),'empty team cannot draw');
  check(errors.length===0,errors.join(';'));
  return ['A/B isolated entrants','team physical results','ACE exact options','ACE chosen rank/result persistence','empty team guard','horizontal settings at 1120/1280/1536','no errors'];
 }finally{await page.evaluate(({k,original})=>{if(original)localStorage.setItem(k,original);else localStorage.removeItem(k)},{k:key,original});await page.reload();}
}
