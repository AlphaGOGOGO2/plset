# 참가자 패널 종족별/팀별 전환 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 진행 대시보드 참가자 패널에 `종족별 | 팀별` 전환 버튼을 달아, 팀 편성 탭에서 짠 A팀/B팀/미배정 구성을 보기 전용으로 같은 자리에 보여준다.

**Architecture:** 그룹 계산은 `src/domain.ts`의 순수 함수 `participantGroups(s, view)`가 맡고 `node:test`로 검증한다. `src/ParticipantRoster.tsx`는 `view` 상태를 들고 그 함수 결과를 기존 종족 줄 마크업 그대로 그린다. 전환 상태는 `localStorage`에 `plset.participantView` 키로 기억한다(테마 저장과 같은 try/catch 패턴).

**Tech Stack:** React 18 + TypeScript, Vite, Electron, `node:test`(`npm test`는 `tsx --test`로 실행), lucide-react 아이콘.

## Global Constraints

- 보기 전용. 팀 배정 변경 UI(드래그, A/B 버튼, 팀 이름 입력)는 추가하지 않는다.
- 세션 저장 포맷(`Session` 타입, `validateSession`)은 건드리지 않는다.
- 레이아웃 CSS(`src/race-entry-layout.css`, `src/broadcast-layout.css`)는 수정하지 않는다. 색상·여백만 `src/race-entry.css` 끝에 추가한다.
- localStorage 키는 `plset.participantView`, 값은 `'race' | 'team'`. 읽기 실패나 알 수 없는 값은 `'race'`.
- 문구: 버튼 `종족별`, `팀별`. 미배정 줄 제목 `미배정`. 팀 줄 인원 표기 `n / teamSize`, 그 외 `n명`.
- 이 프로젝트는 git 저장소가 아니다. 커밋 단계는 없다. 각 태스크 끝에 `npm test`와 `npm run build`가 통과해야 한다.
- 기존 파일은 한 줄에 여러 문장을 압축해 쓰는 스타일이다. 새 코드도 그 밀도를 따른다.

---

### Task 1: `participantGroups` 도메인 함수

**Files:**
- Modify: `src/domain.ts` (`teamMembers` 함수 바로 아래, 10행 근처)
- Test: `src/domain.test.ts` (파일 끝에 추가, import 줄 수정)

**Interfaces:**
- Consumes: 기존 `Session`, `Player`, `Race`, `Team`, `teamMembers(players, team)`, `createSession()`, `setTeam(players, id, team, now)`.
- Produces:
  ```ts
  export type ParticipantView = 'race' | 'team';
  export interface ParticipantGroup { key: Race | Team | 'unassigned'; label: string; players: Player[]; capacity?: number }
  export function participantGroups(s: Session, view: ParticipantView): ParticipantGroup[]
  ```
  - `view === 'race'`: `key` 순서 `T, Z, P`, `label` 테란/저그/프로토스, active 선수만, `capacity` 없음.
  - `view === 'team'`: `key` 순서 `A, B, unassigned`. A/B는 `label = s.teams[team]`, `players = teamMembers(s.players, team)`, `capacity = s.teamSize`. 미배정은 `label = '미배정'`, active이면서 `team`이 null인 선수, `capacity` 없음.

- [x] **Step 1: 실패하는 테스트 작성**

`src/domain.test.ts` 3행 import 목록에 `participantGroups`를 추가한다:

```ts
import { MATCH_MAPS, mapSchedule, allocateTeams, createSession, patronFunding, funding, clockRemaining, shuffle, validateSession, setAmount, setTeam, rankByFunding, teamMembers, givenName, withTeamNames, spectatorText, setNote, sessionReport, reportFileName, addMap, removeMap, sessionMaps, participantGroups } from './domain';
```

파일 끝에 테스트를 추가한다:

