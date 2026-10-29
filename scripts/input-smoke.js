async (page) => {
  const check=(value,message)=>{if(!value)throw new Error(message);};
  await page.getByRole('button',{name:'진행 대시보드 Overview 01'}).click();
  await page.getByRole('button',{name:'후원 총액',exact:true}).click();
  await page.getByRole('spinbutton',{name:'임홍규 후원 총액'}).fill('1003');
  await page.getByRole('spinbutton',{name:'임홍규 후원 총액'}).press('Tab');
  await page.getByRole('button',{name:'두당 금액',exact:true}).click();
  const input=page.getByRole('spinbutton',{name:'임홍규 두당 금액'});
  await input.focus();await input.press('Tab');
  await page.getByRole('button',{name:'후원 총액',exact:true}).click();
  check(await page.getByRole('spinbutton',{name:'임홍규 후원 총액'}).inputValue()==='1003','focus must preserve remainder');
  await page.getByRole('button',{name:'두당 금액',exact:true}).click();
  await input.fill('999');await input.press('Escape');
  check(await input.inputValue()==='200','Escape must cancel the amount edit');
  await input.fill('300');await input.press('Tab');
  await page.getByRole('button',{name:'임홍규 두당 100개 추가',exact:true}).click();
  check(await input.inputValue()==='400','quick add must follow the current funding unit');
  await page.getByRole('button',{name:'후원 총액',exact:true}).click();
  check(await page.getByRole('spinbutton',{name:'임홍규 후원 총액'}).inputValue()==='2000','per quick add total');
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  check(!overflow,'desktop horizontal overflow');
  return ['remainder preserved on focus','Escape cancels uncommitted amount','quick add respects per-player units','no horizontal overflow'];
}
