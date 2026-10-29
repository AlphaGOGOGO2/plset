import type { StageDef, ZoomZone } from './vendor/marble-course/data/maps';
import type { MapEntity } from './vendor/marble-course/types/MapEntity.type';

// Original PL SET courses. Geometry is authored here, independent of the reference maps.
// What we borrow from lazygyu's Wheel of Fortune is the grammar, not the layout: marbles should always be rolling along or
// bouncing off something thin (lanes, ledges, pegs), the field splits and rejoins, and the finish is a funnel with a sweeper.
// Each course uses a different descent mechanism so no two feel alike.
export type CourseEntity = MapEntity & { kick?: number; motion?: { amplitude: number; frequency: number; phase: number }; arm?: number };
type Course = Omit<StageDef, 'entities'> & { physicsVersion?: 2; entities: CourseEntity[]; accent: string; sectorLabels: { y: number; text: string }[]; zoomZones: ZoomZone[] };
const line = (points: [number, number][]): MapEntity => ({ type: 'static', position: { x: 0, y: 0 }, shape: { type: 'polyline', rotation: 0, points }, props: { density: 1, restitution: .12, angularVelocity: 0 } });
const bar = (x: number, y: number, width: number, angle = 0, speed = 0, color = '#cbb78e'): MapEntity => ({ type: speed ? 'kinematic' : 'static', position: { x, y }, shape: { type: 'box', width, height: .1, rotation: angle, color }, props: { density: 1, restitution: .2, angularVelocity: speed } });
const orb = (x: number, y: number, radius: number, color: string, pop = false): MapEntity => ({ type: 'static', position: { x, y }, shape: { type: 'circle', radius, color }, props: { density: 1, restitution: pop ? .9 : .5, angularVelocity: 0, ...(pop ? { life: 1 } : {}) } });
const crystal = (x: number, y: number, radius: number, color: string): MapEntity => ({ type: 'static', position: { x, y }, shape: { type: 'box', width: radius, height: radius, rotation: Math.PI / 4, color }, props: { density: 1, restitution: .3, angularVelocity: 0 } });