```ts
test('참가자 그룹을 종족별·팀별로 나눈다',()=>{
  const s=createSession();
  const [hong,jung,jo,,jae]=s.players; // 임홍규 Z, 김정우 Z, 조일장 Z, 김명운 Z, 이재호 T
  let players=setTeam(s.players,hong.id,'A',1); players=setTeam(players,jung.id,'B',2); players=setTeam(players,jo.id,'A',3);
  players=players.map(p=>p.id===jae.id?{...p,active:false}:p);
  const session={...s,players,teams:{A:'홍구팀',B:'정우팀'}};
  const race=participantGroups(session,'race');
  assert.deepEqual(race.map(g=>g.key),['T','Z','P']);
  assert.deepEqual(race.map(g=>g.label),['테란','저그','프로토스']);
  assert.deepEqual(race.map(g=>g.players.length),[3,4,2]);
  assert.ok(race.every(g=>g.capacity===undefined));
  const team=participantGroups(session,'team');
  assert.deepEqual(team.map(g=>g.key),['A','B','unassigned']);
  assert.deepEqual(team.map(g=>g.label),['홍구팀','정우팀','미배정']);
  assert.deepEqual(team[0].players.map(p=>p.name),['임홍규','조일장']);
  assert.deepEqual(team[1].players.map(p=>p.name),['김정우']);
  assert.deepEqual(team.map(g=>g.capacity),[5,5,undefined]);
  assert.equal(team[2].players.length,6);
  assert.ok(!team[2].players.some(p=>p.name==='이재호'));
});
```

- [x] **Step 2: 테스트가 실패하는지 확인**

Run: `npm test`
Expected: `participantGroups`가 export되지 않아 FAIL (`SyntaxError: The requested module './domain' does not provide an export named 'participantGroups'` 또는 유사).

- [x] **Step 3: 최소 구현**

`src/domain.ts`의 `teamMembers` 함수 줄 바로 아래에 추가한다:

```ts
export type ParticipantView = 'race' | 'team';
export interface ParticipantGroup { key: Race | Team | 'unassigned'; label: string; players: Player[]; capacity?: number }
const RACE_LABELS: Record<Race,string> = { T: '테란', Z: '저그', P: '프로토스' };
// Dashboard participant panel: the same players grouped by race, or by the A/B assignment made in the match builder.
export function participantGroups(s: Session, view: ParticipantView): ParticipantGroup[] {
  const active = s.players.filter(p => p.active);
  if (view === 'race') return (['T','Z','P'] as Race[]).map(race => ({ key: race, label: RACE_LABELS[race], players: active.filter(p => p.race === race) }));
  return [...(['A','B'] as Team[]).map(team => ({ key: team, label: s.teams[team], players: teamMembers(s.players, team), capacity: s.teamSize })), { key: 'unassigned', label: '미배정', players: active.filter(p => !p.team) }];
}
```

`Session` 인터페이스는 같은 파일 아래쪽(82행)에 있어도 TypeScript 타입은 호이스팅되므로 문제 없다.

- [x] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: 모든 테스트 PASS, 새 테스트 `참가자 그룹을 종족별·팀별로 나눈다` 포함.

- [x] **Step 5: 타입 검사**

Run: `npm run build`
Expected: 오류 없이 종료.

---

### Task 2: 참가자 패널 전환 버튼과 팀별 렌더링

**Files:**
- Modify: `src/ParticipantRoster.tsx` (import 3행, `RACES` 상수 8~12행, 상태 18행, 헤더 58행, 본문 82~91행)
- Modify: `src/race-entry.css` (파일 끝에 추가)

**Interfaces:**
- Consumes: Task 1의 `participantGroups(s, view)`, `ParticipantView`; 기존 `RaceMark`, `Portrait`, `.segmented` CSS 클래스(`selected` 버튼 클래스).
- Produces: 없음(화면 컴포넌트).

- [x] **Step 1: import와 상수 교체**

`src/ParticipantRoster.tsx` 3행을 다음으로 바꾼다:

```ts
import { participantGroups, uid, type ParticipantView, type Race, type Session } from './domain';
```

8~12행의 `RACES` 상수를 삭제하고 그 자리에 localStorage 도우미를 넣는다:

```ts
const VIEW_KEY = 'plset.participantView';
function loadView(): ParticipantView { try { return localStorage.getItem(VIEW_KEY) === 'team' ? 'team' : 'race'; } catch { return 'race'; } }
function saveView(view: ParticipantView) { try { localStorage.setItem(VIEW_KEY, view); } catch { /* private mode */ } }
```

- [x] **Step 2: 상태 추가**

`const [message, setMessage] = useState('');` 줄 아래에 추가한다:

```ts
const [view, setViewState] = useState<ParticipantView>(loadView);
const setView = (next: ParticipantView) => { setViewState(next); saveView(next); };
```

- [x] **Step 3: 헤더에 전환 버튼 추가**

`<h2>참가자 <span>...</span></h2>` 줄 바로 다음, `<div className="participant-entry-actions">` 앞에 추가한다:

