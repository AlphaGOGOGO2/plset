import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession, validateSession, type Session, type Team } from './domain';
import { chatEntries, isSbStyle, parseBoardSets, scoreboardPatch, mergePatches, applyScoreboardPatch, createScoreboard, currentGame, fillRows, findPlayer, fitStage, mapShort, pasteDown, gameScore, scoreboardView, validScoreboard, clockHour, gameColor, type SbRow } from './scoreboard';

const row = (a: string, map: string, b: string, winner: Team | null = null): SbRow => ({ a, map, b, winner });
// 이재호 on team A, 김명운 on team B, everyone else unassigned.
function session(rows: SbRow[]): Session {
  const s = createSession();
  const teamOf: Record<string, Team> = { 이재호: 'A', 송병구: 'A', 김명운: 'B', 김지성: 'B' };
  const sb = createScoreboard();
  return { ...s, teams: { A: '재호팀', B: '명운팀' }, players: s.players.map(p => ({ ...p, team: teamOf[p.name] ?? null })), scoreboard: { ...sb, sets: { ...sb.sets, '1': rows }, setScore: { A: 1, B: 0 } } };
}

test('a new scoreboard: pro league 7/4 in 1SET, winners 9/5 in 2SET, one ace game, and is valid', () => {
  const sb = createScoreboard();
  assert.deepEqual(sb.titles, { '1': '프로리그 7/4', '2': '위너스 9/5', ace: '에이스결정전' });
  assert.deepEqual([sb.sets['1'].length, sb.sets['2'].length, sb.sets.ace.length], [7, 9, 1]);
  assert.ok(validScoreboard(sb));
});

test('a malformed scoreboard is dropped instead of rejecting the session', () => {
  const bad = { ...createSession(), scoreboard: { ...createScoreboard(), onAir: '3' } };
  const kept = validateSession(JSON.parse(JSON.stringify(bad)));
  assert.equal(kept.scoreboard, undefined);
  const good = { ...createSession(), scoreboard: createScoreboard() };
  assert.deepEqual(validateSession(JSON.parse(JSON.stringify(good))).scoreboard, good.scoreboard);
});

test('game score counts winners and the current game is the first undecided entered row', () => {
  const rows = [row('재호', '녹아', '명운', 'A'), row('병구', '', '지성'), row('', '', ''), row('', '', '')];
  assert.deepEqual(gameScore(rows), { A: 1, B: 0 });
  assert.equal(currentGame(rows), 1);
  assert.equal(currentGame([row('', '', '')]), null);
  assert.equal(currentGame([row('재호', '', '명운', 'A'), row('병구', '', '지성', 'B')]), 1);
});

test('without a base player team A stays on the left with the session team names', () => {
  const v = scoreboardView(session([row('재호', '녹아', '명운', 'A'), row('병구', '컬러', '지성')]), null);
  assert.deepEqual([v.left.label, v.right.label], ['재호팀', '명운팀']);
  assert.deepEqual([v.left.setScore, v.left.gameScore, v.right.gameScore, v.right.setScore], [1, 1, 0, 0]);
  assert.deepEqual(v.now, { left: { name: '병구', race: 'P', pos: '', color: '' }, right: { name: '지성', race: 'T', pos: '', color: '' } });
  assert.equal(v.rows[0].winner, 'left');
  assert.equal(v.title, '프로리그 7/4');
  assert.equal(v.setLabel, '1SET');
});

test('a base player on team B swaps every side and labels the teams from their view', () => {
  const v = scoreboardView(session([row('재호', '녹아', '명운', 'A'), row('병구', '컬러', '지성')]), '김명운');
  assert.deepEqual([v.left.label, v.right.label], ['명운팀', '상대팀']);
  assert.deepEqual([v.left.setScore, v.left.gameScore, v.right.gameScore, v.right.setScore], [0, 0, 1, 1]);
  assert.deepEqual(v.rows[0], { left: { name: '명운', race: 'Z', pos: '', color: '' }, map: '녹아', right: { name: '재호', race: 'T', pos: '', color: '' }, winner: 'right', current: false });
  assert.deepEqual(v.now, { left: { name: '지성', race: 'T', pos: '', color: '' }, right: { name: '병구', race: 'P', pos: '', color: '' } });
});

