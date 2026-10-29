async(page)=>{
 const check=(v,m)=>{if(!v)throw Error(m)},key='plset.session.v1',original=await page.evaluate(k=>localStorage.getItem(k),key),base=JSON.parse(original),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
 for(const n of [2,3,10,60])for(const rank of [1,n]){
 const items=Array.from({length:n},(_,i)=>({id:'check-'+i,label:'항목'+(i+1)})),seed=1741+n+rank;
 const order=await page.evaluate(async({items,seed})=>{const {shuffle}=await import('/src/domain.ts');return shuffle(items,seed).map(i=>i.id)},{items,seed});
 const draw={mode:'wheel',source:'custom',seed,startedAt:1,rank,items,results:order,finishedAt:2};await page.evaluate(({k,s})=>localStorage.setItem(k,JSON.stringify(s)),{k:key,s:{...base,draw}});await page.reload();await page.getByRole('button',{name:'룰렛 Roulette 04',exact:true}).click();await page.waitForFunction(()=>window.render_game_to_text&&JSON.parse(window.render_game_to_text()).entries?.length>0);const debug=await page.evaluate(()=>JSON.parse(window.render_game_to_text()));check(debug.pointerId===order[rank-1],`pointer ${n}/${rank}`);
 }
 check(errors.length===0,errors.join(';'));return '2/3/10/60 entries, first/last pointer alignment';
 }finally{await page.evaluate(({k,v})=>localStorage.setItem(k,v),{k:key,v:original});await page.reload();}
}
