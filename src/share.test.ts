import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession, validateSession, type Session } from './domain';
import { patronOnly, rebaseClock, shareStructure, toShared } from './share';

const base = (): Session => ({ ...createSession(), patrons: [{ id: 'p1', nickname: '비밀후원자', amount: 7777, note: '메모' }],
  logs: [{ id: 'l1', at: 1, text: '팀 편성 변경' }, { id: 'l2', at: 2, text: '새 방식 귀인 기록', private: true }, { id: 'l3', at: 3, text: '비밀후원자 귀인 펀딩 7,777개' }, { id: 'l4', at: 4, text: '귀인 초기화' }] });

test('toShared never carries patrons or patron logs, old or new', () => {
  const shared = toShared(base()), text = JSON.stringify(shared);
  assert.deepEqual(shared.patrons, []);
  assert.deepEqual(shared.logs.map(l => l.id), ['l1']);
  assert.ok(!text.includes('비밀후원자') && !text.includes('7777') && !text.includes('메모'));
});
test('toShared output is a valid session and leaves the original untouched', () => {
  const s = base();
  validateSession(JSON.parse(JSON.stringify(toShared(s))));
  assert.equal(s.patrons.length, 1);
  assert.equal(s.logs.length, 4);
});
test('the private flag survives validation', () => {
  const s = validateSession(JSON.parse(JSON.stringify(base())));
  assert.equal(s.logs.find(l => l.id === 'l2')?.private, true);
  assert.throws(() => validateSession({ ...JSON.parse(JSON.stringify(base())), logs: [{ id: 'x', at: 1, text: 't', private: 'yes' }] }));
});
test('patronOnly is true only when nothing but patrons changed', () => {
  const s = base();
  assert.equal(patronOnly(s, { ...s, patrons: [] }), true);
  assert.equal(patronOnly(s, { ...s, patrons: [], notes: 'x' }), false);
  assert.equal(patronOnly(s, { ...s, notes: 'x' }), false);
  assert.equal(patronOnly(s, { ...s }), false);
  assert.equal(patronOnly(s, { ...s, patrons: s.patrons, timer: { ...s.timer } }), false);
});
test('rebaseClock moves host timestamps onto the local clock', () => {
  const s: Session = { ...base(), timer: { label: 't', remaining: 60000, deadline: 1_000_000 },
    draw: { mode: 'wheel', source: 'custom', seed: 1, startedAt: 500_000, rank: 1, items: [], results: [], finishedAt: 600_000 } as unknown as Session['draw'] };
  const local = rebaseClock(s, 2500);
  assert.equal(local.timer.deadline, 997_500);
  assert.equal(local.draw?.startedAt, 497_500);
  assert.equal(local.draw?.finishedAt, 597_500);
  assert.equal(s.timer.deadline, 1_000_000);
  const idle = rebaseClock({ ...base(), draw: null }, 2500);
  assert.equal(idle.timer.deadline, null);
  assert.equal(idle.draw, null);
});
test('shareStructure keeps references for unchanged parts so stages do not restart', () => {
  const a = JSON.parse(JSON.stringify(toShared(base()))) as Session;
  const b = { ...JSON.parse(JSON.stringify(a)), notes: 'changed' } as Session;
  const merged = shareStructure(a, b);
  assert.equal(merged.players, a.players);
  assert.equal(merged.timer, a.timer);
  assert.equal(merged.notes, 'changed');
  assert.equal(shareStructure(null, b), b);
});
