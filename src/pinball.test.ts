import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { createPinball, configurePinballBinary, currentCourse, replayCourse, COURSE_ORDER } from './pinball';
import { courses, ROTOR_TUNING } from './courses';
import { Camera, cameraFocus, finishIntensity, INITIAL_ZOOM, RankTracker, timeScale, VIEW_H, VIEW_W, zoneIntensity } from './pinballCamera';
import { createSession, validateSession } from './domain';

const require = createRequire(import.meta.url);
configurePinballBinary(readFileSync(require.resolve('box2d-wasm/dist/umd/Box2D.simd.wasm')));

async function simulate(count: number, seed: number, map = 0) {
  const items = Array.from({ length: count }, (_, i) => ({ id: `p-${i}`, label: `선수 ${i + 1}` }));
  const race = await createPinball(items, seed, map);
  while (race.tick < 60000 && race.results.length < count) race.step();
  const result = { ids: [...race.results], ticks: race.tick };
  race.dispose();
  return result;
}

test('같은 시드의 물리 추첨은 다른 시뮬레이션 실행 후에도 동일한 도착 순서와 시간을 갖는다', async () => {
  const first = await simulate(10, 42);
  await simulate(10, 725);
  assert.deepEqual(await simulate(10, 42), first);
});

test('1명·3명·10명·15명·25명·60명 추첨은 모든 선수가 결승선을 통과하고 중복 없이 완료된다', async () => {
  for (const map of courses.keys()) for (const count of [1, 3, 10, 15, 25, 60]) for (const seed of [1, 42, 98765]) {
    const result = await simulate(count, seed, map);
    assert.equal(result.ids.length, count, `map ${map} / ${count} entrants / seed ${seed}: unfinished at ${result.ticks}`);
    assert.equal(new Set(result.ids).size, count);
  }
});

test('재설계 코스는 짧고 장애물이 적으며 결승 구역을 가진다', () => {
  for (const course of courses) {
    assert.ok(course.goalY >= 110 && course.goalY <= 130, `${course.title} goalY ${course.goalY}`);
    assert.ok(course.entities.length <= 50, `${course.title} entities ${course.entities.length}`);
    if (!course.physicsVersion) assert.ok(course.entities.every(e => !e.motion && !(e.kick && e.kick > 0)), `${course.title} has kick/motion`);
    assert.deepEqual(course.zoomZones, [{ x: 13, y: course.goalY - 4, w: 24, h: 10 }]);
  }
});

test('10명 추첨은 모든 코스에서 60초(6000틱) 안에 끝난다', async () => {
  for (const map of courses.keys()) for (const seed of [1, 42, 98765]) {
    const result = await simulate(10, seed, map);
    assert.equal(result.ids.length, 10);
    assert.ok(result.ticks <= 6000, `map ${map} seed ${seed}: ${result.ticks} ticks`);
  }
});

test('결승 구역 강도와 시간배율', () => {
  const zones = [{ x: 13, y: 110, w: 8, h: 10 }];
  assert.equal(zoneIntensity(zones, 13, 110), 1);
  assert.equal(zoneIntensity(zones, 13, 105), 0);
  assert.ok(Math.abs(zoneIntensity(zones, 15, 110) - .5) < 1e-9);
  assert.equal(timeScale(0, true), 1);
  assert.equal(timeScale(.5, false), 1);
  assert.equal(timeScale(.5, true), .5);
  assert.equal(timeScale(1, true), .2);
});

test('순위는 0.25유닛 이상 앞서야 바뀐다', () => {
  const tracker = new RankTracker();
  const dist = (_x: number, y: number) => 100 - y;
  assert.deepEqual(tracker.update([{ id: 'a', x: 0, y: 10 }, { id: 'b', x: 0, y: 5 }], dist, 1), ['a', 'b']);
  for (let i = 0; i < 50; i++) tracker.update([{ id: 'a', x: 0, y: 10 }, { id: 'b', x: 0, y: 10.1 }], dist, .1);
  assert.deepEqual(tracker.update([{ id: 'a', x: 0, y: 10 }, { id: 'b', x: 0, y: 10.1 }], dist, .1), ['a', 'b']);
  for (let i = 0; i < 50; i++) tracker.update([{ id: 'a', x: 0, y: 10 }, { id: 'b', x: 0, y: 11 }], dist, .1);
  assert.deepEqual(tracker.update([{ id: 'a', x: 0, y: 10 }, { id: 'b', x: 0, y: 11 }], dist, .1), ['b', 'a']);
});

