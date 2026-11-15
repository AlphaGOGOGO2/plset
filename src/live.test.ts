import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession } from './domain';
import { toShared } from './share';
import { backoff, viewerInbox } from './live';

const frame = (rev: number, extra: object = {}) => JSON.stringify({ t: 'state', rev, sentAt: 1000, age: 250, page: 'teams', session: toShared(createSession()), ...extra });

test('backoff doubles from 1 s to a 30 s ceiling, with jitter in the upper half', () => {
  assert.equal(backoff(0, () => 1), 1000);
  assert.equal(backoff(3, () => 1), 8000);
  assert.equal(backoff(10, () => 1), 30000);
  assert.equal(backoff(2, () => 0), 2000);
});
test('a state frame yields the session, page, and the host clock at arrival', () => {
  const event = viewerInbox()(frame(5));
  assert.equal(event?.t, 'state');
  if (event?.t !== 'state') return;
  assert.equal(event.page, 'teams');
  assert.equal(event.hostNow, 1250);
  assert.deepEqual(event.session.patrons, []);
});
test('older or repeated revisions are dropped', () => {
  const inbox = viewerInbox();
  assert.equal(inbox(frame(5))?.t, 'state');
  assert.equal(inbox(frame(5)), null);
  assert.equal(inbox(frame(4)), null);
  assert.equal(inbox(frame(6))?.t, 'state');
});
test('invalid sessions are dropped, and three in a row ask for a refresh', () => {
  const inbox = viewerInbox(), bad = (rev: number) => frame(rev, { session: { version: 99 } });
  assert.equal(inbox(bad(1)), null);
  assert.equal(inbox(bad(2)), null);
  assert.deepEqual(inbox(bad(3)), { t: 'stale' });
  const again = viewerInbox();
  again(bad(1)); again(bad(2));
  assert.equal(again(frame(3))?.t, 'state');
  assert.equal(again(bad(4)), null);
});
test('an unknown page falls back to the dashboard', () => {
  const event = viewerInbox()(frame(1, { page: 'admin' }));
  assert.equal(event?.t === 'state' && event.page, 'board');
});
test('host presence, close, and junk', () => {
  const inbox = viewerInbox();
  assert.deepEqual(inbox('{"t":"host","online":false}'), { t: 'host', online: false });
  assert.deepEqual(inbox('{"t":"closed"}'), { t: 'closed' });
  assert.equal(inbox('pong'), null);
  assert.equal(inbox('{"t":"mystery"}'), null);
});
