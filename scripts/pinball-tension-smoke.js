async(page)=>{
 const check=(ok,m)=>{if(!ok)throw Error(m)},key='plset.session.v1';const original=await page.evaluate(k=>localStorage.getItem(k),key),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.evaluate(k=>{const s=JSON.parse(localStorage.getItem(k));s.draw=null;localStorage.setItem(k,JSON.stringify(s));},key);await page.reload();await page.setViewportSize({width:1536,height:980});
  await page.getByRole('button',{name:'핀볼 Pinball 03',exact:true}).click();
  check(await page.getByRole('combobox',{name:'당첨자 설정',exact:true}).locator('option').allTextContents().then(a=>a.join(',')==='첫번째,마지막'),'only first/last');
  check(!(await page.getByRole('combobox',{name:'추첨 대상',exact:true}).locator('option').allTextContents()).includes('미배정 선수'),'no unassigned source');
  const cards=page.locator('.all-player-quantities .quantity-card');check(await cards.count()>0,'all participant quantity editor');
  const name=await cards.first().locator('strong').innerText();await page.getByRole('spinbutton',{name:name+' 수량',exact:true}).fill('3');
  await page.getByRole('combobox',{name:'당첨자 설정',exact:true}).selectOption('last');
  await page.getByRole('button',{name:'추첨 시작',exact:true}).click();await page.waitForFunction(()=>window.render_game_to_text&&JSON.parse(window.render_game_to_text()).mode==='countdown');
  const state=()=>page.evaluate(()=>JSON.parse(window.render_game_to_text()));let st=await state();check(st.balls.filter(p=>p.name===name).length===3,'whole roster quantity applied');check(new Set(st.balls.map(p=>p.y.toFixed(1))).size>1,'two-dimensional scatter');
  await page.evaluate(()=>window.advanceTime(7000));await page.evaluate(async()=>{for(let i=0;i<20;i++)await new Promise(requestAnimationFrame)});
  const labels=await page.locator('.pinball-marble-name:visible').count();check(labels>0,'crisp DOM name labels');
  check(await page.locator('.pinball-marble-name:visible').first().evaluate(e=>parseFloat(getComputedStyle(e).fontSize)>=16),'native text at least16');
  await page.locator('.pinball-stage').screenshot({path:'output/playwright/pinball-tension-racing.png'});
  let slowed=false,sped=false,hit=false;for(let i=0;i<160;i++){await page.evaluate(()=>window.advanceTime(1000));st=await state();slowed ||= st.playbackSpeed<1;sped ||= st.balls.length===1&&st.playbackSpeed>=5;hit ||= st.bumpersHit>0;if(st.mode==='complete')break;}
  check(st.mode==='complete','complete complex course');check(slowed||sped,'finish pacing engaged');check(hit,'active bumper contacts');
  let saved=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).draw,key);check(saved.winner==='last'&&saved.rank===saved.items.length,'last follows expanded quantity');check(await page.locator('.draw-result strong:visible').innerText()===saved.items.find(p=>p.id===saved.results.at(-1)).label,'actual last winner');
  await page.getByRole('combobox',{name:'모드',exact:true}).selectOption('ace');check(await page.getByRole('combobox',{name:'모드',exact:true}).locator('option:checked').innerText()==='ACE결정전-극락/나락/자연','renamed ACE');
  await page.getByRole('spinbutton',{name:'극락 수량',exact:true}).fill('2');
  await page.waitForFunction(()=>window.render_game_to_text&&JSON.parse(window.render_game_to_text()).mode==='ready');const oldPreview=(await state()).balls.map(p=>[p.x,p.y]);await page.getByRole('button',{name:'배치 섞기',exact:true}).click();await page.waitForFunction(old=>window.render_game_to_text&&JSON.stringify(JSON.parse(window.render_game_to_text()).balls.map(p=>[p.x,p.y]))!==old,JSON.stringify(oldPreview));const preview=(await state()).balls.map(p=>[p.x,p.y]);
  await page.getByRole('button',{name:'추첨 시작',exact:true}).click();await page.waitForFunction(()=>window.render_game_to_text&&JSON.parse(window.render_game_to_text()).mode==='countdown');check(JSON.stringify((await state()).balls.map(p=>[p.x,p.y]))===JSON.stringify(preview),'start preserves shuffled preview');const firstPositions=(await state()).balls.map(p=>[p.x,p.y]);
  await page.getByRole('button',{name:'추첨 취소',exact:true}).click();await page.getByRole('button',{name:'추첨 시작',exact:true}).click();await page.waitForFunction(()=>window.render_game_to_text&&JSON.parse(window.render_game_to_text()).mode==='countdown');check(JSON.stringify((await state()).balls.map(p=>[p.x,p.y]))!==JSON.stringify(firstPositions),'new run reshuffles scatter');
  await page.locator('.pinball-stage').screenshot({path:'output/playwright/pinball-scatter-countdown.png'});
  await page.evaluate(()=>window.advanceTime(600000));await page.getByRole('heading',{name:'추첨 순위',exact:true}).waitFor();saved=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).draw,key);check(saved.winner==='first'&&saved.rank===1,'first selected');check(await page.locator('.draw-result strong:visible').innerText()===saved.items.find(p=>p.id===saved.results[0]).label,'actual first winner');
  check(errors.length===0,errors.join(';'));return ['whole roster quantities','first/last real finish selection','random2D spawn','active bumpers','finish slow motion','native crisp moving names','ACE rename','no unassigned','no errors'];
 }finally{await page.evaluate(({k,v})=>localStorage.setItem(k,v),{k:key,v:original});await page.reload();}
}