test('카메라는 대상을 따라가고 결승 구역에서 줌인한다', () => {
  const camera = new Camera(); camera.reset({ x: 13, y: 2 }, 2);
  const viewSize = { x: VIEW_W / INITIAL_ZOOM, y: VIEW_H / INITIAL_ZOOM };
  for (let i = 0; i < 200; i++) camera.update({ target: { id: 'a', x: 13, y: 50 }, intensity: 0, focusOnRival: false, zones: [], viewSize });
  assert.ok(Math.abs(camera.position.y - 50) < .5, `y ${camera.position.y}`); assert.ok(Math.abs(camera.zoom - 1) < .05, `zoom ${camera.zoom}`);
  for (let i = 0; i < 200; i++) camera.update({ target: { id: 'a', x: 13, y: 110 }, rival: { id: 'b', x: 13, y: 109 }, intensity: 1, focusOnRival: false, zones: [], viewSize });
  assert.ok(camera.zoom > 3.5, `zoom ${camera.zoom}`);
});

test('기존 DrawRun map 0..4는 수정 전 모든 틱의 궤적·도착순·완료시간을 유지한다', async () => {
  // Captured before the revision, SIMD wasm, 10 entrants, seed 42. Hash every x/y at every tick.
  const golden = [
    [2961, '1,8,2,3,4,7,9,0,5,6', 'ffc4dda5c75e35d7e6805d00155493f9aeddc20dea97d94e5d5b60a5a0267e76'],
    [2549, '8,2,1,5,6,7,0,4,3,9', '86b9466af5dd82f413566b876a86eb0a8003e6726a29d707223c114d0665a802'],
    [2535, '3,8,4,0,7,1,2,6,9,5', 'acf6b46553bc1ad47305db2caaedd66afe624a5ea31340d0b10c03a5f97a76b7'],
    [3046, '8,0,4,7,6,3,2,9,5,1', 'fa3cbfe47a5f19bcf33cc4e59ed39236cf29c342f17718b2e791f600f9947bc4'],
    [1401, '3,2,1,4,8,7,0,5,6,9', '87b97b13f606207b8bb150bc469e7ce8dd167533455f5ea72171a494982d4064'],
  ];
  for (let map = 0; map < 5; map++) {
    const race = await createPinball(Array.from({ length: 10 }, (_, i) => ({ id: `p-${i}`, label: `선수 ${i + 1}` })), 42, map);
    try {
      const hash = createHash('sha256');
      while (race.tick < 6000 && race.results.length < 10) { race.step(); hash.update(JSON.stringify(race.marbles.map(m => [m.x, m.y]))); }
      assert.deepEqual([race.tick, race.results.map(id => id.slice(2)).join(','), hash.digest('hex')], golden[map], `legacy map ${map}`);
    } finally { race.dispose(); }
  }
});

test('신규 코스 ID만 선택하고 구형/신형 DrawRun은 같은 JSON 형식으로 왕복한다', () => {
  assert.deepEqual(COURSE_ORDER, [14, 10, 11, 12, 13]);
  assert.equal(replayCourse(undefined), 4);
  assert.equal(currentCourse(undefined), 14);
  for (let map = 0; map < 15; map++) {
    assert.equal(currentCourse(map), map < 10 ? 10 + map % 5 : map);
    assert.equal(replayCourse(map), map);
    const session = createSession();
    session.draw = { mode: 'pinball', map, seed: 42, startedAt: 1, rank: 1, items: [{ id: 'a', label: 'A' }], results: [], finishedAt: null };
    const json = JSON.parse(JSON.stringify(session)); validateSession(json);
    assert.deepEqual(json.draw, session.draw);
  }
  const session = createSession();
  session.draw = { mode: 'pinball', map: 15, seed: 42, startedAt: 1, rank: 1, items: [{ id: 'a', label: 'A' }], results: [], finishedAt: null };
  assert.throws(() => validateSession(session), /코스/);
});