test('the base player may be given by full or given name; team A keeps its side but is renamed', () => {
  const s = session([row('재호', '', '명운')]);
  assert.deepEqual([scoreboardView(s, '재호').left.label, scoreboardView(s, '재호').right.label], ['재호팀', '상대팀']);
  // A name that is not on a team changes nothing.
  assert.deepEqual([scoreboardView(s, '임홍규').left.label, scoreboardView(s, '없는선수').right.label], ['재호팀', '명운팀']);
  // A typed name that matches nobody has no race.
  assert.equal(scoreboardView(session([row('누구', '', '명운')]), null).rows[0].left.race, null);
});

test('pasting fills columns line by line and an empty column keeps what is there', () => {
  const entry = fillRows(createScoreboard().sets['1'], '재호\n현제\n병구\n', '', '제동\n명운\n지성');
  assert.deepEqual(entry.slice(0, 3).map(r => [r.a, r.map, r.b]), [['재호', '', '제동'], ['현제', '', '명운'], ['병구', '', '지성']]);
  assert.equal(entry.length, 7);
  const decided = entry.map((r, i) => i === 0 ? { ...r, winner: 'A' as Team } : r);
  const maps = fillRows(decided, '', '녹아\r\n백룸\n오디', '');
  assert.deepEqual(maps.slice(0, 3).map(r => [r.a, r.map, r.b, r.winner]), [['재호', '녹아', '제동', 'A'], ['현제', '백룸', '명운', null], ['병구', '오디', '지성', null]]);
  assert.equal(fillRows(decided, '정우', '', '').at(0)!.winner, null);
  assert.equal(fillRows([row('', '', '')], '1\n2\n3\n4\n5\n6\n7\n8\n9\n10', '', '').length, 9);
  // One line is split at its spaces: an entry from chat, maps copied from the map draw.
  const oneLine = fillRows(createScoreboard().sets['1'], '재호 현제  병구 일장 홍구', '녹아 컬러 오디', '');
  assert.deepEqual(oneLine.slice(0, 5).map(r => [r.a, r.map]), [['재호', '녹아'], ['현제', '컬러'], ['병구', '오디'], ['일장', ''], ['홍구', '']]);
});

test('the stage fills any 16:9 size and is centred like the game on other screen shapes', () => {
  assert.deepEqual(fitStage(1920, 1080), { k: 1, x: 0, y: 0 });
  assert.deepEqual(fitStage(1280, 720), { k: 2 / 3, x: 0, y: 0 });
  assert.deepEqual(fitStage(2560, 1440), { k: 4 / 3, x: 0, y: 0 });
  // 16:10 (1920×1200): full width, 60px bars above and below.
  assert.deepEqual(fitStage(1920, 1200), { k: 1, x: 0, y: 60 });
  // 21:9 (2560×1080): full height, 320px bars at the sides.
  assert.deepEqual(fitStage(2560, 1080), { k: 1, x: 320, y: 0 });
  assert.deepEqual(fitStage(0, 0), { k: 0, x: 0, y: 0 });
});

test('the design is each streamer\'s own (glass by default), and the old shared design / on-off fields are ignored', () => {
  assert.equal(scoreboardView(session([row('재호', '', '명운')]), null).style, 'glass');
  assert.equal(scoreboardView(session([row('재호', '', '명운')]), null, 'bnet').style, 'bnet');
  assert.ok(validScoreboard({ ...createScoreboard(), style: 'doodle', show: { score: false, entry: true } }));
  assert.ok(isSbStyle('neon'));
  assert.equal(isSbStyle('plaid'), false);
});

const CHAT = `[2. llllllllllllll] JSA_Larva: 2
[2. llllllllllllll] JSA_Larva: 1
[2. llllllllllllll] kimsabuho: 재호 현제 병구 일장 홍구
[2. llllllllllllll] jd2321232: 제동 명운 지성 영진 정우
[2. llllllllllllll] JSA_Larva: 맵
[2. llllllllllllll]: `;
function chatSession(teams: boolean) {
  const s = createSession();
  const extra = [['이제동', 'Z'], ['조현제', 'T'], ['홍구', 'Z']].map(([name, race], i) => ({ id: `x${i}`, name, race: race as 'Z' | 'T', amount: 0, team: null, active: true }));
  const teamOf: Record<string, Team> = { 이재호: 'A', 조현제: 'A', 송병구: 'A', 조일장: 'A', 홍구: 'A', 이제동: 'B', 김명운: 'B', 김지성: 'B', 유영진: 'B', 김정우: 'B' };
  return [...s.players, ...extra].map(p => ({ ...p, team: teams ? teamOf[p.name] ?? null : null }));
}

