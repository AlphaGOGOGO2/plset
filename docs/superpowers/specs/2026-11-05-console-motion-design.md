# 프로리그 콘솔 모션 효과 설계

2026-11-05. 웹 콘솔(starjoa.kr/proleague/app)과 데스크톱(PL SET)이 공유하는 `src/` UI에 적용한다.

## 목표

- 탭 전환이 즉시 바뀌지 않고 짧은 진입 모션을 가진다.
- 팀 편성에서 선수를 팀에 배치하는 순간 "슬램 임팩트"로 긴장감을 준다. 효과음은 넣지 않는다.
- OS의 동작 줄이기 설정을 따른다.

## 라이브러리

`motion` (Framer Motion의 현재 패키지명, `motion/react`). 스프링 물리, `layoutId` 하이라이트 이동, `layout` 재배열, `AnimatePresence` 퇴장을 쓴다. `MotionConfig reducedMotion="user"`로 감싼다.

## 동작

1. **사이드바 탭**: 활성 배경을 `layoutId="nav-active"` 요소로 분리해 클릭한 탭으로 스프링 이동. 활성 탭 아이콘은 1 → 1.18 → 1 로 320ms 튄다.
2. **탭 내용 진입**: 보이는 페이지가 아래 8px에서 220ms에 걸쳐 올라오며 페이드인. 나가는 페이지는 즉시 사라진다(퇴장 애니메이션 없음. 두 페이지가 겹쳐 보이는 것을 피하기 위함). 핀볼·룰렛·레이스·귀인·정산은 지금처럼 `hidden` 토글을 유지하고, 보일 때만 같은 진입 모션을 건다. 물리 시뮬레이션은 건드리지 않는다.
3. **팀 배치 슬램**: 마지막 배치 `{id, team, n}`을 `TeamsPage` 상태로 추적. 해당 슬롯은 1.35배·투명에서 스프링(stiffness 600, damping 24)으로 안착. 팀 카드는 Web Animations API로 320ms 동안 ±3px 흔들림. 팀 색(A 민트, B 하늘) 글로우 링이 600ms에 걸쳐 꺼진다.
4. **제외·재배열**: 팀 슬롯과 미배정 칩은 `AnimatePresence mode="popLayout"` 안에서 축소·페이드로 사라지고, 미배정 덱의 칩은 `layout`으로 자리를 메운다.
5. **HTML5 드래그 호환**: motion 컴포넌트의 `onDragStart`는 제스처 핸들러이므로, `draggable`과 네이티브 `onDragStart`는 motion 래퍼 안쪽의 일반 요소에 둔다.

## 검증

- `tsc -b`와 `npm run build:web` 통과.
- 로컬 콘솔에서 탭 전환과 드래그 배치를 Playwright로 실제 실행해 스크린샷 확인.
- 기존 도메인 테스트(`npm test`) 유지. 모션 자체는 단위 테스트하지 않는다.
