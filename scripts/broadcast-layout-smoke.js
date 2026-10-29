async (page) => {
  const check=(ok,message)=>{if(!ok)throw new Error(message);};
  if(await page.getByRole('dialog').count())await page.getByRole('button',{name:'닫기',exact:true}).click();
  await page.getByRole('button',{name:'진행 대시보드 Overview 01',exact:true}).click();
  const results=[];
  for(const [width,height] of [[1920,1080],[1536,864],[1280,720]]) {
    await page.setViewportSize({width,height});await page.evaluate(()=>window.scrollTo(0,0));
    const metrics=await page.evaluate(()=>{
      const first=document.querySelector('.funding-panel .player-cell strong');
      const field=document.querySelector('.funding-panel .amount-input input');
      const panel=document.querySelector('.funding-panel');
      const wide=Array.from(document.querySelectorAll('.funding-panel input,.funding-panel button')).filter(el=>el.getBoundingClientRect().right>innerWidth+1);
      return {overflow:document.documentElement.scrollWidth>innerWidth,names:parseFloat(getComputedStyle(first).fontSize),amount:parseFloat(getComputedStyle(field).fontSize),bottom:panel.getBoundingClientRect().bottom,wide:wide.length};
    });
    check(!metrics.overflow&&metrics.wide===0,`${width}: horizontal overflow`);
    check(metrics.names>=20&&metrics.amount>=24,`${width}: text too small`);
    if(width===1920)check(metrics.bottom<=height,`1080p funding panel cut off at ${metrics.bottom}`);
    await page.screenshot({path:`output/playwright/readability-dashboard-${width}.png`});
    await page.getByRole('button',{name:'팀 편성 Match builder 02',exact:true}).click();
    check(await page.locator('.team-layout').evaluate(el=>el.getBoundingClientRect().right<=innerWidth),`${width}: teams overflow`);
    await page.getByRole('button',{name:'핀볼 Pinball 03',exact:true}).click();
    await page.evaluate(()=>window.scrollTo(0,0));
    const arena=await page.locator('.stage-panel:visible').boundingBox();
    check(arena.x+arena.width<=width+1&&arena.y+arena.height<=height+1,`${width}: draw arena cut off`);
    await page.screenshot({path:`output/playwright/readability-draw-${width}.png`});
    await page.getByRole('button',{name:'진행 대시보드 Overview 01',exact:true}).click();
    results.push({width,height,...metrics});
  }
  await page.setViewportSize({width:1920,height:1080});
  return results;
}