test('battle.net chat: drops channel tags, ids and chatter, and files each entry under its players’ team', () => {
  assert.deepEqual(chatEntries(CHAT, chatSession(true)), { A: ['재호', '현제', '병구', '일장', '홍구'], B: ['제동', '명운', '지성', '영진', '정우'] });
  // Team B's entry posted first still lands in B.
  const swapped = CHAT.split('\n'); [swapped[2], swapped[3]] = [swapped[3], swapped[2]];
  assert.deepEqual(chatEntries(swapped.join('\n'), chatSession(true)).B, ['제동', '명운', '지성', '영진', '정우']);
  // Windows line endings from the clipboard.
  assert.deepEqual(chatEntries(CHAT.replace(/\n/g, '\r\n'), chatSession(true)).A, ['재호', '현제', '병구', '일장', '홍구']);
});

test('battle.net chat: before teams are set the first entry is A and the next is B; a later entry replaces one', () => {
  assert.deepEqual(chatEntries(CHAT, chatSession(false)), { A: ['재호', '현제', '병구', '일장', '홍구'], B: ['제동', '명운', '지성', '영진', '정우'] });
  const fixed = `${CHAT}
[2. lll] kimsabuho: 재호 병구 현제 일장 홍구`;
  assert.deepEqual(chatEntries(fixed, chatSession(true)).A, ['재호', '병구', '현제', '일장', '홍구']);
  assert.deepEqual(chatEntries('재호 현제 병구', chatSession(true)), { A: ['재호', '현제', '병구'] });
  assert.deepEqual(chatEntries('[2. ll] someone: ㅋㅋ 재호 오늘 잘하네 진짜로', chatSession(true)), {});
});

test('the overlays show the on-air set\'s title and the winning share; maps show two letters', () => {
  const s = session([row('재호', '컬러리스 페이트', '명운'), row('정우', '녹아웃', '영진')]);
  const funded = { ...s, teamSize: 5, players: s.players.map((p, i) => ({ ...p, amount: i < 2 ? 40_500 : 0 })) };
  const v = scoreboardView(funded, null);
  assert.equal(v.title, '프로리그 7/4');
  assert.equal(v.prize, 16_200);
  assert.deepEqual(v.rows.map(r => r.map), ['컬러', '녹아']);
  assert.equal(scoreboardView({ ...s, scoreboard: { ...s.scoreboard!, onAir: '2' } }, null).title, '위너스 9/5');
  assert.equal(scoreboardView(s, null).prize, 0);
  // A scoreboard saved with the old single title is not valid any more and starts over.
  const { titles, ...old } = createScoreboard();
  assert.equal(validScoreboard({ ...old, title: titles['1'] }), false);
});

test('maps are always two letters, and pasting several names into a cell fills downwards', () => {
  assert.equal(mapShort('컬러리스 페이트'), '컬러');
  assert.equal(mapShort('녹아웃'), '녹아');
  assert.equal(mapShort('A'), 'A');
  assert.deepEqual(fillRows([row('', '', '')], '', '녹아웃\n컬러리스 페이트', '').map(r => r.map), ['녹아', '컬러']);
  const rows = [row('재호', '', '명운', 'A'), row('정우', '', '영진'), row('', '', '')];
  const maps = pasteDown(rows, 1, 'map', ['백룸', '오디세이', '옥타곤', '아이올로스']);
  assert.deepEqual(maps.map(r => r.map), ['', '백룸', '오디', '옥타', '아이']);
  assert.equal(maps[0].winner, 'A');
  const entry = pasteDown(rows, 0, 'a', ['현제', '병구']);
  assert.deepEqual(entry.map(r => [r.a, r.winner]), [['현제', null], ['병구', null], ['', null]]);
  assert.equal(pasteDown(rows, 5, 'b', ['1', '2', '3', '4', '5']).length, 9);
});

