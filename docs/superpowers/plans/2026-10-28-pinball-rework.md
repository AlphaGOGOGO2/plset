# 핀볼 개편 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 핀볼을 마블룰렛처럼 넓은 화면·선두 추적 카메라·결승 구역 한정 슬로모션으로 바꾸고, 코스 5개를 장애물이 적은 낙하형으로 재설계하며, 설정을 코스 위 떠 있는 패널로 옮겨 한 화면에 담는다.

**Architecture:** 코스 데이터(`src/courses.ts`)와 물리(`src/pinball.ts`)는 순수 모듈이라 `node:test`로 완주·시간을 검증한다. 카메라·순위·시간배율 규칙은 새 순수 모듈 `src/pinballCamera.ts`로 빼서 테스트하고, `src/PinballStage.tsx`는 그 결과를 1600×900 캔버스에 그린다. 설정 패널은 `src/App.tsx`의 `DrawPage` 핀볼 분기와 `src/studio-refinement.css`에서 레이아웃만 바꾼다.

**Tech Stack:** React 18 + TypeScript, Vite, Electron, box2d-wasm, `node:test`(`npm test`는 `tsx --test`), Playwright MCP(실행 확인).

## Global Constraints

- 세션 저장 포맷(`DrawRun`, `validateSession`)과 맵 추첨·ACE 규칙은 바꾸지 않는다.
- 코스 인덱스 순서(시즈 브레이커 0, 뮤탈리스크 런 1, 아이어의 관문 2, 차 행성 강하 3, 나이더스 커널 4)와 `DEFAULT_COURSE`(나이더스 커널)는 유지한다.
- 코스당 엔티티 50개 이하, `goalY` 110~120, 모든 코스에 `zoomZones` 1개(x 13, y goalY-4, w 8, h 10).
- 범퍼 `kick`은 0. `motion`(진동 플리퍼)은 쓰지 않는다. `kick`/`motion` 처리 코드는 저장된 추첨 재생을 위해 `pinball.ts`에 남긴다.
- 결승 게이트는 한쪽 팔 스위퍼다: 회전축이 깔때기 왼쪽 벽 바깥 (11.5, goal-5)에 있고 팔 길이 2.4가 축에서 오른쪽으로만 뻗어 입구(12.5~13.5)를 쓸고 지나간다. 이를 위해 `CourseEntity`에 `arm?: number`(막대 중심을 축에서 x방향으로 밀어두는 거리)를 추가하고 `pinball.ts`의 `SetAsBox` 중심 인자와 렌더러 `translate`에 반영한다.
- 캔버스 논리 크기 1600×900, `initialZoom` 30px/유닛. 미니맵 4px/유닛, 폭 26유닛.
- 문구: 설정 패널 토글 버튼 `설정`, 수량 토글 `수량`, 순위 머리글 `도착 순위`.
- git 저장소가 아니므로 커밋 단계는 없다. 각 태스크 끝에 `npm test`와 `npm run build`가 통과해야 한다.
- 이 세션은 사용자의 Electron 창과 세션 상태를 공유한다. 브라우저 확인 중 추첨을 시작하면 사용자 세션에 기록되므로 확인은 사용자에게 알린 뒤 한다.

---

### Task 1: 코스 재설계와 완주 시간 테스트

**Files:**
- Modify: `src/courses.ts` (전체 재작성)
- Modify: `src/pinball.ts` (`arm` 오프셋: `vector.Set(entity.arm ?? 0, 0); shape.SetAsBox(s.width, s.height, vector, s.rotation)`; 반환 엔티티에 `arm` 포함)
- Modify: `src/PinballStage.tsx` `course()` 박스 그리기: `ctx.rotate(s.rotation); ctx.translate(e.arm ?? 0, 0); ctx.rect(...)`
- Test: `src/pinball.test.ts`

**Interfaces:**
- Consumes: `MapEntity`, `StageDef`(`zoomZones?`) from `src/vendor/marble-course`.
- Produces: `courses: Course[]` 동일 타입. 각 `Course`에 `zoomZones: [{x:13,y:goalY-4,w:8,h:10}]` 추가. `Course` 타입에 `zoomZones` 필수 필드 추가.

- [x] **Step 1: 실패하는 테스트 추가**

`src/pinball.test.ts` 끝에 추가:

```ts
import { courses } from './courses';

test('재설계 코스는 짧고 장애물이 적으며 결승 구역을 가진다', () => {
  for (const course of courses) {
    assert.ok(course.goalY >= 110 && course.goalY <= 120, `${course.title} goalY ${course.goalY}`);
    assert.ok(course.entities.length <= 50, `${course.title} entities ${course.entities.length}`);
    assert.ok(course.entities.every(e => !e.motion && !(e.kick && e.kick > 0)), `${course.title} has kick/motion`);
    assert.deepEqual(course.zoomZones, [{ x: 13, y: course.goalY - 4, w: 8, h: 10 }]);
  }
});

test('10명 추첨은 모든 코스에서 60초(6000틱) 안에 끝난다', async () => {
  for (const map of [0, 1, 2, 3, 4]) for (const seed of [1, 42, 98765]) {
    const result = await simulate(10, seed, map);
    assert.equal(result.ids.length, 10);
    assert.ok(result.ticks <= 6000, `map ${map} seed ${seed}: ${result.ticks} ticks`);
  }
});
```

- [x] **Step 2: 실패 확인**

Run: `npm test`
Expected: 두 테스트 FAIL (goalY 150~176, 엔티티 80개 이상, zoomZones 없음, 틱 초과).

- [x] **Step 3: `src/courses.ts` 재작성**

헬퍼는 유지하되 `bumper`는 `kick: 0`, `flipper`는 삭제, `nest/slalom/split/endurance`는 삭제. 새 헬퍼:

```ts
// 얇은 갈매기형 분산판 두 줄(마블룰렛 Wheel of fortune 66~69 구간 방식)
const chevrons = (y: number, color: string): CourseEntity[] => [
  ...[9.4, 11.3, 13.2, 15.1, 17, 18.9, 20.7].map(x => bar(x, y, .6, Math.PI / 4, 0, color)),
  ...[9.4, 11.3, 13.2, 15.1, 17, 18.9, 20.7].map(x => bar(x, y + 2.5, .6, -Math.PI / 4, 0, color)),
];
// 파친코 핀 격자: 0.25 마름모 3줄(5·4·5개)
const pegs = (y: number, color: string): CourseEntity[] => [
  ...[9.5, 12.75, 16, 19.25, 22.5].map(x => crystal(x, y, .25, color)),
  ...[11, 14.25, 17.5, 20.75].map(x => crystal(x, y + 3, .25, color)),
  ...[9.5, 12.75, 16, 19.25, 22.5].map(x => crystal(x, y + 6, .25, color)),
];
// 회전 막대 한 줄(폭 2, 각속도 ±3.5 교대)
const spinners = (y: number, color: string): CourseEntity[] => [8, 12, 16, 20, 24].map((x, i) => bar(x, y, 2, 0, i % 2 ? -3.5 : 3.5, color));
// 결승 게이트: 벽 바깥 축에 한쪽 팔(길이 2.4)만 달린 스위퍼. 마블룰렛의 축이 벽에 박힌 막대와 같은 움직임
const gate = (goal: number, color: string): CourseEntity => ({ ...bar(11.5, goal - 5, 1.2, 0, -1.2, color), arm: 1.2, props: { density: 1, restitution: 0, angularVelocity: -1.2 } });
// 깔때기: 폭 1.0 통로
const funnel = (goal: number): CourseEntity[] => [line([[1, goal - 14], [12.5, goal - 5], [12.5, goal + 4]]), line([[25, goal - 14], [13.5, goal - 5], [13.5, goal + 4]])];
```

`shell`은 깔때기를 `funnel`로 대체하고 끝 벽을 goal-14까지만 그린다:

```ts
function shell(goal: number, left: [number, number][], right: [number, number][]) {
  return [line([[9, -30], [9, 5], ...left, [1, goal - 14]]), line([[17, -30], [17, 5], ...right, [25, goal - 14]])];
}
const zone = (goal: number) => [{ x: 13, y: goal - 4, w: 8, h: 10 }];
```

코스 다섯 개(각 50개 이하, 수치는 아래 그대로):