// Outer walls: spawn lane x 9..17 down to y=5, then the course's own left/right wall points, then both walls run to the funnel mouth at goal-14.
const walls = (goal: number, left: [number, number][], right: [number, number][]) => [line([[9, -30], [9, 5], ...left, [1, goal - 14]]), line([[17, -30], [17, 5], ...right, [25, goal - 14]])];
// Channel (8 wide) along a centre line; returns the wall point lists.
const channel = (path: [number, number][]): [[number, number][], [number, number][]] => [path.map(([x, y]) => [x - 4, y]), path.map(([x, y]) => [x + 4, y])];
// S-curve centre line: `periods` full sine swings between x=7 and x=19 over `height` units.
function serpentine(from: number, height: number, periods: number): [number, number][] {
  const n = Math.round(height / 1.5);
  return Array.from({ length: n + 1 }, (_, i) => { const t = i / n; return [13 + 6 * Math.sin(t * periods * Math.PI * 2), from + t * height] as [number, number]; });
}
// Wall-mounted ledges are zero-thickness lines: a thick bar's end face would leave a wedge against the wall that pins a marble.
const ledge = (x0: number, y0: number, x1: number, y1: number): MapEntity => line([[x0, y0], [x1, y1]]);
// Alternating ledges from each wall, sloping toward the centre: marbles roll along one, drop to the next on the other side.
// Ledges start behind the (slightly slanted) outer wall so there is never a gap at the wall end for a marble to wedge into.
const ledges = (y: number, count: number, gap: number): MapEntity[] => Array.from({ length: count }, (_, i) => i % 2 ? ledge(26, y + i * gap - 2, 12.5, y + i * gap + 1.6) : ledge(0, y + i * gap - 2, 13.5, y + i * gap + 1.6));
// Windmill: two crossed bars turning slowly; marbles get caught in a pocket, carried round and dropped out of turn.
const windmill = (x: number, y: number, color: string, speed = -.9): MapEntity[] => [bar(x, y, 3, 0, speed, color), bar(x, y, 3, Math.PI / 2, speed, color)];
// Small pegs inside a lane leg so marbles weave instead of sliding down the wall.
const lanePegs = (points: [number, number][], color: string, size = .3): MapEntity[] => points.map(([x, y]) => crystal(x, y, size, color));
// Pachinko peg grid: three staggered rows of small diamonds across the room.
const pegs = (y: number, color: string): MapEntity[] => [...[7, 10, 13, 16, 19].map(x => crystal(x, y, .25, color)), ...[8.5, 11.5, 14.5, 17.5].map(x => crystal(x, y + 2.6, .25, color)), ...[7, 10, 13, 16, 19].map(x => crystal(x, y + 5.2, .25, color))];
// Two rows of thin chevrons that fan marbles sideways without holding them.
const XS = [5.5, 8.5, 11.5, 14.5, 17.5, 20.5];
const chevrons = (y: number, color: string): MapEntity[] => [...XS.map(x => bar(x, y, .6, Math.PI / 4, 0, color)), ...XS.map(x => bar(x + 1.5, y + 2.4, .6, -Math.PI / 4, 0, color))];
// Four spinners kept clear of both walls so no arm can juggle a marble against a wall.
const spinners = (y: number, color: string): MapEntity[] => [7, 11, 15, 19].map((x, i) => bar(x, y, 2, 0, i % 2 ? -3.5 : 3.5, color));
// Funnel into a one-marble chute (12.5..13.5) that drops straight to the goal. Its walls do not bounce, so a marble the sweeper
// lifts settles back into the mouth instead of rebounding up the funnel again.
const dead = (points: [number, number][]): MapEntity => ({ ...line(points), props: { density: 1, restitution: 0, angularVelocity: 0 } });
const funnel = (goal: number): MapEntity[] => [dead([[1, goal - 14], [12.5, goal - 5], [12.5, goal + 4]]), dead([[25, goal - 14], [13.5, goal - 5], [13.5, goal + 4]])];
// Finish sweeper (after lazygyu's Wheel of Fortune): pivot outside the left funnel wall, one 2.2-long arm turning counter-clockwise,
// so it rises through the mouth and shoves waiting marbles back up the funnel once per turn.
const gate = (goal: number, color: string): CourseEntity => ({ ...bar(11.5, goal - 5, 1.1, 0, -1.2, color), arm: 1.1, props: { density: 1, restitution: 0, angularVelocity: -1.2 } });
// Legacy finish-zone metadata. Presentation now uses zoomY directly for a height-only intensity.
const zone = (goal: number): ZoomZone[] => [{ x: 13, y: goal - 4, w: 24, h: 10 }];
const siege = '#cbb78e', swarm = '#99b98c', aiur = '#85beca', char = '#cf9279', nydus = '#b48bd0';