```tsx
<div className="segmented participant-view-toggle" role="group" aria-label="참가자 보기 기준">
  <button className={view === 'race' ? 'selected' : ''} aria-pressed={view === 'race'} onClick={() => setView('race')}>종족별</button>
  <button className={view === 'team' ? 'selected' : ''} aria-pressed={view === 'team'} onClick={() => setView('team')}>팀별</button>
</div>
```

- [x] **Step 4: 본문을 그룹 기반으로 교체**

`<div className="participant-overview-body"><div className="roster-entry-grid">{RACES.map(({ race, label }) => { ... })}</div>` 블록(82~91행)을 다음으로 바꾼다:

```tsx
<div className="participant-overview-body"><div className="roster-entry-grid">{participantGroups(s, view).map(g => (
  <section className={`race-entry race-entry-${g.key}`} aria-label={`${g.label} 참가자`} key={g.key}>
    <div className="race-entry-heading">
      {view === 'race' ? <RaceMark race={g.key as Race}/> : <span className="race team-mark" aria-hidden="true">{g.key === 'unassigned' ? '–' : g.key}</span>}
      <h3>{g.label}</h3>
      <span>{g.capacity ? `${g.players.length} / ${g.capacity}` : `${g.players.length}명`}</span>
    </div>
    <div className="race-entry-players">{g.players.map(p => <div className="race-entry-player" key={p.id}>
      <Portrait player={p} small/><strong>{p.name}</strong>
      <button aria-label={`${p.name} 참가 제외`} onClick={() => commit(v => ({ ...v, players: v.players.map(x => x.id === p.id ? { ...x, active: false, team: null } : x) }), `${p.name} 참가 제외`)}><X size={12}/></button>
    </div>)}</div>
  </section>
))}</div>
```

`participant-overview-body` 닫는 태그와 그 안의 `notes-panel` 섹션은 그대로 둔다.

- [x] **Step 5: CSS 추가**

`src/race-entry.css` 파일 끝에 한 줄로 추가한다:

```css
.participant-view-toggle{margin-left:14px;margin-right:auto}.team-mark{border-color:#50775b;color:#b6e9c1;background:#294331}.race-entry-B .team-mark{border-color:#536b8b;color:#b4d0f0;background:#2d3c4e}.race-entry-unassigned .team-mark{border-color:#3a4a3a;color:#728c74;background:#1a241c}.race-entry-A .race-entry-player{border-color:#3d5a45;background:#1f2d23}.race-entry-B .race-entry-player{border-color:#3d4e61;background:#1f2a33}
```

- [x] **Step 6: 타입 검사와 테스트**

Run: `npm run build && npm test`
Expected: 둘 다 오류 없이 통과. `RACES` 미사용 경고가 남아 있으면 상수를 지웠는지 확인.

---

### Task 3: 실행 확인

**Files:** 없음(검증만).

- [x] **Step 1: 개발 서버 실행**

Run (background): `npm run dev`
Expected: `127.0.0.1:5173` LISTENING, Electron 창 표시. 이미 떠 있으면 Vite HMR로 반영되므로 재시작 불필요.

- [x] **Step 2: Playwright로 전환 확인**

Playwright MCP로 `http://127.0.0.1:5173/`에 접속해 다음을 수행한다:
1. `팀별` 버튼 클릭 → 스냅샷에 팀 이름(`TEAM A`, `TEAM B`)과 `미배정` 줄이 보이고, 미배정에 참가자 10명이 있어야 한다.
2. 왼쪽 내비 `팀 편성` 클릭 → `무작위 팀 편성` 클릭 → `진행 대시보드` 클릭 → 참가자 패널이 여전히 `팀별`이고 TEAM A / TEAM B 줄에 각각 `5 / 5`, 미배정 `0명`.
3. 페이지 새로고침(`browser_navigate` 같은 URL) → `팀별`이 유지되어야 한다(localStorage).
4. `종족별` 클릭 → 테란/저그/프로토스 줄로 복귀.
5. 스크린샷을 찍어 줄 높이와 칩 스타일이 종족별 보기와 같은지 눈으로 확인한다.

- [x] **Step 3: 콘솔 오류 확인**

Playwright `browser_console_messages` level `error` → 0건.

- [x] **Step 4: 정리**

Playwright가 프로젝트 루트에 남긴 스크린샷 PNG를 삭제한다. `.playwright-mcp/` 디렉터리는 기존에 있던 것이므로 그대로 둔다.
