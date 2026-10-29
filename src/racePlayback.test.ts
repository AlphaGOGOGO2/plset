import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFinishSlowMotion } from './racePlayback';

const frame = { now: 1000, moving: true, finished: false, progress: [990, 988], finish: 1000, arrived: 8, speed: 1.5 };

test('마지막 두 명의 결승 접전만 최대 2.5초, 선택 배속과 관계없이 0.65배속으로 보여준다', () => {
  for (const speed of [1, 1.5, 2, 2.5]) {
    const controller = createFinishSlowMotion();
    const start = controller.update({ ...frame, speed });
    assert.equal(start.slow, true); assert.equal(start.scale * speed, .65);
    assert.equal(controller.update({ ...frame, speed, now: 3499 }).slow, true);
    assert.deepEqual(controller.update({ ...frame, speed, now: 3500 }), { slow: false, scale: 1 });
    assert.equal(controller.update({ ...frame, speed, now: 6000 }).slow, false);
  }
});

test('한 명 통과·격차 벌어짐·취소·완료 시 즉시 슬로모션을 끝낸다', () => {
  for (const change of [{ progress: [990], arrived: 9 }, { progress: [997, 990] }, { moving: false }, { finished: true }]) {
    const controller = createFinishSlowMotion(); controller.update(frame);
    assert.deepEqual(controller.update({ ...frame, ...change, now: 1100 }), { slow: false, scale: 1 });
    assert.equal(controller.update({ ...frame, now: 1200 }).slow, false);
  }
});

test('결승에서 멀거나, 격차가 크거나, 한 명 또는 세 명 이상일 때는 발동하지 않는다', () => {
  for (const progress of [[970, 968], [999, 990], [990], [991, 990, 989]]) {
    assert.equal(createFinishSlowMotion().update({ ...frame, progress }).slow, false);
  }
  const controller = createFinishSlowMotion();
  assert.equal(controller.update({ ...frame, progress: [950, 948] }).slow, false);
  assert.equal(controller.update({ ...frame, now: 3000 }).slow, true);
  assert.equal(createFinishSlowMotion().update(frame).slow, true, 'new race resets the one-shot effect');
});
