import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRace, MARBLE_R, pistonTop, ROAD_HALF, roadGeometry, sampleAt, sampleTrack, STEP, tracks, type Feature } from './race';

async function simulate(count: number, seed: number, track = 0) {
  const items = Array.from({ length: count }, (_, i) => ({ id: `p-${i}`, label: `선수 ${i + 1}` }));
  const race = await createRace(items, seed, track);
  race.start();
  while (race.tick < 180 / STEP && race.results.length < count) race.step();
  const result = { ids: [...race.results], ticks: race.tick, first: race.finishTicks.get(race.results[0]) ?? null };
  race.dispose();
  return result;
}

test('모든 트랙은 낙하 구간 없이 처음부터 끝까지 도로와 벽이 이어진다', () => {
  for (const track of tracks) {
    const samples = sampleTrack(track), geometry = roadGeometry(samples);
    assert.ok(samples[samples.length - 1].s > 250, `${track.title} length ${samples[samples.length - 1].s}`);
    for (let i = 1; i < samples.length; i++) assert.ok(samples[i].p.y <= samples[i - 1].p.y + 1e-9, `${track.title} climbs at sample ${i}`);
    assert.ok(geometry.roadIdx.length > 3000 && geometry.wallIdx.length > 3000, `${track.title} geometry`);
    assert.ok(samples.every(s => !s.gap), `${track.title} has no gaps`);
    assert.equal(geometry.roadIdx.length,(samples.length-1)*6,`${track.title} continuous road`);
    assert.equal(geometry.wallIdx.length,(samples.length-1)*12,`${track.title} continuous walls`);
  }
});

test('같은 시드의 레이스는 같은 결과와 시간을 낸다', async () => {
  const first = await simulate(10, 7, 1);
  await simulate(10, 99, 1);
  assert.deepEqual(await simulate(10, 7, 1), first);
});

for (const track of tracks.keys()) test(`${tracks[track].title}: 2명·10명·30명 레이스는 3분 안에 전원 완주한다`, async () => {
  for (const count of [2, 10, 30]) for (const seed of [1, 42]) {
    const result = await simulate(count, seed, track);
    assert.equal(result.ids.length, count, `track ${track} / ${count} / seed ${seed}: unfinished at ${(result.ticks * STEP).toFixed(0)}s`);
    assert.equal(new Set(result.ids).size, count);
    const firstLimit = track === 5 ? 150 : 90; // Canyon is approximately twice as long.
    assert.ok(result.first !== null && result.first * STEP >= 8 && result.first * STEP <= firstLimit, `track ${track} / ${count} / seed ${seed}: first at ${result.first !== null ? (result.first * STEP).toFixed(1) : '-'}s`);
  }
});

test('협곡은 기존 맵 평균의 약 두 배 길이이며 큰 방향 전환은 세 번이다', () => {
  const original = tracks.slice(0, 5).map(track => sampleTrack(track).at(-1)!.s);
  const canyon = sampleTrack(tracks[5]), ratio = canyon.at(-1)!.s / (original.reduce((a, b) => a + b, 0) / original.length);
  assert.ok(ratio > 1.8 && ratio < 2.2, `length ratio ${ratio}`);
  const directions = tracks[5].points.slice(1).map((point, i) => Math.sign(point[0] - tracks[5].points[i][0])).filter(Boolean);
  assert.equal(directions.slice(1).filter((direction, i) => direction !== directions[i]).length, 3);
  assert.ok(canyon.every((q, i) => !i || q.p.distanceTo(canyon[i - 1].p) < 1.6));
});

