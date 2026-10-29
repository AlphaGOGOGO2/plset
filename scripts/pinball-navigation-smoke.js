async(page)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));const check=(v,m)=>{if(!v)throw Error(m);};
 await page.setViewportSize({width:1536,height:980});await page.getByRole('button',{name:'핀볼 Pinball 03',exact:true}).click();
 const panel=page.locator('.pinball-layout:not(.race-layout)'),mini=panel.getByRole('button',{name:'미니맵 탐색',exact:true}),state=()=>page.evaluate(()=>JSON.parse(window.render_game_to_text()));
 await page.waitForFunction(()=>window.render_game_to_text&&JSON.parse(window.render_game_to_text()).mode==='ready');
 check((await state()).map===14,'new default course');
 const hover=async(x,y)=>{const b=await mini.boundingBox();await page.mouse.move(b.x+b.width*x,b.y+b.height*y);await page.waitForTimeout(650);return state();};
 let s=await hover(.25,.75);check(Math.abs(s.camera.x-6.5)<.2&&Math.abs(s.camera.y-91.5)<.2,'minimap world coordinates');check(s.tick===0,'preview is frozen');
 await page.screenshot({path:'output/playwright/pinball-minimap-ready.png'});
 await page.mouse.move(950,500);await page.waitForTimeout(900);s=await state();check(s.camera.inspection===null&&s.camera.y<5,'return to ready camera');
 await mini.focus();await mini.press('End');await page.waitForTimeout(650);check(Math.abs((await state()).camera.y-120)<.2,'keyboard end');await mini.press('Home');await page.waitForTimeout(650);check((await state()).camera.y<.2,'keyboard home');await mini.press('Escape');check((await state()).camera.inspection===null,'keyboard escape');
 // Freeze presentation clock, preserving real RAF for camera easing.
 await page.evaluate(()=>{const now=Date.now();Date.now=()=>now;});
 await panel.getByRole('button',{name:'추첨 시작',exact:true}).click();await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).mode==='racing');
 await page.evaluate(()=>window.advanceTime(2000));const before=await state();
 s=await hover(.5,.92);const inspectBefore=s.tick;
 await page.evaluate(()=>window.advanceTime(1000));s=await state();check(s.tick>inspectBefore&&s.seed===before.seed,'physics continues during inspection');check(Math.abs(s.camera.y-112.24)<.2,'hold manual camera during racing');
 await page.screenshot({path:'output/playwright/pinball-minimap-racing.png'});
 await page.mouse.move(950,500);await page.waitForTimeout(1200);s=await state();check(s.camera.inspection===null&&s.camera.y<70,'return to moving marbles');
 for(const size of [{width:1120,height:680},{width:1536,height:980}]){await page.setViewportSize(size);await page.waitForTimeout(200);s=await hover(.5,.6);check(Math.abs(s.camera.y-73.2)<.2,'letterboxed minimap alignment');}
 await page.mouse.move(950,500);await panel.getByRole('button',{name:'핀볼 전체 화면',exact:true}).click();await page.waitForFunction(()=>!!document.fullscreenElement);s=await hover(.5,.95);check(Math.abs(s.camera.y-115.9)<.2,'fullscreen minimap alignment');await page.screenshot({path:'output/playwright/pinball-minimap-fullscreen.png'});await page.evaluate(()=>document.exitFullscreen());await page.mouse.move(950,500);
 // Capture the wider finish sweep while actual marbles approach it.
 for(let i=0;i<80;i++){s=await state();if(s.balls.some(b=>b.y>105)||s.mode==='complete')break;await page.evaluate(()=>window.advanceTime(250));await page.waitForTimeout(20);}
 await hover(.5,.94);await page.screenshot({path:'output/playwright/pinball-tuned-finish.png'});await page.mouse.move(950,500);
 for(let i=0;i<200;i++){if((await state()).mode==='complete')break;await page.evaluate(()=>window.advanceTime(1000));await page.waitForTimeout(25);}
 s=await state();check(s.mode==='complete'&&s.results.length===10,'ten physical finishes');
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('plset.session.v1')).draw);
 const expected=await page.evaluate(async run=>{const {createPinball}=await import('/src/pinball.ts');const r=await createPinball(run.items,run.seed,run.map);while(r.tick<60000&&r.results.length<run.items.length)r.step();const ids=[...r.results];r.dispose();return ids;},saved);
 check(JSON.stringify(saved.results)===JSON.stringify(expected),'minimap never changes results');
 await page.reload();await page.getByRole('button',{name:'핀볼 Pinball 03',exact:true}).click();await page.waitForFunction(()=>window.render_game_to_text&&JSON.parse(window.render_game_to_text()).mode==='complete');check((await state()).map===14,'new map result reload');
 await hover(.5,.4);check((await state()).camera.inspection!==null,'finished course remains inspectable');await page.mouse.move(950,500);
 for(const id of [10,11,12,13,14]){await panel.getByRole('combobox',{name:'코스',exact:true}).selectOption(String(id));await page.waitForFunction(id=>JSON.parse(window.render_game_to_text()).map===id,id);s=await hover(.5,.95);check(s.rotors.some(r=>Math.abs(r.speed+1.2)<.001&&r.length===4),'measured finish bar on every course');}
 check(errors.length===0,errors.join('\n'));return {passed:['hover and return','preview','keyboard','running physics','resize','fullscreen','real finish geometry','ten unique finishes','result equivalence','persistence','five courses'],errors};
}