```ts
export const courses: Course[] = [
  { title: '시즈 브레이커', goalY: 116, zoomY: 112, accent: siege, zoomZones: zone(116),
    sectorLabels: [{ y: 14, text: '01 / SIEGE LINE' }, { y: 52, text: '02 / CROSS FIRE' }, { y: 92, text: '03 / LAST BUNKER' }],
    entities: [
      ...shell(116, [[2, 14], [2, 30], [9, 38], [2, 46], [2, 70], [1, 90]], [[24, 14], [24, 30], [17, 38], [24, 46], [24, 70], [25, 90]]),
      ...chevrons(52, siege), ...spinners(62, siege),
      bar(13, 80, 5, .3, -1.6, siege),
      ...pegs(92, siege), ...funnel(116), gate(116, siege),
    ] },
  { title: '뮤탈리스크 런', goalY: 118, zoomY: 114, accent: swarm, zoomZones: zone(118),
    sectorLabels: [{ y: 12, text: '01 / FLOCK' }, { y: 46, text: '02 / RICOCHET' }, { y: 90, text: '03 / SWARM' }],
    entities: [
      ...shell(118, [[3, 13], [1, 24], [4, 36], [1, 49], [4, 70], [1, 92]], [[25, 13], [22, 24], [25, 36], [22, 49], [25, 70], [25, 92]]),
      ...curvedLane(5, 24, 1, swarm), ...curvedLane(21, 44, -1, swarm),
      ...[6, 10, 14, 18, 22].map((x, i) => orb(x, 72 + i % 2 * 2, .65, swarm, true)), orb(8, 78, .65, swarm, true), orb(18, 78, .65, swarm, true),
      ...pegs(94, swarm), ...funnel(118), gate(118, swarm),
    ] },
  { title: '아이어의 관문', goalY: 114, zoomY: 110, accent: aiur, zoomZones: zone(114),
    sectorLabels: [{ y: 13, text: '01 / PYLON ARRAY' }, { y: 44, text: '02 / WARP GATE' }, { y: 88, text: '03 / RECALL' }],
    entities: [
      ...shell(114, [[1, 14], [1, 27], [4, 34], [1, 42], [1, 68], [1, 88]], [[25, 14], [25, 27], [22, 34], [25, 42], [25, 68], [25, 88]]),
      crystal(8, 40, 1.8, aiur), crystal(18, 52, 1.8, aiur),
      line([[8, 43], [8, 50]]), line([[18, 55], [18, 62]]),
      bar(13, 74, 4.5, 0, 1.2, aiur),
      ...pegs(90, aiur), ...funnel(114), gate(114, aiur),
    ] },
  { title: '차 행성 강하', goalY: 120, zoomY: 116, accent: char, zoomZones: zone(120),
    sectorLabels: [{ y: 12, text: '01 / ORBITAL DROP' }, { y: 56, text: '02 / MAGMA RIFT' }, { y: 96, text: '03 / EXTRACTION' }],
    entities: [
      ...shell(120, [[2, 14], [5, 25], [2, 60], [5, 70], [2, 94]], [[24, 14], [21, 25], [24, 60], [21, 70], [24, 94]]),
      ...[6, 10, 14, 18, 22].map((x, i) => orb(x, 62 + i % 2 * 2, .8, char, true)),
      ...[8, 12, 16, 20].map((x, i) => orb(x, 70 + i % 2 * 2, .8, char, true)),
      bar(13, 84, 5.6, .2, -1.25, char),
      ...pegs(96, char), ...funnel(120), gate(120, char),
    ] },
  { title: '나이더스 커널', goalY: 112, zoomY: 108, accent: nydus, zoomZones: zone(112),
    sectorLabels: [{ y: 16, text: '01 / CREEP TUNNEL' }, { y: 50, text: '02 / NYDUS WORM' }, { y: 88, text: '03 / HATCHERY' }],
    entities: [
      ...shell(112, [[2, 14], [12, 30], [2, 46], [12, 62], [2, 78], [1, 88]], [[10, 14], [20, 30], [10, 46], [20, 62], [10, 78], [25, 88]]),
      ...pegs(90, nydus), bar(13, 100, 4.5, .3, 1.5, nydus),
      ...funnel(112), gate(112, nydus),
    ] },
];
```

`curvedLane`에서 `bumper(...)` 항을 제거한다. `Course` 타입: `zoomZones: ZoomZone[]` 추가(`StageDef`에 이미 선택 필드로 있음). `bumper`·`nest`·`slalom`·`split`·`flipper`·`endurance` 정의는 삭제한다(미사용 경고 방지).

- [x] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: 모든 테스트 PASS. 완주 테스트에서 끼임이 나오면 해당 좌표(벽 꺾임 각도, 핀 간격)를 조정한다. 벽은 바깥쪽으로만 꺾이게 하고 핀 간격은 3.25 이상 유지.

- [x] **Step 5: 타입 검사**

Run: `npm run build`
Expected: 통과.

---

