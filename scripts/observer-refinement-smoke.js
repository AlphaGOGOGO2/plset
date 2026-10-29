async(page)=>{
 const check=(ok,msg)=>{if(!ok)throw new Error(msg)};
 await page.setViewportSize({width:1536,height:980});
 await page.getByRole('button',{name:'진행 대시보드 Overview 01',exact:true}).click();
 await page.getByRole('textbox',{name:'선수 검색',exact:true}).fill('');
 const table=page.locator('.funding-table'),rows=table.locator('.table-row');
 const cutoff=table.locator('.funding-observer-cutoff');
 check(await cutoff.count()===1,'exactly one observer cutoff');
 check((await cutoff.locator('.row-index').innerText())==='04','cutoff beneath actual rank four');
 check(await cutoff.evaluate(el=>getComputedStyle(el,'::before').height)==='2px','visible two pixel line');
 const firstName=await rows.first().locator('.player-cell strong').innerText();
 const fourthName=await cutoff.locator('.player-cell strong').innerText();
 const search=page.getByRole('textbox',{name:'선수 검색',exact:true});
 await search.fill(fourthName);check(await cutoff.count()===1,'fourth rank boundary preserved by search');check(await cutoff.locator('.row-index').innerText()==='04','search preserves actual rank');
 await search.fill(firstName);check(await cutoff.count()===0,'search result one does not become rank four');await search.fill('');
 const fifth=page.getByRole('spinbutton',{name:await rows.nth(4).locator('input').getAttribute('aria-label'),exact:true});const old=await fifth.inputValue();
 try{await fifth.fill(String(Number(await rows.nth(3).locator('input').inputValue())+10));await fifth.press('Enter');check(await cutoff.locator('.row-index').innerText()==='04','boundary follows funding resort');check(!(await cutoff.locator('input').getAttribute('aria-label')===await fifth.getAttribute('aria-label')),'promoted fifth is above cutoff');}
 finally{await fifth.fill(old);await fifth.press('Enter');}
 await page.locator('.funding-panel').screenshot({path:'output/playwright/observer-cutoff.png'});
 await page.getByRole('button',{name:'핀볼 Pinball 03',exact:true}).click();
 await page.waitForFunction(()=>window.render_game_to_text&&JSON.parse(window.render_game_to_text()).mode==='ready');
 await page.screenshot({path:'output/playwright/pinball-refined-desktop.png'});
 return ['observer cutoff at rank four','search keeps true ranks','cutoff follows funding reorder','desktop layout'];
}