// Replay IDs 0..4 are frozen: do not tune these entities or their physics.
const legacyCourses: Course[] = [
  {
    // 시즈 브레이커: bunker ledges stair-step the field left and right, then a line of siege-tank spinners under a chevron spreader.
    title: '시즈 브레이커', goalY: 122, zoomY: 118, accent: siege, zoomZones: zone(122),
    sectorLabels: [{ y: 14, text: '01 / SIEGE LINE' }, { y: 56, text: '02 / CROSS FIRE' }, { y: 92, text: '03 / LAST BUNKER' }],
    entities: [
      ...walls(122, [[2, 12]], [[24, 12]]),
      ...ledges(18, 4, 9),
      ...chevrons(62, siege), ...spinners(74, siege),
      ...pegs(96, siege), ...funnel(122), gate(122, siege),
    ],
  },
  {
    // 뮤탈리스크 런: one long S-curve lane with pegs on the bends, then a swarm of pop-orbs that burst on contact.
    title: '뮤탈리스크 런', goalY: 124, zoomY: 120, accent: swarm, zoomZones: zone(124),
    sectorLabels: [{ y: 12, text: '01 / FLOCK' }, { y: 60, text: '02 / RICOCHET' }, { y: 100, text: '03 / SWARM' }],
    entities: (() => { const path = serpentine(5, 64, 2.5), [left, right] = channel(path); return [
      ...walls(124, [...left, [2, 70]], [...right, [24, 70]]),
      ...lanePegs([[18, 11], [8, 24], [18, 37], [8, 50], [18, 63]], swarm, .35),
      ...[5, 9, 13, 17, 21].map((x, i) => orb(x, 76 + i % 2 * 3, .7, swarm, true)), ...[7, 11, 15, 19].map((x, i) => orb(x, 86 + i % 2 * 3, .7, swarm, true)),
      ...pegs(100, swarm), ...funnel(124), gate(124, swarm),
    ]; })(),
  },
  {
    // 아이어의 관문: the field is split by a central pylon wall into two lanes with crystals, rejoins through a warp gate, then a slow spinner.
    title: '아이어의 관문', goalY: 122, zoomY: 118, accent: aiur, zoomZones: zone(122),
    sectorLabels: [{ y: 13, text: '01 / PYLON ARRAY' }, { y: 56, text: '02 / WARP GATE' }, { y: 96, text: '03 / RECALL' }],
    entities: [
      ...walls(122, [[4, 12]], [[22, 12]]),
      crystal(13, 16, 2.2, aiur), line([[13, 19], [13, 52]]),
      ...[22, 30, 38, 46].flatMap((y, i) => i % 2 ? [ledge(13, y - 1, 8.5, y + .9), ledge(13, y - 1, 17.5, y + .9)] : [ledge(0, y - 1.5, 8.5, y + .9), ledge(26, y - 1.5, 17.5, y + .9)]),
      crystal(13, 58, 2.2, aiur), ledge(0, 64, 9, 68), ledge(26, 64, 17, 68),
      ...windmill(13, 80, aiur), crystal(6, 90, 1.3, aiur), crystal(20, 90, 1.3, aiur),
      ...pegs(98, aiur), ...funnel(122), gate(122, aiur),
    ],
  },
  {
    // 차 행성 강하: free fall through a magma field of pop-orbs, a staircase of short drops, then one big rotating bar.
    title: '차 행성 강하', goalY: 128, zoomY: 124, accent: char, zoomZones: zone(128),
    sectorLabels: [{ y: 12, text: '01 / ORBITAL DROP' }, { y: 60, text: '02 / MAGMA RIFT' }, { y: 100, text: '03 / EXTRACTION' }],
    entities: [
      ...walls(128, [[2, 12]], [[24, 12]]),
      ...[5, 9, 13, 17, 21].map((x, i) => orb(x, 18 + i % 2 * 4, .9, char, true)), ...[7, 11, 15, 19].map((x, i) => orb(x, 28 + i % 2 * 4, .9, char, true)),
      ledge(0, 39, 10, 44), ledge(26, 39, 16, 44),
      ...ledges(52, 3, 8),
      bar(13, 86, 5.6, .2, -1.25, char),
      ...pegs(100, char), ...funnel(128), gate(128, char),
    ],
  },
  {
    // 나이더스 커널: a narrow creep tunnel with three sharp switchbacks and pegs on every bend, then straight into the funnel.
    title: '나이더스 커널', goalY: 120, zoomY: 116, accent: nydus, zoomZones: zone(120),
    sectorLabels: [{ y: 16, text: '01 / CREEP TUNNEL' }, { y: 50, text: '02 / NYDUS WORM' }, { y: 92, text: '03 / HATCHERY' }],
    entities: (() => { const path: [number, number][] = [[13, 5], [5, 19], [5, 23], [21, 39], [21, 43], [5, 59], [5, 63], [13, 76]], [left, right] = channel(path); return [
      ...walls(120, [...left, [2, 82]], [...right, [24, 82]]),
      ...lanePegs([[10, 12], [8, 16], [12, 31], [16, 35], [14, 51], [10, 55]], nydus, .35),
      ...pegs(88, nydus), ...windmill(13, 100, nydus),
      ...funnel(120), gate(120, nydus),
    ]; })(),
  },
];

