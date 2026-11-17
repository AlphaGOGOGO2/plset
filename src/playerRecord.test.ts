import test from 'node:test';
import assert from 'node:assert/strict';
import { ROSTER } from './roster';
import ids from './eloboard-ids.json';
import { currentMonth, eloboardId, eloboardUrl, fetchRecord, monthLabel, parseRecord, winRate, RECORD_TTL_MS, forgetRecord, loadRecord, preloadRecords } from './playerRecord';

const sample = () => ({ playerId: 12, month: '2026-11', total: { wins: 20, losses: 14 }, vs: { T: { wins: 5, losses: 6, complete: true }, Z: { wins: 8, losses: 5, complete: true }, P: { wins: 7, losses: 3, complete: false } }, complete: false, url: 'https://eloboard.com/players/12?tab=matches&category=pro_league&month=2026-11&by=month', fetchedAt: 1794900000000 });
const at = (iso: string) => Date.parse(iso);

test('the current month follows the Seoul calendar, not UTC', () => {
  assert.equal(currentMonth(at('2026-10-31T14:59:59Z')), '2026-10');
  assert.equal(currentMonth(at('2026-10-31T15:00:00Z')), '2026-11');
  assert.equal(currentMonth(at('2026-10-31T15:30:00Z')), '2026-11');
  assert.equal(currentMonth(at('2026-11-17T03:00:00Z')), '2026-11');
  assert.equal(currentMonth(at('2026-12-31T14:59:59Z')), '2026-12');
  assert.equal(currentMonth(at('2026-12-31T15:00:00Z')), '2027-01');
  assert.equal(currentMonth(at('2027-02-28T15:00:00Z')), '2027-03');
});

test('month label is written the Korean way without a leading zero', () => {
  assert.equal(monthLabel('2026-11'), '2026년 11월');
  assert.equal(monthLabel('2027-03'), '2027년 3월');
});

test('win rate has one decimal and a dash when no games were played', () => {
  assert.equal(winRate(20, 14), '58.8%');
  assert.equal(winRate(1, 2), '33.3%');
  assert.equal(winRate(7, 0), '100.0%');
  assert.equal(winRate(0, 4), '0.0%');
  assert.equal(winRate(0, 0), '–');
});

test('a roster player resolves to the mapped EloBoard id by roster id or by name', () => {
  const first = ROSTER.find(p => p.id === 'p003')!;
  assert.equal(ids.ids.p003, 12);
  assert.equal(eloboardId({ name: first.name, rosterId: 'p003' }), 12);
  assert.equal(eloboardId({ name: first.name }), 12);
  assert.equal(eloboardId({ name: '아무 이름', rosterId: 'p001' }), 32);
});

test('a custom or unmapped player has no EloBoard id', () => {
  assert.equal(eloboardId({ name: '로스터에 없는 선수' }), null);
  assert.equal(eloboardId({ name: '로스터에 없는 선수', rosterId: 'p99999' }), null);
  assert.equal(eloboardId({ name: 'constructor' }), null);
});

test('every mapped id is a positive integer and belongs to a roster player', () => {
  const known = new Set(ROSTER.map(p => p.id));
  for (const [rosterId, id] of Object.entries(ids.ids)) { assert.ok(known.has(rosterId), `unknown roster id ${rosterId}`); assert.ok(Number.isSafeInteger(id) && id > 0, `bad id for ${rosterId}`); }
});

test('the fallback source link has the same shape as the one the server sends', () => {
  assert.equal(eloboardUrl(12, '2026-11'), sample().url);
});

test('a well-formed record passes and comes back as a clean copy', () => {
  const input = { ...sample(), extra: 'ignored' };
  assert.deepEqual(parseRecord(input), sample());
  assert.deepEqual(parseRecord({ ...sample(), total: { wins: 0, losses: 0 }, complete: true }), { ...sample(), total: { wins: 0, losses: 0 }, complete: true });
});