test('nicknames registered in the roster find their player: 홍구 → 임홍규, 짭제 → 박상현', () => {
  const s = createSession();
  const players = [...s.players, { id: 'x1', name: '박상현', race: 'Z' as const, amount: 0, team: 'B' as Team, active: true }]
    .map(p => p.name === '임홍규' ? { ...p, team: 'B' as Team } : p.name === '이재호' || p.name === '송병구' ? { ...p, team: 'A' as Team } : p);
  assert.equal(findPlayer(players, '홍구')?.name, '임홍규');
  assert.equal(findPlayer(players, '짭제')?.name, '박상현');
  assert.equal(findPlayer(players, '짭 제동')?.name, '박상현');
  assert.equal(findPlayer(players, '갓재호')?.name, '이재호');
  assert.equal(findPlayer(players, '아무개'), null);
  // A chat entry written in nicknames still counts as an entry and lands in their team.
  assert.deepEqual(chatEntries('[2. ll] jd2321232: 홍구 짭제\n[2. ll] kimsabuho: 재호 병구', players), { B: ['홍구', '짭제'], A: ['재호', '병구'] });
});

test('entry boards follow the set on air; SUPER ACE keeps both sets, with the 2SET entry and its score, and the ace game rides on it as a card', () => {
  const base = session([]), sb = base.scoreboard!;
  const s: Session = { ...base, scoreboard: { ...sb, onAir: 'ace',
    sets: { ...sb.sets, '2': [row('재호', '녹아', '명운', 'B'), row('병구', '컬러', '지성', 'A'), row('재호', '오디', '지성', 'B')], ace: [row('병구', '오디세이', '명운')] } } };
  const v = scoreboardView(s, '김명운');
  assert.deepEqual(v.entries.map(b => b.setLabel), ['1SET', '2SET']);
  const e = v.entries[1];
  assert.deepEqual([e.setLabel, e.title, e.left, e.right], ['2SET', '위너스 9/5', 2, 1]);
  assert.deepEqual(e.rows.map(r => [r.left.name, r.winner, r.current]), [['명운', 'left', false], ['지성', 'right', false], ['지성', 'left', false]]);
  assert.deepEqual(v.ace, { left: { name: '명운', race: 'Z', pos: '', color: '' }, map: '오디', right: { name: '병구', race: 'P', pos: '', color: '' }, winner: null, current: true });
  assert.equal(v.setLabel, 'SUPER ACE');
  // 1SET on air: its board alone. 2SET: the 1SET board stays and 2SET goes beside it. No card either way.
  const one = scoreboardView({ ...s, scoreboard: { ...s.scoreboard!, onAir: '1' } }, null);
  assert.equal(one.ace, null);
  assert.deepEqual(one.entries.map(b => b.setLabel), ['1SET']);
  const two = scoreboardView({ ...s, scoreboard: { ...s.scoreboard!, onAir: '2' } }, null);
  assert.equal(two.ace, null);
  assert.deepEqual(two.entries.map(b => b.setLabel), ['1SET', '2SET']);
  assert.deepEqual(two.entries[1].rows.map(r => r.current), [false, false, true]);
});

test('the board shows every entered game, map-only rows and games still to play included, never empty rows, and keeps game numbers', () => {
  const base = session([]), sb = base.scoreboard!;
  const two = [row('재호', '녹아', '명운', 'A'), row('병구', '컬러', '지성', 'B'), row('재호', '오디', '지성'), row('병구', '옥타', '명운'), row('', '투혼', ''), row('', '', '')];
  const v = scoreboardView({ ...base, scoreboard: { ...sb, onAir: '2', sets: { ...sb.sets, '1': [row('재호', '녹아', '명운', 'A'), row('', '', ''), row('병구', '', '지성', 'B')], '2': two } } }, null);
  // 1SET is over: its filled rows, numbered as entered (the empty game 2 is skipped).
  assert.deepEqual(v.entries[0].rows.map(r => r.no), [1, 3]);
  // 2SET is on: all four entered games (3 is being played, 4 is still to come); game 5 has only its map; the empty row is left out.
  assert.deepEqual(v.entries[1].rows.map(r => [r.no, r.current]), [[1, false], [2, false], [3, true], [4, false], [5, false]]);
  assert.deepEqual([v.entries[1].rows[4].left.name, v.entries[1].rows[4].map, v.entries[1].rows[4].right.name], ['', '투혼', '']);
  // Before any entry the board has no rows at all.
  assert.deepEqual(scoreboardView({ ...base, scoreboard: { ...sb, onAir: '1' } }, null).entries[0].rows, []);
});

