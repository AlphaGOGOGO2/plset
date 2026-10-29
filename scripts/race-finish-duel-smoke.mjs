import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
const dir='output/race-finish-duel';mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-gl=angle','--use-angle=swiftshader']});
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('http://127.0.0.1:5173');
 const fixture=!process.argv.includes('--refresh-fixture')&&existsSync(`${dir}/browser-case.json`)?JSON.parse(readFileSync(`${dir}/browser-case.json`,'utf8')):await page.evaluate(async()=>{
  const {createRace,STEP}=await import('/src/race.ts');
  const items=['김정우','조일장','송병구','이영호'].map((label,i)=>({id:`duel-${i}`,label}));
  for(let seed=1;seed<=60;seed++){
   const race=await createRace(items,seed,0);race.start();let trigger=0,closeTicks=0,closed=false;
   while(race.tick<180/STEP&&race.results.length<items.length){
    race.step();const live=race.marbles.filter(m=>!race.done.has(m.item.id)).sort((a,b)=>b.progress-a.progress);
    const close=live.length===2&&race.finish-live[1].progress<=22&&live[0].progress-live[1].progress<=4;
    if(close&&!closed){if(!trigger)trigger=race.tick;closeTicks++;}else if(trigger)closed=true;
   }
   const result={seed,track:0,items,trigger,closeTicks,results:[...race.results],ticks:race.tick};race.dispose();
   if(closeTicks>=180)return result;
  }
  throw Error('No close finish fixture found');
 });
 console.log(JSON.stringify({fixture}));writeFileSync(`${dir}/browser-case.json`,JSON.stringify(fixture,null,2));
 await page.evaluate(async fixture=>{
  const {createSession}=await import('/src/domain.ts'),session=createSession();
  session.draw={mode:'race',source:'custom',map:fixture.track,winner:'first',seed:fixture.seed,startedAt:Date.now()+3000,rank:1,items:fixture.items,results:[],finishedAt:null};
  localStorage.setItem('plset.session.v1',JSON.stringify(session));
 },fixture);
 await page.reload();await page.getByRole('button',{name:'레이스 Marble race 05',exact:true}).click();
 const panel=page.locator('.race-layout');
 assert.equal(await panel.getByRole('button',{name:'마지막 추적',exact:true}).count(),0);
 assert.equal(await panel.getByRole('group',{name:'레이스 카메라'}).getByRole('button').count(),2);
 await page.waitForFunction(()=>!!window.render_game_to_text);
 assert.deepEqual(await panel.locator('.race-label').allTextContents(),['정우','일장','병구','영호']);
 const read=()=>page.evaluate(()=>({...JSON.parse(window.render_game_to_text()),wallTime:performance.now()}));
 let seen=false,ended=false,slowStart=0,slowDuration=0,virtualTime=0,minSpeed=Infinity,state;
 for(let i=0;i<600;i++){
  state=await read();if(state.mode==='complete')break;
  const step=state.tick<fixture.trigger-500?500:80;virtualTime+=step;await page.evaluate(ms=>window.advanceTime(ms),step);state=await read();
  if(state.finalDuel){
   assert.equal(state.balls.length,2);assert.equal(state.results.length,2);assert.ok(!ended,'slow motion retriggered');
   if(!seen){
    seen=true;slowStart=state.wallTime+virtualTime;
    await page.waitForTimeout(650);state=await read();
    assert.ok(state.finalDuel);assert.ok(state.effectiveSpeed<.85,`speed ${state.effectiveSpeed}`);
    await panel.locator('.race-canvas').screenshot({path:`${dir}/slow.png`});
   }
   minSpeed=Math.min(minSpeed,state.effectiveSpeed);
  }else if(seen&&!ended){ended=true;slowDuration=state.wallTime+virtualTime-slowStart;assert.ok(slowDuration<=2750,`slow for ${slowDuration} ms`);}
 }
 assert.ok(seen&&ended);assert.equal(state.mode,'complete');assert.deepEqual(state.results,fixture.results);assert.equal(state.tick,fixture.ticks);
 await page.waitForFunction(()=>{const s=JSON.parse(window.render_game_to_text());return Math.abs(s.effectiveSpeed-s.playbackSpeed)<.1;},{},{timeout:5000});state=await read();
 await page.screenshot({path:`${dir}/finished.png`});assert.deepEqual(errors,[]);
 const report={slowDurationMs:Math.round(slowDuration),minSpeed,results:state.results,ticks:state.tick,errors};
 writeFileSync(`${dir}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}