### Task 2: 카메라·순위·시간배율 순수 모듈

**Files:**
- Create: `src/pinballCamera.ts`
- Test: `src/pinball.test.ts` (추가)

**Interfaces:**
- Produces:
  ```ts
  export const INITIAL_ZOOM = 30, VIEW_W = 1600, VIEW_H = 900;
  export type Point = { x: number; y: number };
  export type Zone = { x: number; y: number; w: number; h: number };
  export function zoneIntensity(zones: Zone[], x: number, y: number): number; // 0~1, 가운데 1
  export function smoothstep(t: number): number;
  export function timeScale(intensity: number, contested: boolean): number; // contested && intensity>0 ? max(.2, 1-intensity) : 1
  export class RankTracker { update(marbles: {id:string; x:number; y:number}[], dist:(x:number,y:number)=>number, dt:number): string[] } // EMA 0.4s, margin 0.25
  export class Camera {
    position: Point; zoom: number;
    reset(center: Point, zoom: number): void;
    update(input: { target?: Point & {id:string}; rival?: Point & {id:string}; intensity: number; focusOnRival: boolean; zones: Zone[]; viewSize: Point }): void;
  }
  ```
- Camera 규칙은 참고 `camera.ts`와 같다: FRAME_PADDING 2, MIN_FRAME_ZOOM .6, FRAME_RELEASE_ZOOM .35, FOCUS_BLEND 40, ZONE_BLEND 60, SWITCH_DELAY 20, SWITCH_BLEND 36, 보간 1/10, `zoom = max(zoom, intensity*4)`.

- [x] **Step 1: 실패하는 테스트**

```ts
import { Camera, RankTracker, timeScale, zoneIntensity } from './pinballCamera';

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
  const viewSize = { x: 1600 / 30, y: 900 / 30 };
  for (let i = 0; i < 200; i++) camera.update({ target: { id: 'a', x: 13, y: 50 }, intensity: 0, focusOnRival: false, zones: [], viewSize });
  assert.ok(Math.abs(camera.position.y - 50) < .5); assert.ok(Math.abs(camera.zoom - 1) < .05);
  for (let i = 0; i < 200; i++) camera.update({ target: { id: 'a', x: 13, y: 110 }, rival: { id: 'b', x: 13, y: 109 }, intensity: 1, focusOnRival: false, zones: [], viewSize });
  assert.ok(camera.zoom > 3.5);
});
```

- [x] **Step 2: 실패 확인** — Run `npm test`, Expected: 모듈 없음 FAIL.

- [x] **Step 3: `src/pinballCamera.ts` 구현**

참고 `camera.ts`의 `_calcTargetPositionAndZoom`, `_pickPair`, `_frameView`, `_interpolation`을 월드 단위 그대로 옮긴다. `Marble` 대신 `{id,x,y}`를 받고, `stage.cameraZones`는 쓰지 않는다(우리 코스에 없음). `RankTracker`는 참고 `_sortMarbles`를 id 기반으로 옮긴다. 주석은 한 줄 요약으로.

- [x] **Step 4: 통과 확인** — Run `npm test && npm run build`.

---

### Task 3: PinballStage 렌더러 교체

**Files:**
- Modify: `src/PinballStage.tsx` (useEffect 안의 카메라·재생·render 전면 교체)
- Modify: `src/pinball.css`, `src/studio-refinement.css` (이름표 레이어 clip-path 제거, 캔버스 비율 1600/900)

**Interfaces:**
- Consumes: Task 2의 `Camera`, `RankTracker`, `timeScale`, `zoneIntensity`, 상수; `createPinball` 결과(`marbles`, `results`, `done`, `step`, `stage`, `progress.distanceAt`).
- Produces: 같은 props. `render_game_to_text`에 `camera:{x,y,zoom}`, `timeScale`, `intensity`, `rank` 추가.

- [x] **Step 1: 상수와 캔버스**

`W=1600,H=900`, `dpr` 상한 2. 이름표는 캔버스에 직접 그린다(DOM `nameNodes`·`labelLayerRef`·`measure` 삭제, `actionLayerRef`는 유지).

- [x] **Step 2: 재생 루프**

```ts
// 10ms 틱, 시간배율은 틱 시작값으로 고정
function advance(budget = 400) {
  if (!race || !run || saved || complete()) return;
  const now = Date.now() + virtualOffset; if (now < start) return;
  pendingTime += Math.max(0, now - Math.max(start, lastPresentationTime)); lastPresentationTime = now;
  while (race.results.length < finishCount && budget-- > 0) {
    const scale = currentTimeScale(); const cost = 10 / (scale * speedRef.current);
    if (pendingTime < cost) break; pendingTime -= cost; race.step(); simSeconds += .01 * scale;
  }
  ...
}
```

