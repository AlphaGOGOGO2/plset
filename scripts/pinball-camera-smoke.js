async(page)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));const check=(v,m)=>{if(!v)throw Error(m);};
 await page.evaluate(()=>localStorage.removeItem('plset.session.v1'));await page.reload();await page.setViewportSize({width:1536,height:980});
 await page.getByRole('button',{name:'핀볼 Pinball 03',exact:true}).click();const panel=page.locator('.pinball-layout:not(.race-layout)'),state=()=>page.evaluate(()=>JSON.parse(window.render_game_to_text()));
 await page.waitForFunction(()=>window.render_game_to_text&&JSON.parse(window.render_game_to_text()).mode==='ready');
 await page.evaluate(()=>{const now=Date.now();Date.now=()=>now;});await panel.getByRole('button',{name:'추첨 시작',exact:true}).click();await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).mode==='racing');
 await page.evaluate(()=>window.advanceTime(4000));await page.waitForTimeout(1200);let s=await state();check(s.intensity===0&&s.camera.zoom<=1.001,'ordinary tracking stays wide at 1x');
 await page.screenshot({path:'output/playwright/pinball-camera-wide.png'});
 // Pixel scale should stay consistent when the application changes size.
 await page.setViewportSize({width:1120,height:680});await page.waitForTimeout(700);s=await state();check(s.camera.zoom<=1.001,'small viewport does not force a close-up');await page.screenshot({path:'output/playwright/pinball-camera-small.png'});
 await page.setViewportSize({width:1536,height:980});await panel.getByRole('button',{name:'핀볼 전체 화면',exact:true}).click();await page.waitForTimeout(700);await page.screenshot({path:'output/playwright/pinball-camera-fullscreen.png'});await page.evaluate(()=>document.exitFullscreen());
 const mini=panel.getByRole('button',{name:'미니맵 탐색',exact:true}),b=await mini.boundingBox();await page.mouse.move(b.x+b.width*.5,b.y+b.height*.9);await page.waitForTimeout(650);check((await state()).camera.inspection!==null,'minimap inspection');await page.mouse.move(1000,600);await page.waitForTimeout(1200);check((await state()).camera.inspection===null,'minimap return');
 let captured=false,maxZoom=0;
 for(let i=0;i<500;i++){
  s=await state();maxZoom=Math.max(maxZoom,s.camera.zoom);if(s.mode==='complete')break;
  await page.evaluate(()=>window.advanceTime(250));await page.waitForTimeout(25);
  if(!captured&&s.intensity>.7&&s.balls.length>=2){await page.waitForTimeout(800);await page.screenshot({path:'output/playwright/pinball-camera-finish.png'});captured=true;}
 }
 s=await state();check(s.mode==='complete'&&s.results.length===10,'last-winner race completes');check(captured,'finish close-up observed');
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('plset.session.v1')).draw);
 const expected=await page.evaluate(async run=>{const {createPinball}=await import('/src/pinball.ts');const r=await createPinball(run.items,run.seed,run.map);while(r.tick<60000&&r.results.length<run.items.length)r.step();const ids=[...r.results];r.dispose();return ids;},saved);check(JSON.stringify(expected)===JSON.stringify(saved.results),'camera leaves physical finish order unchanged');
 await page.reload();await page.getByRole('button',{name:'핀볼 Pinball 03',exact:true}).click();await page.waitForFunction(()=>window.render_game_to_text&&JSON.parse(window.render_game_to_text()).mode==='complete');
 await panel.getByRole('combobox',{name:'당첨자 설정',exact:true}).selectOption('first');await page.evaluate(()=>{const now=Date.now();Date.now=()=>now;});await panel.getByRole('button',{name:'추첨 시작',exact:true}).click();
 let firstFocus=false;for(let i=0;i<450;i++){s=await state();if(s.mode==='complete')break;if(s.intensity>.4&&s.results.length===0)firstFocus=true;await page.evaluate(()=>window.advanceTime(250));await page.waitForTimeout(20);}
 s=await state();check(firstFocus&&s.mode==='complete','first winner camera/zoom and completion');check(errors.length===0,errors.join('\n'));
 return {passed:['wide 1x tracking','small viewport','fullscreen','minimap and return','last-winner close-up','first-winner close-up','unchanged physical results','reload'],maxZoom,errors};
}