test('협곡 스윙 바는 축에서 이탈하지 않고 양쪽에 공보다 넓은 통로를 남긴다', async () => {
  const race = await createRace([{ id: 'probe', label: '스윙 확인' }], 42, 5);
  const arms = race.obstacles.filter(o => o.kind === 'sweeper');
  const features = race.track.features.filter(f => f.kind === 'sweeper');
  assert.equal(arms.length, 6); race.start();
  for (let tick = 0; tick < 6 / STEP; tick++) {
    race.step();
    if (tick % 30) continue;
    for (let i = 0; i < arms.length; i++) {
      const arm = arms[i], feature = features[i], q = sampleAt(race.samples, feature.t);
      const pivot = q.p.clone().addScaledVector(q.side, feature.side * 2.12).addScaledVector(q.up, .55);
      const hinge = arm.body.quaternion.vmult(arm.body.position.clone().set(feature.side * 1.9, 0, 0)).vadd(arm.body.position);
      assert.ok(Math.hypot(hinge.x - pivot.x, hinge.y - pivot.y, hinge.z - pivot.z) < .02, 'hinge drift');
      const tip = arm.body.quaternion.vmult(arm.body.position.clone().set(-feature.side * 1.9, 0, 0)).vadd(arm.body.position);
      const lateral = (tip.x-q.p.x)*q.side.x+(tip.y-q.p.y)*q.side.y+(tip.z-q.p.z)*q.side.z;
      assert.ok(ROAD_HALF + feature.side * lateral - .2 > MARBLE_R * 2 + .3, 'closed passage');
      const hingeLateral = (hinge.x-q.p.x)*q.side.x+(hinge.y-q.p.y)*q.side.y+(hinge.z-q.p.z)*q.side.z;
      assert.ok(ROAD_HALF - Math.abs(hingeLateral) - .38 > MARBLE_R * 2 + .45, 'hinge blocks wall passage');
    }
  }
  race.dispose();
});

test('협곡 스윙 바 6개의 양쪽 벽 통로는 복구 없이 통과한다', async () => {
  for (const seed of [1, 42]) for (const feature of tracks[5].features.filter(f => f.kind === 'sweeper')) for (const side of [-1, 1]) {
    const race = await createRace([{ id: 'probe', label: '벽 통로 확인' }], seed, 5), m = race.marbles[0];
    const q = sampleAt(race.samples, feature.t - .004), target = sampleAt(race.samples, feature.t + .006).s;
    const pos = q.p.clone().addScaledVector(q.side, side * (ROAD_HALF - MARBLE_R - .1)).addScaledVector(q.up, MARBLE_R + .02);
    m.body.position.set(pos.x, pos.y, pos.z); m.body.velocity.set(q.tangent.x * 5, q.tangent.y * 5, q.tangent.z * 5);
    m.x = pos.x; m.y = pos.y; m.z = pos.z; m.sampleIndex = m.safeSampleIndex = race.samples.indexOf(q); m.progress = m.bestProgress = q.s;
    race.start(); let assisted = false;
    while (race.tick < 6 / STEP && m.progress < target) { race.step(); assisted ||= m.stalls > 0 || m.recoveries > 0; }
    assert.ok(m.progress >= target, `seed ${seed} / arm ${feature.t} / wall ${side}: blocked`);
    assert.equal(assisted, false, `seed ${seed} / arm ${feature.t} / wall ${side}: needed rescue`);
    race.dispose();
  }
});

test('승강 기둥은 매 주기 1.8초 이상 바닥 아래에 완전히 머문다', () => {
  for (const period of [4, 4.2, 4.4]) {
    for (let time = 0; time <= 1.8; time += STEP) assert.ok(pistonTop(time, period) < -.15);
    assert.ok(pistonTop(period * .7, period) > 1);
    assert.ok(Math.abs(pistonTop(period - 1e-6, period) - pistonTop(0, period)) < 1e-6);
  }
});

test('모든 맵의 벽 쪽 승강 기둥은 내려가면 공이 복구 없이 지나간다', async () => {
  for (const track of tracks.keys()) for (const seed of [1, 42]) for (const feature of tracks[track].features.filter((f): f is Extract<Feature, {kind:'piston'}> => f.kind === 'piston' && f.lane === undefined)) {
    const race = await createRace([{ id: 'probe', label: '승강 통로 확인' }], seed, track), m = race.marbles[0];
    const q = sampleAt(race.samples, feature.t - .002), target = sampleAt(race.samples, feature.t + .004).s;
    const pos = q.p.clone().addScaledVector(q.side, feature.side * (ROAD_HALF - MARBLE_R - .1)).addScaledVector(q.up, MARBLE_R + .02);
    m.body.position.set(pos.x, pos.y, pos.z); m.body.velocity.set(q.tangent.x * 5, q.tangent.y * 5, q.tangent.z * 5);
    m.x = pos.x; m.y = pos.y; m.z = pos.z; m.sampleIndex = m.safeSampleIndex = race.samples.indexOf(q); m.progress = m.bestProgress = q.s;
    race.start(); let assisted = false;
    while (race.tick < 8 / STEP && m.progress < target) { race.step(); assisted ||= m.stalls > 0 || m.recoveries > 0; }
    assert.ok(m.progress >= target, `${race.track.title} / seed ${seed} / pillar ${feature.t}: blocked`);
    assert.equal(assisted, false, `${race.track.title} / seed ${seed} / pillar ${feature.t}: needed rescue`);
    race.dispose();
  }
});

