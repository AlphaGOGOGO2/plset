async(page)=>{
 const check=(v,m)=>{if(!v)throw Error(m)},key='plset.session.v1';const original=await page.evaluate(k=>localStorage.getItem(k),key);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.evaluate(k=>{const s=JSON.parse(localStorage.getItem(k));s.players.forEach(p=>p.team=null);s.draw=null;localStorage.setItem(k,JSON.stringify(s));},key);await page.reload();await page.setViewportSize({width:1536,height:980});
  await page.getByRole('button',{name:'핀볼 Pinball 03',exact:true}).click();await page.getByRole('combobox',{name:'추첨 대상',exact:true}).selectOption('A');
  const names=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).players.filter(p=>p.active).slice(0,5).map(p=>p.name),key);
  for(const name of names)await page.locator('.draw-team-picker button').filter({hasText:name}).click();
  await page.getByRole('button',{name:'선택 완료',exact:true}).click();check(await page.locator('.team-quantities .quantity-card').count()===5,'select five team players inside pinball');
  await page.getByRole('spinbutton',{name:names[0]+' 수량',exact:true}).fill('5');await page.getByRole('spinbutton',{name:names[1]+' 수량',exact:true}).fill('0');
  await page.waitForFunction(()=>window.render_game_to_text&&JSON.parse(window.render_game_to_text()).balls.length===8);
  let balls=await page.evaluate(()=>JSON.parse(window.render_game_to_text()).balls);check(balls.filter(p=>p.name===names[0]).length===5,'five copies');check(!balls.some(p=>p.name===names[1]),'zero excluded');check(new Set(balls.map(p=>p.id)).size===8,'unique ball IDs');
  await page.setViewportSize({width:1120,height:680});check(await page.locator('.team-quantities .quantity-card').evaluateAll(cards=>cards.every(c=>c.querySelector('.quantity-control').getBoundingClientRect().right<=c.getBoundingClientRect().right)),'quantity controls fit small cards');await page.screenshot({path:'output/playwright/weighted-team-1120.png'});await page.setViewportSize({width:1536,height:980});
  await page.screenshot({path:'output/playwright/weighted-team-ready.png'});
  await page.getByRole('button',{name:'추첨 시작',exact:true}).click();await page.waitForFunction(()=>window.render_game_to_text&&JSON.parse(window.render_game_to_text()).mode==='countdown');await page.evaluate(()=>window.advanceTime(600000));await page.getByRole('heading',{name:'추첨 순위',exact:true}).waitFor();
  let saved=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).draw,key);check(saved.results.length===8,'eight physical finishes');check(saved.items.every(i=>i.playerId),'owner mapping');check(saved.counts[saved.items[0].playerId]===5,'quantities saved');
  await page.reload();await page.getByRole('button',{name:'핀볼 Pinball 03',exact:true}).click();check(await page.getByRole('spinbutton',{name:names[1]+' 수량',exact:true}).inputValue()==='0','zero persists reload');
  for(const name of names)await page.getByRole('spinbutton',{name:name+' 수량',exact:true}).fill('0');check(await page.getByRole('button',{name:'추첨 시작',exact:true}).isDisabled(),'all-zero cannot start');
  await page.getByRole('spinbutton',{name:names[0]+' 수량',exact:true}).fill('1');await page.getByRole('button',{name:'추첨 시작',exact:true}).click();await page.waitForFunction(()=>window.render_game_to_text&&JSON.parse(window.render_game_to_text()).mode==='countdown');await page.evaluate(()=>window.advanceTime(600000));await page.getByRole('heading',{name:'추첨 순위',exact:true}).waitFor();check(JSON.parse(await page.evaluate(()=>window.render_game_to_text())).results.length===1,'single ball completes');
  await page.getByRole('combobox',{name:'추첨 대상',exact:true}).selectOption('B');check(await page.locator('.draw-team-picker').count()===1,'empty B team can pick players');
  await page.getByRole('combobox',{name:'모드',exact:true}).selectOption('ace');
  await page.getByRole('spinbutton',{name:'극락 수량',exact:true}).fill('5');
  check((await page.locator('.ace-quantities input').evaluateAll(ns=>ns.map(n=>n.value))).join(',')==='5,5,5','ACE equal five');check(await page.getByRole('button',{name:'극락 수량 증가',exact:true}).isDisabled(),'max five');
  await page.waitForFunction(()=>window.render_game_to_text&&JSON.parse(window.render_game_to_text()).balls.length===15);balls=await page.evaluate(()=>JSON.parse(window.render_game_to_text()).balls);for(const label of ['극락','나락','자연'])check(balls.filter(p=>p.name===label).length===5,'five '+label);
  await page.getByRole('button',{name:'나락 수량 감소',exact:true}).click();check((await page.locator('.ace-quantities input').evaluateAll(ns=>ns.map(n=>n.value))).join(',')==='4,4,4','all adjust together');
  await page.getByRole('spinbutton',{name:'자연 수량',exact:true}).fill('0');check((await page.locator('.ace-quantities input').evaluateAll(ns=>ns.map(n=>n.value))).join(',')==='1,1,1','ACE never zero');
  await page.getByRole('spinbutton',{name:'극락 수량',exact:true}).fill('5');
  for(const [width,height] of [[1120,680],[1280,720],[1536,980]]){await page.setViewportSize({width,height});const b=await page.locator('.stage-panel:visible').boundingBox();check(b.y+b.height<=height&&b.x+b.width<=width,'stage fits '+width);}
  await page.screenshot({path:'output/playwright/weighted-ace-ready.png'});
  await page.getByRole('button',{name:'추첨 시작',exact:true}).click();await page.waitForFunction(()=>window.render_game_to_text&&JSON.parse(window.render_game_to_text()).mode==='countdown');await page.evaluate(()=>window.advanceTime(600000));await page.getByRole('heading',{name:'추첨 순위',exact:true}).waitFor();saved=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).draw,key);check(saved.results.length===15&&new Set(saved.results).size===15,'15 ACE finishes');
  await page.screenshot({path:'output/playwright/weighted-ace-result.png'});check(errors.length===0,errors.join(';'));
  return ['empty-team inline selection','five-player quantity cards','0 excludes','unique IDs and owner mapping','team quantities saved/restored','all-zero guard','ACE synchronized 1..5','15 unique physical ACE results','responsive stage'];
 }finally{await page.evaluate(({k,v})=>localStorage.setItem(k,v),{k:key,v:original});await page.reload();}
}