test('개선판 벽 fixture는 선언된 탄성을 적용하고 구형 물리는 그대로 유지한다', async () => {
  for (const map of [0, 5]) {
    const race = await createPinball([{ id: 'a', label: 'A' }], 42, map);
    try {
      race.entities.forEach((e, i) => {
        if (e.shape.type === 'polyline') assert.ok(Math.abs(e.body.GetFixtureList().GetRestitution() - (map === 0 ? 0 : race.stage.entities[i].props.restitution)) < 1e-6);
      });
      assert.equal(race.marbles[0].body.GetFixtureList().GetRestitution(), 0);
      const gate = race.entities.find(e => e.arm > 0)!;
      assert.equal(gate.shape.type, 'box');
      // The finish sweeper keeps its full reach and turns counter-clockwise (negative), like the reference wheel.
      if (map === 5 && gate.shape.type === 'box') { assert.equal(gate.arm, 1.1); assert.ok(gate.body.GetAngularVelocity() < 0); }
    } finally { race.dispose(); }
  }
});

const viewSize = { x: VIEW_W / INITIAL_ZOOM, y: VIEW_H / INITIAL_ZOOM };
test('마블룰렛처럼 일반 주행은 1배 시야를 유지하고 멀어진 두 구슬은 함께 담는다', () => {
  const camera = new Camera(), target = { id: 'a', x: 10, y: 40 };
  for (const [gap, expected] of [[2, 1], [16, .75], [50, 1]]) {
    camera.reset(target, 1);
    const rival = { id: 'b', x: 12, y: 40 + gap };
    for (let i = 0; i < 200; i++) camera.update({ target, rival, intensity: 0, focusOnRival: false, zones: [], viewSize });
    assert.ok(Math.abs(camera.zoom - expected) < .02, `gap ${gap}: ${camera.zoom}`);
    if (gap < 50) for (const p of [target, rival]) assert.ok(Math.abs(p.y - camera.position.y) * camera.zoom < viewSize.y / 2);
    else assert.ok(Math.abs(camera.position.y - target.y) < .02);
  }
});

test('마지막 당첨은 선두를 보여도 당첨 커트라인 기준으로 줌을 걸고 도착 후 시점을 넘긴다', () => {
  const active = [{ id: 'leader', x: 13, y: 117 }, { id: 'rival', x: 13, y: 116 }, { id: 'last', x: 13, y: 70 }];
  assert.equal(cameraFocus(active, 2, 0, 118).intensity, .6);
  assert.equal(cameraFocus(active, 2, 0, 118).target.id, 'leader');
  assert.equal(cameraFocus(active, 2, 0, 118).focusOnRival, false);
  assert.equal(cameraFocus([active[0],{...active[1],y:100},active[2]],2,0,118).intensity,0);
  assert.equal(cameraFocus(active, 2, 1, 118).target.id, 'last');
  assert.equal(cameraFocus(active, 2, 1, 118).focusOnRival, true);
  assert.equal(finishIntensity(118, 113), 0);
  assert.equal(finishIntensity(118, 118), 1);
});

test('결승 확대는 기준 사이트의 max(일반 시야, 강도 × 4)를 따른다', () => {
  const target={id:'a',x:13,y:110},rival={id:'b',x:13,y:109};
  for(const [intensity,zoom] of [[0,1],[.2,1],[.4,1.6],[.75,3],[1,4]]){
    const camera=new Camera();camera.reset(target,1);
    for(let i=0;i<180;i++)camera.update({target,rival,intensity,focusOnRival:false,zones:[],viewSize});
    assert.ok(Math.abs(camera.zoom-zoom)<.001,`${intensity}: ${camera.zoom}`);
  }
});

test('36유닛/초 급강하에서도 확대된 카메라의 추적 대상이 화면 밖으로 사라지지 않는다', () => {
  const camera = new Camera(); camera.reset({ x: 13, y: 10 }, 2.2);
  for (let i = 0; i < 180; i++) {
    const target = { id: 'a', x: 13, y: 10 + i * .6 }, rival = { id: 'b', x: 13, y: target.y - 1 };
    camera.update({ target, rival, intensity: 0, focusOnRival: false, zones: [], viewSize });
    assert.ok(Math.abs(target.y - camera.position.y) <= viewSize.y / (2 * camera.zoom) - .99);
  }
});

test('코스별 전경 구역은 연결되며 30/60/120Hz에서 같은 시간에 같은 배율로 전환한다', () => {
  for (const course of courses.slice(5)) assert.ok(course.cameraZones!.length >= 2);
  const zooms: number[] = [];
  for (const fps of [30, 60, 120]) {
    const camera = new Camera(); camera.reset({ x: 13, y: 40 }, 2.2);
    const zone = { x: 13, y: 40, w: 20, h: 20 };
    for (let i = 0; i < fps * 2; i++) camera.update({ target: { id: 'a', x: 13, y: 40 }, intensity: 0, focusOnRival: false, zones: [zone], viewSize, dt: 1000 / fps });
    zooms.push(camera.zoom); assert.ok(Math.abs(camera.zoom - .75) < .03);
  }
  assert.ok(Math.max(...zooms) - Math.min(...zooms) < .02);
});

