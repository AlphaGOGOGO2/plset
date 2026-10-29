async (page) => {
  const check=(ok,message)=>{if(!ok)throw new Error(message);};
  await page.getByRole('button',{name:'진행 대시보드 Overview 01',exact:true}).click();
  for(const unit of ['두당 금액','후원 총액']) {
    await page.getByRole('button',{name:unit,exact:true}).click();
    const fields=page.locator('.funding-table .amount-input input');
    const first=page.getByRole('spinbutton',{name:await fields.nth(0).getAttribute('aria-label'),exact:true});
    const second=page.getByRole('spinbutton',{name:await fields.nth(1).getAttribute('aria-label'),exact:true});
    const before=await fields.evaluateAll(inputs=>inputs.map(input=>input.value));
    await first.focus();await first.press('ArrowUp');
    check(await first.evaluate(input=>document.activeElement===input),'top boundary retains focus');
    await first.press('ArrowDown');
    await second.evaluate(input=>new Promise(resolve=>requestAnimationFrame(()=>resolve(document.activeElement===input)))).then(ok=>check(ok,'down focuses next input'));
    await second.press('ArrowUp');
    await first.evaluate(input=>new Promise(resolve=>requestAnimationFrame(()=>resolve(document.activeElement===input)))).then(ok=>check(ok,'up focuses previous input'));
    check(JSON.stringify(await fields.evaluateAll(inputs=>inputs.map(input=>input.value)))===JSON.stringify(before),'arrows do not change amounts');
    const last=fields.last();await last.focus();await last.press('ArrowDown');
    check(await last.evaluate(input=>document.activeElement===input),'bottom boundary retains focus');
    // Raising the second row moves it to the top on blur, while focus stays on the intended neighbor.
    const target=page.getByRole('spinbutton',{name:await fields.nth(2).getAttribute('aria-label'),exact:true});
    const oldValue=await second.inputValue();
    const raised=String(Number(await first.inputValue())+100);
    await second.fill(raised);await second.press('ArrowDown');
    await target.evaluate(input=>new Promise(resolve=>requestAnimationFrame(()=>resolve(document.activeElement===input)))).then(ok=>check(ok,'focus survives descending re-sort'));
    check(await second.inputValue()===raised,'edited amount committed during navigation');
    await second.fill(oldValue);await second.press('Enter');
  }
  await page.getByRole('button',{name:'두당 금액',exact:true}).click();
  return ['up/down navigation','no numeric stepping','first/last boundaries','commit on navigation','focus survives re-sort','per-player and total modes'];
}