test('malformed records are rejected', () => {
  const bad: [string, unknown][] = [
    ['null', null], ['string', 'ok'], ['array', []], ['empty object', {}], ['html fallback', '<!doctype html>'],
    ['string playerId', { ...sample(), playerId: '12' }], ['zero playerId', { ...sample(), playerId: 0 }], ['fractional playerId', { ...sample(), playerId: 1.5 }],
    ['month without zero pad', { ...sample(), month: '2026-1' }], ['month 13', { ...sample(), month: '2026-13' }], ['month with day', { ...sample(), month: '2026-11-01' }], ['numeric month', { ...sample(), month: 202611 }],
    ['missing total', { ...sample(), total: undefined }], ['negative wins', { ...sample(), total: { wins: -1, losses: 3 } }], ['string losses', { ...sample(), total: { wins: 1, losses: '3' } }], ['NaN wins', { ...sample(), total: { wins: NaN, losses: 3 } }], ['fractional wins', { ...sample(), total: { wins: 2.5, losses: 3 } }],
    ['missing vs', { ...sample(), vs: undefined }], ['vs as array', { ...sample(), vs: [] }], ['missing race', { ...sample(), vs: { T: sample().vs.T, Z: sample().vs.Z } }],
    ['race without complete', { ...sample(), vs: { ...sample().vs, P: { wins: 7, losses: 3 } } }], ['race complete as string', { ...sample(), vs: { ...sample().vs, P: { wins: 7, losses: 3, complete: 'false' } } }], ['race with infinite losses', { ...sample(), vs: { ...sample().vs, Z: { wins: 1, losses: Infinity, complete: true } } }],
    ['complete as number', { ...sample(), complete: 0 }], ['missing fetchedAt', { ...sample(), fetchedAt: undefined }], ['infinite fetchedAt', { ...sample(), fetchedAt: Infinity }],
    ['missing url', { ...sample(), url: undefined }], ['javascript url', { ...sample(), url: 'javascript:alert(1)' }], ['http url', { ...sample(), url: 'http://eloboard.com/players/12' }], ['other host', { ...sample(), url: 'https://eloboard.com.example.org/players/12' }], ['look-alike host', { ...sample(), url: 'https://noteloboard.com/players/12' }], ['relative url', { ...sample(), url: '/players/12' }],
  ];
  for (const [name, value] of bad) assert.equal(parseRecord(value), null, name);
});

test('fetchRecord asks the absolute endpoint and surfaces the server message, a bad body, and a mismatched answer', async () => {
  const original = globalThis.fetch, calls: string[] = [];
  const reply = (status: number, body: string) => { globalThis.fetch = (async (input: RequestInfo | URL) => { calls.push(String(input)); return new Response(body, { status }); }) as typeof fetch; };
  try {
    reply(200, JSON.stringify(sample()));
    assert.deepEqual(await fetchRecord(12, '2026-11'), sample());
    assert.equal(calls[0], '/api/proleague/record?player=12&month=2026-11');
    reply(502, JSON.stringify({ error: 'EloBoard 응답이 지연되고 있습니다.' }));
    await assert.rejects(fetchRecord(12, '2026-11'), { message: 'EloBoard 응답이 지연되고 있습니다.' });
    reply(404, '<!doctype html>');
    await assert.rejects(fetchRecord(12, '2026-11'), /HTTP 404/);
    reply(200, '<!doctype html>');
    await assert.rejects(fetchRecord(12, '2026-11'), /응답을 읽을 수 없습니다/);
    reply(200, JSON.stringify(sample()));
    await assert.rejects(fetchRecord(13, '2026-11'), /응답을 읽을 수 없습니다/);
    await assert.rejects(fetchRecord(12, '2026-12'), /응답을 읽을 수 없습니다/);
    globalThis.fetch = (async () => { throw new TypeError('failed to fetch'); }) as typeof fetch;
    await assert.rejects(fetchRecord(12, '2026-11'), /연결하지 못했습니다/);
  } finally { globalThis.fetch = original; }
});

