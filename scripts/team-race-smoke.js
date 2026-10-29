async (page) => {
  const check=(ok,message)=>{if(!ok)throw new Error(message);};
  await page.getByRole('button',{name:'팀 편성 Match builder 02',exact:true}).click();
  const reset=page.getByRole('button',{name:'배정 초기화',exact:true});if(await reset.isEnabled())await reset.click();
  const a=page.getByRole('group',{name:'A팀 종족 구성',exact:true});
  const b=page.getByRole('group',{name:'B팀 종족 구성',exact:true});
  for(const name of ['임홍규','변현제','이재호'])await page.getByRole('button',{name:name+' A팀 배정',exact:true}).click();
  check((await a.locator('.team-race-count b').allTextContents()).join(',')==='1,1,1','T/P/Z counts');
  await page.locator('.team-A .team-slot.filled').filter({hasText:'임홍규'}).dragTo(page.locator('.team-B .team-slot').first());
  check((await a.locator('.team-race-count b').allTextContents()).join(',')==='1,1,0','source counts after drag');
  check((await b.locator('.team-race-count b').allTextContents()).join(',')==='0,0,1','destination counts after drag');
  check(await page.locator('.team-slot .slot-fund,.team-card .score-step,.team-score-label').count()===0,'funding and score removed');
  await page.screenshot({path:'output/playwright/team-race-composition.png'});
  return ['T/P/Z counts','live count updates after drag','funding and score removed'];
}