`currentTimeScale()`: 커트라인 인덱스 `targetIndex = selectedRank - 1 - arrived.length`(음수면 0), 경쟁자 `rivalIndex = targetIndex+1` 없으면 `-1`. `intensityOf(m) = zoneIntensity(stage.zoomZones, m.x, m.y)`. `focusOnRival = intensity(rival) > intensity(target)`. `timeScale(intensity(focus), !!rival)`. 첫 골인 전(`arrived.length===0`)에는 카메라 대상이 선두(인덱스 0)이고 슬로모션 판단은 커트라인 기준 그대로(참고 `cameraTargetIndex`).

- [x] **Step 3: 순위**

`RankTracker.update(remainingMarbles, race.progress.distanceAt, simSecondsThisFrame)`로 남은 구슬 순서를 받고, 도착 목록 + 남은 순서로 `standings`를 만든다. 기존 `remaining()`의 정렬은 제거.

- [x] **Step 4: 카메라**

```ts
camera.update({ target: standings[cameraIndex], rival: standings[cameraIndex+1] ?? standings[cameraIndex-1], intensity, focusOnRival, zones: race.stage.zoomZones, viewSize: { x: W / INITIAL_ZOOM, y: H / INITIAL_ZOOM } });
```
준비 상태: `camera.reset({x: 13, y: rows/2+1}, clamp(1.5..3))`(참고 `setMarbles`). 월드→화면: `sx = W/2 + (x - camera.x) * INITIAL_ZOOM * camera.zoom`.

- [x] **Step 5: 그리기**

순서: 배경 `#0b0f10` → (월드 변환) 섹터 라벨 → 엔티티(폴리라인 흰색 shadowBlur 15, 막대 `#7fe3ff`, 원 노랑/액센트, 회전체 액센트, 터지는 구슬 액센트 점선) → 꼬리 → 구슬(색 원, 사진 ON이면 사진) → 이름(구슬 아래 0.6유닛, 글자 14px/zoom, 색 글자 + 검은 외곽선 2px, 이름표 OFF면 생략, 결과 중에는 생략) → (화면 좌표) 상단 줄(코스명·모드·상태·시간, 높이 40) → 미니맵(왼쪽 10px, 4px/유닛, 폭 104px, 높이 `goalY*4`, 뷰포트 사각형 흰색 1px, 테두리 초록) → 순위 목록(오른쪽 위, `도착 순위 n / total`, 18px 줄 간격, 골인 ✓, 당첨 순위 금색 띠) → 카운트다운·결과 카드·맵 결과(기존 코드, 좌표만 1600×900 중심으로).

- [x] **Step 6: CSS**

`src/pinball.css`: `.pinball-stage .pinball-canvas{aspect-ratio:1600/900;background:#0b0f10}`; `.pinball-label-layer`, `.pinball-marble-name` 규칙 삭제(`studio-refinement.css` 83~84행). `.pinball-layout .pinball-stage{background:#0b0f10}`.

- [x] **Step 7: 빌드·테스트** — `npm run build && npm test`.

---

### Task 4: 한 화면 레이아웃과 떠 있는 설정 패널

**Files:**
- Modify: `src/App.tsx` `DrawPage` 핀볼 분기(123행 JSX)
- Modify: `src/studio-refinement.css` (`.pinball-layout` 규칙, 97~101행 액션바, 124~127행 배속)

**Interfaces:**
- Consumes: 기존 상태(`variant`, `map`, `source`, `winnerSetting`, `quantities`, `customNames`, `showNames`, `showPortraits`, `previewSeed`, `running`).
- Produces: 새 로컬 상태 `settingsOpen`(기본 true, 추첨 시작 시 false, 완료 시 true), `quantityOpen`(기본 false).

- [x] **Step 1: 구조**

핀볼일 때 `draw-layout pinball-layout`을 다음 구조로 바꾼다(룰렛 분기는 그대로):

