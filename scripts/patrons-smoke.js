async(page)=>{
 const check=(v,m)=>{if(!v)throw Error(m)},key='plset.session.v1',original=await page.evaluate(k=>localStorage.getItem(k),key),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const read=()=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);
 const total=()=>page.getByLabel('귀인 TOTAL',{exact:true}).innerText();const per=()=>page.getByLabel('귀인 두당',{exact:true}).innerText();
 try{
 await page.evaluate(k=>{const s=JSON.parse(localStorage.getItem(k));s.patrons=[];s.teamSize=5;localStorage.setItem(k,JSON.stringify(s));},key);await page.reload();await page.setViewportSize({width:1536,height:980});
 const buttons=page.locator('nav > button');check((await buttons.allTextContents()).join('|').includes('룰렛Roulette04|귀인Patrons00'),'after roulette, number 00');await page.getByRole('button',{name:'귀인 Patrons 00',exact:true}).click();check(await total()==='0\n개','empty total');
 const name=page.getByRole('textbox',{name:'귀인 닉네임',exact:true}),amount=page.getByRole('spinbutton',{name:'귀인 TOTAL 입력',exact:true}),note=page.getByRole('textbox',{name:'귀인 비고',exact:true}),add=page.getByRole('button',{name:'추가',exact:true});
 check(await add.isDisabled(),'empty guard');await name.fill('별빛');await amount.fill('1000');await note.fill('1세트 응원');await note.press('Enter');check((await read()).patrons.length===1,'Enter adds');check(await total()==='1,000\n개'&&await per()==='200\n개','1000 / 5');check(await name.evaluate(el=>el===document.activeElement),'focus returns to nickname');
 await name.fill('별빛');await amount.fill('503');await note.fill('추가 펀딩');await add.click();check((await read()).patrons.length===2,'repeated nickname separate records');check(await total()==='1,503\n개'&&await per()==='300\n개','sum and floor');check(await page.getByText('5명 기준 · 잔여 3개',{exact:true}).count()===1,'remainder');
 await page.getByRole('spinbutton',{name:'1번 귀인 TOTAL',exact:true}).fill('505');await page.getByRole('spinbutton',{name:'1번 귀인 TOTAL',exact:true}).press('Enter');check(await total()==='1,505\n개'&&await per()==='301\n개','edit amount');
 await page.getByRole('textbox',{name:'1번 귀인 비고',exact:true}).fill('수정 메모');await page.getByRole('textbox',{name:'1번 귀인 비고',exact:true}).press('Enter');check((await read()).patrons[0].note==='수정 메모','edit note');
 await page.getByRole('button',{name:'1번 귀인 삭제',exact:true}).click();check(await total()==='1,000\n개','delete subtracts');await page.getByRole('button',{name:'실행 취소',exact:true}).click();check(await total()==='1,505\n개','undo restores');
 await page.getByRole('button',{name:'5 vs 5',exact:true}).click();await page.getByRole('combobox',{name:'경기 인원',exact:true}).selectOption('3');await page.getByRole('button',{name:'닫기',exact:true}).click();check(await per()==='501\n개','team size divisor updates');
 for(const [width,height]of [[1120,680],[1536,980]]){await page.setViewportSize({width,height});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow');const b=await page.getByLabel('귀인 펀딩 합계',{exact:true}).boundingBox();check(b.y+b.height<=height,'totals visible');}await page.screenshot({path:'output/playwright/patrons-ledger.png'});
 const data=await read();await page.reload();await page.getByRole('button',{name:'귀인 Patrons 00',exact:true}).click();check(JSON.stringify((await read()).patrons)===JSON.stringify(data.patrons),'records reload');check(await total()==='1,505\n개','restored total');check(errors.length===0,errors.join(';'));
 return ['nav below roulette 00','add Enter/focus','nickname amount notes','duplicate nickname records','sum per remainder','edit/delete/undo','team size reacts','save/reload','small window layout'];
 }finally{await page.evaluate(({k,v})=>localStorage.setItem(k,v),{k:key,v:original});await page.reload();}
}
