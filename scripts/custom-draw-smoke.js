async(page)=>{
 const check=(v,m)=>{if(!v)throw Error(m)},key='plset.session.v1',original=await page.evaluate(k=>localStorage.getItem(k),key);
 try{
 await page.evaluate(k=>{const s=JSON.parse(localStorage.getItem(k));s.draw=null;localStorage.setItem(k,JSON.stringify(s));},key);await page.reload();await page.setViewportSize({width:1536,height:980});
 for(const nav of ['핀볼 Pinball 03','룰렛 Roulette 04']){
 await page.getByRole('button',{name:nav,exact:true}).click();await page.getByRole('combobox',{name:'추첨 대상',exact:true}).selectOption('custom');
 const input=page.getByRole('textbox',{name:'추첨 항목 입력',exact:true});
 await input.fill('컬러');await input.press('Enter');await input.fill('오디');await input.press('Enter');
 check(await input.inputValue()==='','draft clears');check(await input.evaluate(el=>el===document.activeElement),'input retains focus');
 await input.fill('컬러');await input.press('Enter');check(await page.locator('.draw-custom-badge:visible').count()===2,'duplicate rejected');
 await input.fill('');await input.press('Enter');check(await page.locator('.draw-custom-badge:visible').count()===2,'empty ignored');
 await page.getByRole('button',{name:'컬러 삭제',exact:true}).click();check(await page.locator('.draw-custom-badge:visible').count()===1,'remove badge');
 await input.fill('아이');await input.press('Enter');
 await page.screenshot({path:nav.startsWith('핀볼')?'output/playwright/custom-pinball-badges.png':'output/playwright/custom-wheel-badges.png'});
 await page.getByRole('button',{name:'추첨 시작',exact:true}).click();check(await input.isDisabled(),'input locked');check(await page.getByRole('button',{name:'오디 삭제',exact:true}).isDisabled(),'delete locked');
 const draw=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).draw,key);check(draw.items.map(i=>i.label).join(',')==='오디,아이','draw contains badges only');
 await page.getByRole('button',{name:'추첨 취소',exact:true}).click();
 }
 return ['pinball and roulette badges','Enter adds and retains focus','duplicate/empty guard','X removes','running locks','actual draw entries'];
 }finally{await page.evaluate(({k,v})=>localStorage.setItem(k,v),{k:key,v:original});await page.reload();}
}