test('순위가 잠깐 뒤집힐 때 기존 카메라 대상의 현재 좌표를 갱신한다', () => {
  const camera = new Camera(); camera.reset({ x: 13, y: 40 }, 1.35);
  const a = { id: 'a', x: 13, y: 40 }, b = { id: 'b', x: 13, y: 41 }, c = { id: 'c', x: 13, y: 42 };
  camera.update({ target: a, rival: b, intensity: 0, focusOnRival: false, zones: [], viewSize, marbles: [a, b, c] });
  const liveA = { ...a, y: 45 }, liveB = { ...b, y: 46 };
  for (let i = 0; i < 10; i++) camera.update({ target: c, rival: liveB, intensity: 0, focusOnRival: false, zones: [], viewSize, marbles: [liveA, liveB, c] });
  assert.ok(camera.position.y > 43, `held pair must keep moving: ${camera.position.y}`);
});

test('미니맵 탐색 후 자동 추적은 순간이동 없이 복귀한다', () => {
  const camera=new Camera(),target={id:'a',x:13,y:20},params={target,intensity:0,focusOnRival:false,zones:[],viewSize};
  camera.reset(target,2);
  for(let i=0;i<120;i++)camera.inspect({x:6,y:110});
  assert.ok(Math.abs(camera.position.y-110)<.1);assert.equal(camera.zoom,2);
  camera.update(params);assert.ok(camera.position.y>100,'first automatic frame must not jump to the marble');
  for(let i=0;i<150;i++)camera.update(params);
  assert.ok(Math.abs(camera.position.y-target.y)<.1);
});

test('신규 결승 회전바는 25% 길이·5.24초 회전 주기와 구슬보다 넓은 출구를 가진다', async () => {
  for(const map of COURSE_ORDER){
    const race=await createPinball([{id:'a',label:'A'}],42,map);
    try{
      const gate=race.entities.find(e=>e.rotating&&e.arm===0&&Math.abs(e.body.GetPosition().get_y()-race.stage.zoomY)<.01)!;
      assert.ok(gate);assert.equal(gate.shape.type,'box');
      if(gate.shape.type==='box')assert.equal(gate.shape.width*2/ROTOR_TUNING.finishMouth,.25);
      assert.ok(ROTOR_TUNING.exitWidth>.5);
      const start=gate.body.GetAngle();for(let i=0;i<524;i++)race.step();
      assert.ok(Math.abs((gate.body.GetAngle()-start)+Math.PI*2)<.01,`map ${map} revolution`);
    }finally{race.dispose();}
  }
});

test('실제 마블룰렛에서 캡처한 600프레임의 이동·줌·대상 전환과 일치한다', () => {
  type Frame={balls:{id:string;x:number;y:number}[];intensity:number;focusOnRival:boolean;expected:{x:number;y:number;zoom:number}};
  const fixture=JSON.parse(readFileSync(new URL('../research/pinball-camera-reference-frames.json',import.meta.url),'utf8').replace(/^\uFEFF/,'')) as {viewSize:{x:number;y:number};scenarios:{name:string;initial:{x:number;y:number};zoom:number;zones:{x:number;y:number;w:number;h:number}[];frames:Frame[]}[]};
  for(const scenario of fixture.scenarios){
    const camera=new Camera();camera.reset(scenario.initial,scenario.zoom);
    for(const [i,f] of scenario.frames.entries()){
      camera.update({target:f.balls[0],rival:f.balls[1],marbles:f.balls,intensity:f.intensity,focusOnRival:f.focusOnRival,zones:scenario.zones,viewSize:fixture.viewSize,dt:1000/60});
      for(const [key,actual] of Object.entries({x:camera.position.x,y:camera.position.y,zoom:camera.zoom}))assert.ok(Math.abs(actual-f.expected[key as keyof typeof f.expected])<1e-8,`${scenario.name} frame ${i} ${key}: ${actual} vs ${f.expected[key as keyof typeof f.expected]}`);
    }
  }
});