test('모든 맵 결승 7~14m 앞에 엇갈린 승강 기둥 두 개가 있다', () => {
  for (const track of tracks) {
    const samples = sampleTrack(track), finish = samples.at(-1)!.s - 24;
    const finalPillars = track.features.filter((f): f is Extract<Feature, {kind:'piston'}> => f.kind === 'piston' && f.lane !== undefined);
    assert.equal(finalPillars.length, 2, track.title);
    for (const feature of finalPillars) {
      const remaining = finish - sampleAt(samples, feature.t).s;
      assert.ok(remaining >= 6 && remaining <= 15, `${track.title}: ${remaining}m`);
    }
  }
});

test('정글 마지막 핀 양옆은 복구 없이 공이 통과한다', async () => {
  for (const seed of [1, 7, 42, 99]) for (const side of [-1, 1]) {
    const race = await createRace([{ id: 'probe', label: '통과 확인' }], seed, 0);
    const t = .7 + (side === 1 ? .012 : 0), q = sampleAt(race.samples, t - .004);
    const target = sampleAt(race.samples, t + .004).s, m = race.marbles[0];
    const pos = q.p.clone().addScaledVector(q.side, side * (ROAD_HALF - MARBLE_R - .05)).addScaledVector(q.up, MARBLE_R + .02);
    m.body.position.set(pos.x, pos.y, pos.z); m.body.velocity.set(q.tangent.x * 5, q.tangent.y * 5, q.tangent.z * 5);
    m.x = pos.x; m.y = pos.y; m.z = pos.z; m.sampleIndex = m.safeSampleIndex = race.samples.indexOf(q); m.progress = m.bestProgress = q.s;
    race.start();
    while (race.tick < 4 / STEP && m.progress < target) race.step();
    assert.ok(m.progress >= target, `seed ${seed} / side ${side}: blocked`);
    assert.equal(m.recoveries, 0);
    race.dispose();
  }
});

test('모든 맵의 핀은 랜덤 배치 후에도 벽과 공 한 개 이상의 여유를 둔다', async () => {
  for (const track of tracks.keys()) for (const seed of [1, 7, 42, 99]) {
    const race = await createRace([], seed, track);
    const pegs = race.obstacles.filter(o => o.kind === 'peg'); let peg = 0;
    for (const feature of race.track.features) if (feature.kind === 'pegs') for (let i = 0; i < feature.count; i++) {
      const q = sampleAt(race.samples, feature.t + (i % 3) * .006), o = pegs[peg++];
      const lateral = Math.abs((o.body.position.x - q.p.x) * q.side.x + (o.body.position.y - q.p.y) * q.side.y + (o.body.position.z - q.p.z) * q.side.z);
      assert.ok(ROAD_HALF - lateral - o.size[0] >= MARBLE_R * 2 + .29, `${race.track.title} / seed ${seed} / peg ${i}`);
    }
    race.dispose();
  }
});

test('스위치 게이트 양쪽에서 눌린 공은 순간이동 없이 열린 틈으로 빠져나간다', async () => {
  // Include both originally reproduced directions and all 192 jungle cases.
  for (const track of tracks.keys()) for (const seed of (track === 0 ? [...Array.from({ length: 30 }, (_, i) => i + 1), 42, 99] : [6, 42])) {
    for (const feature of tracks[track].features.filter(f => f.kind === 'gate')) for (const side of [-1, 1]) {
      const race = await createRace([{ id: 'probe', label: '게이트 통과 확인' }], seed, track), m = race.marbles[0];
      const gateSample = sampleAt(race.samples, feature.t), q = race.samples.filter(s => s.s < gateSample.s - 1.5).at(-1)!;
      const target = gateSample.s + 3;
      const pos = q.p.clone().addScaledVector(q.side, side * (ROAD_HALF - MARBLE_R - .05)).addScaledVector(q.up, MARBLE_R + .02);
      m.body.position.set(pos.x, pos.y, pos.z); m.body.velocity.set(q.tangent.x * 5, q.tangent.y * 5, q.tangent.z * 5);
      m.x = m.px = pos.x; m.y = m.py = pos.y; m.z = m.pz = pos.z;
      m.sampleIndex = m.safeSampleIndex = race.samples.indexOf(q); m.progress = m.bestProgress = q.s;
      const context = `${race.track.title} / seed ${seed} / gate ${feature.t} / side ${side}`;
      const gateIndex = tracks[track].features.filter(f => f.kind === 'gate').indexOf(feature);
      const gateBody = race.obstacles.filter(o => o.kind === 'gate')[gateIndex].body;
      race.start();
      while (race.tick < 12 / STEP && m.progress < target) {
        const before = m.body.position.clone(), gateBefore = gateBody.position.clone();
        race.step();
        assert.equal(m.recoveries, 0, `${context}: respawn`);
        if (Math.abs(m.progress - sampleAt(race.samples, feature.t).s) < 2) assert.equal(m.stalls, 0, `${context}: artificial nudge at gate`);
        assert.ok(m.body.position.distanceTo(before) < .5, `${context}: discontinuous movement`);
        assert.ok(gateBody.position.distanceTo(gateBefore) <= 2.2 * 2 * Math.PI / feature.period * STEP + 1e-6, `${context}: gate jumped after releasing marble`);
      }
      assert.ok(m.progress >= target, `${context}: did not leave the gate`);
      race.dispose();
    }
  }
});