```tsx
<div className="draw-layout pinball-layout">
  <section className="panel stage-panel">
    <DrawStage .../>
    <div className="pinball-tools" role="toolbar" aria-label="핀볼 보기 도구">{/* 1×/2×/4× 는 PinballStage 안에 있으므로 여기엔 이름표·사진·섞기 */}
      <button aria-pressed={showNames} ...><Tag size={14}/></button>
      <button aria-pressed={showPortraits} ...><ImageIcon size={14}/></button>
      <button disabled={running} ...><Shuffle size={14}/></button>
    </div>
    {settingsOpen ? <section className="pinball-settings" data-running={running}>{/* 기존 draw-controls 내용: 모드·코스·대상/추첨맵·당첨자·시작/취소 한 줄, 아래에 수량/직접입력/맵 풀 */}</section>
      : <button className="pinball-settings-toggle" onClick={()=>setSettingsOpen(true)}><Settings2 size={14}/> 설정</button>}
    {!resultIsMaps ? <div className="draw-result">…기존…</div> : null}
  </section>
</div>
```

수량 패널(`draw-quantity-panel`)과 팀 선택은 `quantityOpen`일 때만 렌더하고, 패널 1행 끝에 `<button onClick={()=>setQuantityOpen(v=>!v)}>수량</button>`을 둔다. 직접 입력(`draw-custom-items`)과 맵 풀(`draw-map-pool`)은 항상 2행에 표시.

`start()` 성공 시 `setSettingsOpen(false)`; `displayedRun?.finishedAt`이 생기면 `useEffect`로 `setSettingsOpen(true)`.

- [x] **Step 2: CSS**

```css
.draw-layout.pinball-layout { grid-template-rows: minmax(0, 1fr); }
.pinball-layout .stage-panel { position: relative; }
.pinball-settings { position: absolute; left: 14px; bottom: 14px; z-index: 3; width: min(560px, calc(100% - 28px)); padding: 10px 12px; border: 1px solid #ffffff1a; border-radius: 10px; background: #0f1516ee; backdrop-filter: blur(6px); display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)) auto; gap: 8px; }
.pinball-settings .field-label { margin: 0; font-size: 11px; color: #a2ada3; }
.pinball-settings select { height: 34px; font-size: 14px; }
.pinball-settings > .button { height: 34px; align-self: end; }
.pinball-settings .draw-quantity-panel, .pinball-settings .draw-custom-items, .pinball-settings .draw-map-pool { grid-column: 1 / -1; }
.pinball-settings .quantity-cards { max-height: 120px; }
.pinball-settings-toggle { position: absolute; left: 14px; bottom: 14px; z-index: 3; display: flex; gap: 6px; align-items: center; height: 32px; padding: 0 12px; border: 1px solid #ffffff22; border-radius: 8px; background: #0f1516ee; color: #d3c7a2; font-size: 13px; }
.pinball-tools { position: absolute; right: 52px; top: 10px; z-index: 3; display: flex; gap: 4px; }
.pinball-tools button { width: 30px; height: 30px; display: grid; place-items: center; border: 1px solid #ffffff1f; border-radius: 6px; background: #0f1516dd; color: #8d9b90; }
.pinball-tools button[aria-pressed=true] { color: #e5d6b0; border-color: #a99e6d80; }
.pinball-layout .pinball-fullscreen { top: 10px; bottom: auto; }
.pinball-speed-controls { left: auto; right: 10px; top: 48px; bottom: auto; }
.pinball-layout .draw-result { position: absolute; right: 14px; bottom: 14px; z-index: 3; min-width: 280px; border-radius: 10px; }
```

기존 `.pinball-layout .draw-controls …`, `.pinball-action-bar …` 규칙은 삭제한다.

- [x] **Step 3: 빌드** — `npm run build && npm test`.

---

### Task 5: 실행 확인

- [x] **Step 1:** 사용자에게 확인 추첨을 1회 돌린다고 알린 뒤 Playwright로 `http://127.0.0.1:5173/` → 핀볼. 1280×720, 1536×864, 1920×1080에서 설정 패널·도구·결과 카드가 겹치지 않고 모두 보이는지 스크린샷.
- [x] **Step 2:** `추첨 시작` → 패널이 접히고 `설정` 버튼만 남는지. `render_game_to_text`로 `camera.zoom≈1`, 선두 추적(`camera.y`가 선두 y 근처), 깔때기 진입 시 `intensity>0`, `timeScale<1`, 완료 후 `complete`.
- [x] **Step 3:** 미니맵·순위 목록·이름표 스크린샷 확인, 콘솔 오류 0건.
- [x] **Step 4:** 루트의 스크린샷 PNG 삭제, 스크래치패드의 `ref-roulette` 클론 삭제.
