import { test } from 'node:test';
import assert from 'node:assert/strict';
import { THEMES, DEFAULT_THEME, parseHex, toHex, rgbToHsl, remapHex, remapText, remapDeclaration, MODE_SCOPED, themeById, APP_THEME, getMode, setMode, toggleMode, subscribeMode } from './theme';
const hue = (hex: string) => rgbToHsl(parseHex(hex)!.r, parseHex(hex)!.g, parseHex(hex)!.b)[0];
test('hex 파싱과 직렬화는 3·4·6·8자리를 모두 왕복한다', () => {
  assert.deepEqual(parseHex('#fff'), { r: 255, g: 255, b: 255, a: 1 });
  assert.equal(toHex(parseHex('#a4e5bc')!), '#a4e5bc');
  assert.equal(toHex(parseHex('#ffffff0b')!), '#ffffff0b');
  assert.equal(parseHex('#zzz'), null);
});
test('초록 계열만 테마 색조로 돌리고 금색·빨강·파랑·무채색은 유지한다', () => {
  const midnight = themeById('midnight');
  assert.ok(Math.abs(hue(remapHex('#a4e5bc', midnight)) - (218 + (hue('#a4e5bc') - 135))) < 1.5);
  for (const keep of ['#ead096', '#e9ac9e', '#9abceb', '#ffffff0b', '#888888']) assert.equal(remapHex(keep, midnight), keep);
  assert.ok(Math.abs(hue(remapHex('#3d4440', midnight)) - 228) < 8, '초록빛 회색은 테마 색조로 기운다 (저채도라 8비트 양자화 오차 허용)');
  assert.equal(remapHex('#101514', DEFAULT_THEME), '#101514');
});
test('블랙 & 화이트는 밝기를 유지한 채 채도를 완전히 없앤다', () => {
  const g = themeById('mono'), c = parseHex(remapHex('#294331', g))!;
  assert.equal(rgbToHsl(c.r, c.g, c.b)[1], 0);
  assert.ok(Math.abs(rgbToHsl(c.r, c.g, c.b)[2] - rgbToHsl(0x29, 0x43, 0x31)[2]) < 0.01);
});
test('직렬화된 rgb()와 사용자 정의 속성의 hex를 함께 바꾸고 다른 색은 그대로 둔다', () => {
  const violet = themeById('violet');
  const out = remapText('background: rgb(23, 29, 26); --mint:#a4e5bc; color: rgba(164, 229, 188, 0.5); border-color: rgb(234, 208, 150);', violet);
  assert.notEqual(out.split(';')[0], 'background: rgb(23, 29, 26)');
  assert.notEqual(out.match(/--mint:(#[0-9a-f]+)/)![1], '#a4e5bc');
  assert.match(out, /rgba\(\d+, \d+, \d+, 0\.5\)/);
  assert.match(out, /border-color: rgb\(234, 208, 150\)/);
  assert.equal(remapText('color: rgb(16, 21, 20);', DEFAULT_THEME), 'color: rgb(16, 21, 20);');
});
test('테마 목록은 고유 id를 가지며 앱은 블랙 & 화이트로 고정된다', () => {
  assert.equal(new Set(THEMES.map(t => t.id)).size, THEMES.length);
  assert.equal(themeById('nope'), DEFAULT_THEME);
  assert.equal(APP_THEME.id, 'mono');
});
test('라이트 모드는 색조와 채도를 유지한 채 명도만 거울처럼 뒤집는다', () => {
  const mono = themeById('mono');
  const l = (hex: string) => rgbToHsl(parseHex(hex)!.r, parseHex(hex)!.g, parseHex(hex)!.b)[2];
  assert.ok(Math.abs(l(remapHex('#101514', mono, 'light')) - (1 - l('#101514'))) < 0.01, '배경은 거의 흰색이 된다');
  assert.equal(remapHex('#ffffff', mono, 'light'), '#000000');
  assert.equal(remapHex('#ffffff0b', mono, 'light'), '#0000000b', '흰 오버레이는 검은 오버레이가 되고 투명도는 유지된다');
  const paper = parseHex(remapHex('#101514', mono, 'light'))!, [ph, ps] = rgbToHsl(paper.r, paper.g, paper.b);
  assert.ok(Math.abs(ph - 42) < 3 && ps > 0.15 && ps < 0.3, `밝은 무채색 면은 아이보리로 기운다 (${ph.toFixed(0)}°, ${ps.toFixed(2)})`);
  const ink = parseHex(remapHex('#e5e9e1', mono, 'light'))!;
  assert.ok(rgbToHsl(ink.r, ink.g, ink.b)[1] < 0.02, '어두운 글자색은 중립 차콜을 유지한다');
  const gold = parseHex(remapHex('#d6bb86', mono, 'light'))!, [h, s, lg] = rgbToHsl(gold.r, gold.g, gold.b);
  assert.ok(Math.abs(h - hue('#d6bb86')) < 1.5, '금색은 색조를 유지한다');
  assert.ok(Math.abs(s - rgbToHsl(0xd6, 0xbb, 0x86)[1]) < 0.02);
  assert.ok(Math.abs(lg - (1 - l('#d6bb86'))) < 0.01, '금색은 밝은 배경 위에서 읽히도록 어두워진다');
  assert.equal(remapHex('#d6bb86', mono, 'dark'), '#d6bb86', '다크 모드는 기존과 동일하다');
});
test('그림자 선언은 라이트 모드에서도 어두운 색을 유지한다', () => {
  const mono = themeById('mono');
  assert.equal(remapDeclaration('box-shadow', '0 8px 24px rgba(0, 0, 0, 0.4)', mono, 'light'), '0 8px 24px rgba(0, 0, 0, 0.4)');
  assert.equal(remapDeclaration('text-shadow', '0 1px #000000', mono, 'light'), '0 1px #000000');
  assert.equal(remapDeclaration('filter', 'drop-shadow(0 0 4px #000000)', mono, 'light'), 'drop-shadow(0 0 4px #000000)');
  assert.equal(remapDeclaration('background', '#000000', mono, 'light'), '#ffffff');
});
test('모드는 기본 다크이며 토글하면 구독자에게 알린다', () => {
  assert.equal(getMode(), 'dark');
  let calls = 0; const off = subscribeMode(() => { calls++; });
  toggleMode(); assert.equal(getMode(), 'light'); assert.equal(calls, 1);
  setMode('light'); assert.equal(calls, 1, '같은 모드로 설정하면 알리지 않는다');
  off(); toggleMode(); assert.equal(getMode(), 'dark'); assert.equal(calls, 1);
});
test('[data-mode] 로 묶인 규칙은 모드별로 직접 지정한 색이므로 엔진이 건드리지 않는다', () => {
  assert.ok(MODE_SCOPED.test('[data-mode=light] .race-T'));
  assert.ok(MODE_SCOPED.test('html[data-mode="light"] .portrait-Z'));
  assert.equal(MODE_SCOPED.test('.race-T'), false);
  assert.equal(MODE_SCOPED.test('[data-theme=mono] .race-T'), false);
});