test('게이트 앞 대기는 정체 복구를 발동하지 않지만 실제 추락은 복구한다', async () => {
  for (const side of [-1, 1]) {
    const race = await createRace([{ id: 'probe', label: '게이트 대기 확인' }], 42, 0), m = race.marbles[0];
    const q = sampleAt(race.samples, .45 - .002), pos = q.p.clone().addScaledVector(q.side, side * 3.4).addScaledVector(q.up, MARBLE_R + .02);
    m.body.position.set(pos.x, pos.y, pos.z); m.x = pos.x; m.y = pos.y; m.z = pos.z;
    m.sampleIndex = m.safeSampleIndex = race.samples.indexOf(q); m.progress = q.s;
    m.bestProgress = 1e6; m.stall = 479; m.stalls = 1;
    race.start(); race.step();
    assert.equal(m.recoveries, 0); assert.equal(m.stall, 0); assert.equal(m.stalls, 0);
    const below = q.p.clone().addScaledVector(q.up, -8);
    m.body.position.set(below.x, below.y, below.z);
    race.step(); assert.equal(m.recoveries, 1, 'a real fall still needs recovery');
    race.dispose();
  }
});

test('모든 맵의 이탈·반복 걸림 복구는 앞으로 건너뛰지 않고 다시 굴러간다', async () => {
  for (const track of tracks.keys()) for (const mode of ['left', 'right', 'below', 'stall']) {
    const race = await createRace([{ id: 'probe', label: '복구 확인' }], 42, track), m = race.marbles[0];
    const q = sampleAt(race.samples, .24), pos = q.p.clone().addScaledVector(q.up, MARBLE_R + .02);
    m.body.position.set(pos.x, pos.y, pos.z); m.x = pos.x; m.y = pos.y; m.z = pos.z;
    m.sampleIndex = m.safeSampleIndex = race.samples.indexOf(q); m.progress = m.bestProgress = q.s;
    race.start(); race.step();
    const checkpoint = m.safeSampleIndex, before = race.samples[checkpoint].s;
    if (mode === 'stall') { m.stall = 479; m.stalls = 1; m.bestProgress = 1e6; }
    else {
      const airborne = race.samples[checkpoint + 20];
      const escaped = airborne.p.clone().addScaledVector(airborne.side, mode === 'left' ? -8 : mode === 'right' ? 8 : 0).addScaledVector(airborne.up, mode === 'below' ? -8 : 2);
      m.body.position.set(escaped.x, escaped.y, escaped.z);
    }
    race.step();
    assert.equal(m.recoveries, 1, `${race.track.title} / ${mode}: no recovery`);
    assert.ok(m.progress <= before + .01, `${race.track.title} / ${mode}: skipped forward`);
    assert.ok(before - m.progress < 8, `${race.track.title} / ${mode}: recovery too far back`);
    assert.equal(m.x, m.px); assert.equal(m.y, m.py); assert.equal(m.z, m.pz);
    const recovered = m.progress;
    for (let i = 0; i < 4 / STEP; i++) race.step();
    assert.ok(m.progress > recovered + 2, `${race.track.title} / ${mode}: did not resume rolling`);
    race.dispose();
  }
});
