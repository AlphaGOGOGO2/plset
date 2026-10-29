async(page)=>{const check=(ok,m)=>{if(!ok)throw Error(m)},key='plset.session.v1';const original=await page.evaluate(k=>localStorage.getItem(k),key);try{
 await page.getByRole('button',{name:'진행 대시보드 Overview 01',exact:true}).click();
 for(const unit of ['두당 금액','후원 총액']){
  await page.getByRole('button',{name:unit,exact:true}).click();const fields=page.locator('.funding-table .amount-input input');
  const index=3,oldName=await fields.nth(index).getAttribute('aria-label');const top=Number(await fields.first().inputValue());await fields.nth(index).fill(String(top+123));await fields.nth(index).press('Enter');
  await page.waitForFunction(i=>document.activeElement===document.querySelectorAll('.funding-table .amount-input input')[i],index);
  check(await fields.first().getAttribute('aria-label')===oldName,'changed player moves up');check(await fields.nth(index).getAttribute('aria-label')!==oldName,'focus remains same rank');
  await page.keyboard.insertText('7');check(await fields.nth(index).inputValue()==='7','ready to replace with next amount');await page.keyboard.press('Enter');
  await page.waitForFunction(i=>document.activeElement===document.querySelectorAll('.funding-table .amount-input input')[i],index);
  const targetName=await fields.nth(index+1).getAttribute('aria-label');await page.keyboard.press('ArrowDown');await page.waitForFunction(name=>document.activeElement?.getAttribute('aria-label')===name,targetName);
 }
 return ['Enter commits','same displayed rank retains focus after sort','selected value ready for typing','arrow navigation preserved','per and total'];
 }finally{await page.evaluate(({k,v})=>localStorage.setItem(k,v),{k:key,v:original});await page.reload();}}
