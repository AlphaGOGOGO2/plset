import { test } from 'node:test';
import assert from 'node:assert/strict';
import { THEMES, DEFAULT_THEME, parseHex, toHex, rgbToHsl, remapHex, remapText, themeById, APP_THEME } from './theme';
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