test('each streamer can leave a set\'s entry board out; the boards still follow the match', () => {
  const base = session([row('재호', '녹아', '명운', 'A')]), sb = base.scoreboard!;
  const on2 = { ...base, scoreboard: { ...sb, onAir: '2' as const, sets: { ...sb.sets, '2': [row('병구', '컬러', '지성')] } } };
  assert.deepEqual(scoreboardView(on2, null, 'glass', ['2']).entries.map(b => b.setLabel), ['2SET']);
  assert.deepEqual(scoreboardView(on2, null, 'glass', ['1']).entries.map(b => b.setLabel), ['1SET']);
  assert.deepEqual(scoreboardView(on2, null).entries.map(b => b.setLabel), ['1SET', '2SET']);
  // During 1SET a 2SET-only streamer has no board yet.
  assert.deepEqual(scoreboardView(base, null, 'glass', ['2']).entries, []);
  assert.deepEqual(parseBoardSets('2'), ['2']);
  assert.deepEqual(parseBoardSets(null), ['1', '2']);
  assert.deepEqual(parseBoardSets('3'), ['1', '2']);
});

test('a 방싸개 edit travels as a patch of what changed, so the host\'s edits to the rest survive the merge', () => {
  const board = createScoreboard();
  const edited = { ...board, sets: { ...board.sets, '1': board.sets['1'].map((r, i) => i === 0 ? { ...r, a: '재호' } : r) } };
  assert.deepEqual(scoreboardPatch(board, edited), { sets: { '1': edited.sets['1'] } });
  assert.equal(scoreboardPatch(board, board), null);
  assert.deepEqual(Object.keys(scoreboardPatch(undefined, board)!).sort(), ['onAir', 'setScore', 'sets', 'titles']);
  // Meanwhile the host switched to 2SET: merging the patch keeps that and adds the entry.
  const host = { ...board, onAir: '2' as const };
  const merged = applyScoreboardPatch(host, scoreboardPatch(board, edited));
  assert.equal(merged?.onAir, '2');
  assert.equal(merged?.sets['1'][0].a, '재호');
  assert.deepEqual(mergePatches({ onAir: '1', sets: { '1': [] } }, { onAir: '2', sets: { '2': [] } }), { onAir: '2', sets: { '1': [], '2': [] } });
  assert.equal(applyScoreboardPatch(board, { onAir: '3' }), null);
  assert.equal(applyScoreboardPatch(board, []), null);
});

test('start locations are clock hours, follow the side swap, and stay with their player', () => {
  assert.deepEqual(['11', '1', '13', '0', '7시', '', '123'].map(clockHour), ['11', '1', '3', '', '7', '', '3']);
  const rows: SbRow[] = [{ ...row('재호', '녹아', '명운'), pa: '11', pb: '5' }];
  assert.deepEqual([scoreboardView(session(rows), null).now!.left.pos, scoreboardView(session(rows), null).now!.right.pos], ['11', '5']);
  assert.deepEqual([scoreboardView(session(rows), '김명운').now!.left.pos, scoreboardView(session(rows), '김명운').now!.right.pos], ['5', '11']);
  assert.equal(scoreboardView(session([row('재호', '', '명운')]), null).now!.left.pos, '');
  const sb = createScoreboard();
  assert.ok(validScoreboard({ ...sb, sets: { ...sb.sets, '1': rows } }));
  assert.equal(validScoreboard({ ...sb, sets: { ...sb.sets, '1': [{ ...rows[0], pa: '13' }] } }), false);
  // Refilling the entry keeps a location only where the player is the same.
  assert.deepEqual(fillRows(rows, '재호', '', '지성')[0], { a: '재호', map: '녹아', b: '지성', winner: null, pa: '11' });
});

test('a player\'s game colour follows the side swap, is "#rrggbb" only, and stays with its player', () => {
  assert.deepEqual(['#F40404', 'red', '#fff', '#000000;x', 7].map(gameColor), ['#f40404', '', '', '', '']);
  const rows: SbRow[] = [{ ...row('재호', '녹아', '명운'), ca: '#f40404', cb: '#0c48cc' }];
  assert.deepEqual([scoreboardView(session(rows), '김명운').now!.left.color, scoreboardView(session(rows), '김명운').now!.right.color], ['#0c48cc', '#f40404']);
  const sb = createScoreboard();
  assert.ok(validScoreboard({ ...sb, sets: { ...sb.sets, '1': rows } }));
  assert.equal(validScoreboard({ ...sb, sets: { ...sb.sets, '1': [{ ...rows[0], ca: 'red' }] } }), false);
  assert.deepEqual(fillRows(rows, '병구', '', '명운')[0], { a: '병구', map: '녹아', b: '명운', winner: null, cb: '#0c48cc' });
});