// IDs 5..9 select the revised physics without adding fields to DrawRun.
// Keep the five descent mechanisms; compress only the open rooms, not the S/tunnel lanes.
export const LEGACY_COURSE_COUNT = 5;
const cameraZones = [
  [{ x: 13, y: 32, w: 18, h: 18 }, { x: 13, y: 74, w: 18, h: 10 }],
  [{ x: 17, y: 12, w: 12, h: 10 }, { x: 9, y: 25, w: 12, h: 10 }, { x: 13, y: 82, w: 22, h: 16 }],
  [{ x: 13, y: 34, w: 18, h: 22 }, { x: 13, y: 80, w: 14, h: 10 }],
  [{ x: 13, y: 26, w: 18, h: 22 }, { x: 13, y: 62, w: 18, h: 16 }, { x: 13, y: 86, w: 16, h: 10 }],
  [{ x: 5, y: 21, w: 12, h: 10 }, { x: 21, y: 41, w: 12, h: 10 }, { x: 5, y: 61, w: 12, h: 10 }, { x: 13, y: 100, w: 14, h: 10 }],
];
function reviseCourse(source: Course, index: number): Course {
  const course: Course = structuredClone(source);
  course.physicsVersion = 2;
  course.cameraZones = cameraZones[index];
  const narrow = index === 0 || index === 2 || index === 3;
  const roomX = (x: number, y: number) => {
    // Preserve the spawn and the complete finish funnel, with a gradual shoulder at each end.
    const amount = Math.max(0, Math.min(1, (y - 5) / 7, (course.goalY - 14 - y) / 10));
    return 13 + (x - 13) * (1 - (narrow ? .32 : 0) * amount);
  };
  course.entities = course.entities.map((entity, entityIndex) => {
    const s = entity.shape;
    if (entity.arm !== undefined) {
      // Keep the original one-armed sweeper: full 2.2 reach, counter-clockwise like the reference wheel.
      return { ...entity, props: { ...entity.props, angularVelocity: -1.2 } };
    }
    if (s.type === 'polyline') {
      // Hold the narrower walls until the last ten units before the funnel; otherwise the
      // long segment to the original mouth would open gaps behind the shortened shelves.
      if (narrow && entityIndex < 2) s.points.splice(s.points.length - 1, 0, [s.points.at(-1)![0], course.goalY - 24]);
      s.points = s.points.map(([x, y]) => [roomX(x, y), y]);
      if (s.points.length === 2 && s.points[1][1] > s.points[0][1] && s.points[0][0] !== s.points[1][0]) entity.props.restitution = .35;
    } else {
      entity.position.x = roomX(entity.position.x, entity.position.y);
      if (s.type === 'circle') { entity.props.restitution = 1.05; entity.kick = 2; }
      else if (s.width === s.height) entity.props.restitution = .75;
      else if (narrow && s.width > 3) s.width *= .68;
    }
    return entity;
  });
  return course;
}
const revisedCourses = legacyCourses.map(reviseCourse);
// Measured from the live reference: SetAsBox uses half extents; its 4-unit
// sweeper turns at -1.2 rad/s (5.236 s/revolution), over a .9-unit exit.
// New IDs preserve the exact physics of already saved races (0..9).
export const CURRENT_COURSE_OFFSET = 10;
export const ROTOR_TUNING = { fieldSpeed: 3.5, fieldSpanRatio: .25, finishSpeed: -1.2, finishLength: 4, finishMouth: 16, exitWidth: .9 } as const;
function tuneRotors(source: Course, index: number): Course {
  const course = structuredClone(source), goal = course.goalY, throat = goal - 4.25;
  course.zoomY = throat;
  // A 16-unit collecting pocket gives the final bar a 25% span, like the
  // reference's ~15.75-unit room, while retaining our own upper-course layout.
  for(const [i,x] of [[0,5],[1,21]] as const){const shape=course.entities[i].shape;if(shape.type==='polyline')shape.points[shape.points.length-1]=[x,goal-14];}
  course.entities = course.entities.map(entity => {
    if(entity.arm !== undefined){
      return { ...bar(11.45,throat,ROTOR_TUNING.finishLength/2,0,ROTOR_TUNING.finishSpeed,course.accent), arm:0, props:{...entity.props,angularVelocity:ROTOR_TUNING.finishSpeed} };
    }
    const s=entity.shape;
    if(s.type==='polyline'&&s.points.length===3&&s.points[2][1]===goal+4){
      const left=s.points[0][0]<13,x=13+(left?-1:1)*ROTOR_TUNING.exitWidth/2;
      s.points=[[left?5:21,goal-14],[x,throat],[x,goal+4]];
    }
    if(entity.type==='kinematic'&&s.type==='box'){
      if(index===0){entity.props.angularVelocity=Math.sign(entity.props.angularVelocity)*ROTOR_TUNING.fieldSpeed;}
      // Cross rotors: one broad sweeper per lane, a three-second revolution.
      // A full-width volcano arm retains its distinctive wide sweep.
      else if(index===2||index===4){s.width=(index===2?16.32:24)*ROTOR_TUNING.fieldSpanRatio/2;entity.props.angularVelocity=-2;}
      else if(index===3){s.width=16.32*.55/2;entity.props.angularVelocity=-2;}
    }
    return entity;
  });
  return course;
}
export const courses: Course[] = [...legacyCourses, ...revisedCourses, ...revisedCourses.map(tuneRotors)];
