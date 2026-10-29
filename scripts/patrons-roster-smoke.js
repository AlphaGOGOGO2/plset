async(page)=>{
 const check=(v,m)=>{if(!v)throw Error(m)},key='plset.session.v1',original=await page.evaluate(k=>localStorage.getItem(k),key);
 try{
 await page.reload();await page.getByRole('button',{name:'귀인 Patrons 00',exact:true}).click();let s=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);const active=s.players.filter(p=>p.active);
 check((await page.locator('.patron-roster-card strong').allTextContents()).sort().join()===active.map(p=>p.name).sort().join(),'active roster shown');
 for(const [width,height]of [[1120,680],[1536,980]]){await page.setViewportSize({width,height});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow');const summary=await page.getByLabel('귀인 펀딩 합계',{exact:true}).boundingBox();check(summary.y+summary.height<=height,'summary fits with roster');}
 await page.screenshot({path:'output/playwright/patrons-roster.png'});
 await page.getByRole('button',{name:'진행 대시보드 Overview 01',exact:true}).click();await page.getByRole('button',{name:active[0].name+' 참가 제외',exact:true}).click();await page.getByRole('button',{name:'귀인 Patrons 00',exact:true}).click();check(await page.locator('.patron-roster-card').count()===active.length-1,'dashboard changes update roster');check(await page.locator('.patron-roster-card strong').filter({hasText:active[0].name}).count()===0,'removed player absent');await page.getByRole('button',{name:'실행 취소',exact:true}).click();check(await page.locator('.patron-roster-card').count()===active.length,'undo updates roster');return 'today roster follows active dashboard participants with photos and race';
 }finally{await page.evaluate(({k,v})=>localStorage.setItem(k,v),{k:key,v:original});await page.reload();}
}
