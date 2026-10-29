async (page) => {
  const check=(value,message)=>{if(!value)throw new Error(message);};
  check(await page.locator('.roster-entry-panel input').count()===1,'one participant input');
  check(await page.locator('.roster-entry-help').count()===0,'helper text removed');
  const input=page.getByRole('textbox',{name:'선수 이름 입력',exact:true});
  await input.fill('현제');
  const result=page.getByRole('listbox',{name:'선수 검색 결과'});
  await result.waitFor();
  check(await result.getByRole('img',{name:'변현제 프로필'}).count()===1,'alias portrait');
  await input.press('Enter');
  await input.fill('재호 김정우 현제');await input.press('Enter');
  for (const [race,name] of [['테란','이재호'],['저그','김정우'],['프로토스','변현제']]) {
    check(await page.getByRole('region',{name:race+' 참가자',exact:true}).getByRole('button',{name:name+' 참가 제외',exact:true}).count()===1,'correct race and no duplicate: '+name);
  }
  check(await input.inputValue()==='','input clears after registration');
  await page.screenshot({path:'output/playwright/participants-unified-input.png'});
  return ['single input','alias portrait','multiple names','automatic race grouping','duplicate prevention','helper removed'];
}

