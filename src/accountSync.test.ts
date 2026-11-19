import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deviceId, readLocal, shouldAdopt, writeLocal, type AccountSave } from './accountSync';

function memory(init: Record<string, string> = {}) {
  const map = new Map(Object.entries(init));
  return { map, getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v); }, removeItem: (k: string) => { map.delete(k); } };
}
const save = (by: string | null, at: number, data: AccountSave['data'] = { session: {} }): AccountSave => ({ at, by, data });

test('a device id is made once and reused', () => {
  const store = memory();
  const id = deviceId(store);
  assert.match(id!, /^[a-z0-9]{16}$/);
  assert.equal(deviceId(store), id);
});

test('only another device\'s save that this browser has not taken yet replaces the local console', () => {
  assert.equal(shouldAdopt(save('other', 20), 'mine', 10), true);          // another computer saved since
  assert.equal(shouldAdopt(save('other', 20), 'mine', 20), false);         // already taken: local may be ahead
  assert.equal(shouldAdopt(save('mine', 20), 'mine', 10), false);          // our own save whose reply was lost
  assert.equal(shouldAdopt(save(null, 0, null), 'mine', 0), false);        // nothing saved yet
  assert.equal(shouldAdopt(save('other', 20), null, 0), true);             // no device id: a save is always another's
});

test('account settings are read from and written back to the known keys only', () => {
  const store = memory({ 'plset.scoreboard.key': 'abc', 'plset.mode': 'light', 'plset.session.v1': '{}', 'plset.device': 'd' });
  assert.deepEqual(readLocal(store), { 'plset.scoreboard.key': 'abc', 'plset.mode': 'light' });
  assert.equal(writeLocal({ 'plset.scoreboard.key': 'abc', 'plset.mode': 'light' }, store), false);
  assert.equal(writeLocal({ 'plset.scoreboard.key': 'xyz', 'plset.session.v1': 'x', 'plset.device': 'other' } as Record<string, string>, store), true);
  // The key changed, the mode the save lacks is gone, and keys outside the list are untouched.
  assert.deepEqual([...store.map].sort(), [['plset.device', 'd'], ['plset.scoreboard.key', 'xyz'], ['plset.session.v1', '{}']]);
});
