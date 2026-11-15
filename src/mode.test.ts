import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHash, parseHash } from './mode';

test('plain hashes stay solo and keep the existing page links working', () => {
  assert.deepEqual(parseHash(''), { mode: { kind: 'solo' }, page: 'board' });
  assert.deepEqual(parseHash('#patrons'), { mode: { kind: 'solo' }, page: 'patrons' });
  assert.deepEqual(parseHash('#nonsense'), { mode: { kind: 'solo' }, page: 'board' });
});
test('host hashes', () => {
  assert.deepEqual(parseHash('#host'), { mode: { kind: 'host' }, page: 'board' });
  assert.deepEqual(parseHash('#host/race'), { mode: { kind: 'host' }, page: 'race' });
  assert.deepEqual(parseHash('#host/bogus'), { mode: { kind: 'host' }, page: 'board' });
});
test('watch hashes accept only the two rooms', () => {
  assert.deepEqual(parseHash('#watch=major'), { mode: { kind: 'watch', room: 'major' }, page: 'board' });
  assert.deepEqual(parseHash('#watch=kleague/patrons'), { mode: { kind: 'watch', room: 'kleague' }, page: 'patrons' });
  assert.deepEqual(parseHash('#watch=other'), { mode: { kind: 'solo' }, page: 'board' });
});
test('buildHash round-trips', () => {
  for (const hash of ['#teams', '#host/pinball', '#watch=major/settlement']) {
    const { mode, page } = parseHash(hash);
    assert.equal(buildHash(mode, page), hash);
  }
  assert.equal(buildHash({ kind: 'host' }, 'board'), '#host');
  assert.equal(buildHash({ kind: 'watch', room: 'major' }, 'board'), '#watch=major');
  assert.equal(buildHash({ kind: 'solo' }, 'board'), '#board');
});
