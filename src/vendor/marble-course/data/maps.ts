// Adapted from lazygyu/roulette, copyright (c) 2022 LazyGyu, MIT. See public/licenses/marble-course.txt.
import type { MapEntity } from '../types/MapEntity.type';

export type AdBoard = {
  x: number;
  y: number;
  w?: number;
  h?: number;
};

export type StageDef = {
  title: string;
  entities?: MapEntity[];
  goalY: number;
  zoomY: number;
  adBoards?: AdBoard[];
  /** 순위 계산 보조 정보 (물리에는 영향 없음) */
  progress?: ProgressHints;
  /** 연출 구역. 있으면 zoomY 대신 이 구역들로 줌인과 슬로모션을 건다 */
  zoomZones?: ZoomZone[];
  /** 카메라 구역. 카메라가 주목하는 구슬이 구역 안에 있으면 구슬 대신 구역 전체를 화면에 담는다 (결승 줌인 중에는 쓰지 않는다) */
  cameraZones?: CameraZone[];
};

/** 연출 구역 (x, y 는 가운데, w, h 는 전체 크기). 가운데로 갈수록 연출이 세진다 */
export type ZoomZone = {
  x: number;
  y: number;
  w: number;
  h: number;
};

/** 카메라 구역 (x, y 는 가운데, w, h 는 전체 크기) */
export type CameraZone = {
  x: number;
  y: number;
  w: number;
  h: number;
};

/** 일방통행 선: 시작점 → 끝점 방향의 오른쪽으로만 통과할 수 있다고 보고 순위를 계산한다 */
export type OneWayLine = {
  from: [number, number];
  to: [number, number];
};

export type ProgressHints = {
  oneWays?: OneWayLine[];
};