// A stand-in for the endpoint whose answers are released by hand, so the order and overlap of requests can be observed.
function slowServer() {
  const original = globalThis.fetch, calls: number[] = [], waiting = new Map<number, (ok: boolean) => void>();
  let inFlight = 0, peak = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'https://starjoa.kr'), id = Number(url.searchParams.get('player')), month = url.searchParams.get('month')!;
    calls.push(id); inFlight++; peak = Math.max(peak, inFlight);
    const ok = await new Promise<boolean>(resolve => waiting.set(id, resolve));
    inFlight--;
    const body = { playerId: id, month, total: { wins: id, losses: 1 }, vs: { T: { wins: id, losses: 1, complete: true }, Z: { wins: 0, losses: 0, complete: true }, P: { wins: 0, losses: 0, complete: true } }, complete: true, url: `https://eloboard.com/players/${id}`, fetchedAt: 1 };
    return ok ? new Response(JSON.stringify(body), { status: 200 }) : new Response(JSON.stringify({ error: '전적을 불러오지 못했습니다.' }), { status: 502 });
  }) as typeof fetch;
  const tick = () => new Promise(resolve => setTimeout(resolve, 0));
  return { calls, peak: () => peak, release: async (id: number, ok = true) => { waiting.get(id)!(ok); waiting.delete(id); await tick(); await tick(); }, tick, restore: () => { globalThis.fetch = original; } };
}

test('preloading asks for one player at a time and the modal reuses what is in memory', async () => {
  const server = slowServer();
  try {
    preloadRecords([9101, 9102, 9103, 9101], '2026-11');
    await server.tick();
    assert.deepEqual(server.calls, [9101]);
    await server.release(9101);
    assert.deepEqual(server.calls, [9101, 9102]);
    await server.release(9102); await server.release(9103);
    assert.deepEqual(server.calls, [9101, 9102, 9103]);
    assert.equal(server.peak(), 1);
    assert.equal((await loadRecord(9102, '2026-11')).total.wins, 9102);
    preloadRecords([9101, 9102, 9103], '2026-11');
    await server.tick();
    assert.deepEqual(server.calls, [9101, 9102, 9103]);
  } finally { server.restore(); }
});

test('opening the modal for a player still waiting in line loads them at once, without a second request later', async () => {
  const server = slowServer();
  try {
    preloadRecords([9201, 9202, 9203], '2026-11');
    await server.tick();
    const opened = loadRecord(9203, '2026-11');
    await server.tick();
    assert.deepEqual(server.calls, [9201, 9203]);
    await server.release(9203);
    assert.equal((await opened).total.wins, 9203);
    await server.release(9201); await server.release(9202);
    await server.tick();
    assert.deepEqual(server.calls, [9201, 9203, 9202]);
  } finally { server.restore(); }
});

test('a failed load is not remembered, and a record older than 15 minutes is fetched again', async () => {
  const server = slowServer();
  try {
    const failed = loadRecord(9301, '2026-11');
    await server.tick(); await server.release(9301, false);
    await assert.rejects(failed, /불러오지 못했습니다/);
    const retried = loadRecord(9301, '2026-11');
    await server.tick(); await server.release(9301);
    assert.equal((await retried).total.wins, 9301);
    assert.deepEqual(server.calls, [9301, 9301]);

    const now = 1_000_000;
    const first = loadRecord(9302, '2026-11', { now });
    await server.tick(); await server.release(9302); await first;
    await loadRecord(9302, '2026-11', { now: now + RECORD_TTL_MS - 1 });
    assert.equal(server.calls.filter(id => id === 9302).length, 1);
    const later = loadRecord(9302, '2026-11', { now: now + RECORD_TTL_MS });
    await server.tick(); await server.release(9302); await later;
    assert.equal(server.calls.filter(id => id === 9302).length, 2);

    forgetRecord(9302, '2026-11');
    const again = loadRecord(9302, '2026-11', { now: now + RECORD_TTL_MS + 1 });
    await server.tick(); await server.release(9302); await again;
    assert.equal(server.calls.filter(id => id === 9302).length, 3);
  } finally { server.restore(); }
});
