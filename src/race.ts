import * as CANNON from 'cannon-es';
import { CatmullRomCurve3, Matrix4, Quaternion, Vector3 } from 'three';
import { seeded, shuffle, type DrawItem } from './domain';

// 3D marble race (after marblerace.games): a Catmull-Rom downhill road with low walls, marbles rolling under gravity through
// bumpers, pegs, spinners, dividers, boosters and ice on a continuous road. First across the finish line wins. Deterministic from the seed
// (fixed 1/120 s steps, seeded start grid and obstacle jitter) so the control and output windows agree.
export const ROAD_HALF = 4, WALL_H = 1.3, MARBLE_R = .5, MARBLE_MASS = 5, MAX_SPEED = 34, STEP = 1 / 120, FINISH_BACK = 24, CATCH_UP_GAP = 8;
export type Feature = { kind: 'bumper'; t: number; u: number; r: number } | { kind: 'pegs'; t: number; count: number } | { kind: 'spinner'; t: number; speed: number } | { kind: 'gate'; t: number; period: number } | { kind: 'sweeper'; t: number; side: -1 | 1; period: number } | { kind: 'piston'; t: number; side: -1 | 1; period: number; lane?: number; phase?: number } | { kind: 'divider'; t: number; length: number } | { kind: 'booster'; t: number; power: number } | { kind: 'ice'; t0: number; t1: number };
export type Track = { title: string; accent: string; road: string; wall: string; sky: [string, string]; points: [number, number, number][]; features: Feature[]; sampleCount?: number };

export const tracks: Track[] = [
  {
    // 아이어 정글: long sweeping bends, peg clusters and a bumper field, a fast finishing stretch.
    title: '정글', accent: '#b8ec83', road: '#99835b', wall: '#514b31', sky: ['#173c46', '#2a6262'],
    points: [[0,68,20],[0,65,0],[0,60,-28],[-18,55,-50],[-43,50,-40],[-48,45,-10],[-30,40,15],[-8,35,5],[12,30,-25],[35,25,-48],[60,20,-30],[60,16,0],[40,12,22],[17,8,32],[8,5,55],[8,2,85],[8,0,115]],
    features: [
      { kind: 'booster', t: .08, power: 8 }, { kind: 'pegs', t: .17, count: 7 }, { kind: 'divider', t: .27, length: 8 },
      { kind: 'bumper', t: .36, u: -.5, r: .55 }, { kind: 'bumper', t: .38, u: .5, r: .55 }, { kind: 'bumper', t: .4, u: 0, r: .55 },
      { kind: 'spinner', t: .5, speed: 2.4 }, { kind: 'ice', t0: .56, t1: .64 }, { kind: 'pegs', t: .7, count: 9 },
      { kind: 'booster', t: .76, power: 9 }, { kind: 'spinner', t: .9, speed: -2.2 },
      { kind: 'gate', t: .45, period: 4.2 }, { kind: 'gate', t: .65, period: 3.8 }, { kind: 'gate', t: .83, period: 4.6 },
      {kind:'piston',t:.23,side:-1,period:4.2},{kind:'piston',t:.58,side:1,period:4.4},
      {kind:'piston',t:.9214,side:-1,lane:-1.35,period:4,phase:0},{kind:'piston',t:.9357,side:1,lane:1.35,period:4,phase:.5},
    ],
  },
  {
    // 코랄 궤도: the highest drop, a lot of boosters; a space-station feel.
    title: '은하수', accent: '#87dfff', road: '#30385b', wall: '#556591', sky: ['#080d25', '#252c56'],
    points: [[0, 110, 0], [25, 102, 25], [60, 92, 40], [95, 82, 60], [110, 72, 95], [90, 62, 130], [55, 52, 150], [20, 42, 175], [0, 32, 210], [20, 22, 245], [60, 14, 265], [100, 8, 280], [140, 2, 290], [180, 0, 300]],
    features: [
      { kind: 'booster', t: .06, power: 9 }, { kind: 'bumper', t: .15, u: -.4, r: .55 }, { kind: 'bumper', t: .16, u: .4, r: .55 },
      { kind: 'pegs', t: .33, count: 8 }, { kind: 'booster', t: .4, power: 9 },
      { kind: 'divider', t: .47, length: 10 }, { kind: 'spinner', t: .64, speed: 2.6 },
      { kind: 'bumper', t: .72, u: -.5, r: .55 }, { kind: 'bumper', t: .73, u: .5, r: .55 }, { kind: 'bumper', t: .75, u: 0, r: .55 },
      { kind: 'booster', t: .8, power: 10 }, { kind: 'pegs', t: .93, count: 6 },
      { kind: 'gate', t: .28, period: 4.2 }, { kind: 'gate', t: .57, period: 3.8 }, { kind: 'gate', t: .86, period: 4.6 },
      {kind:'piston',t:.22,side:1,period:4.2},{kind:'piston',t:.60,side:-1,period:4.4},
      {kind:'piston',t:.9286,side:-1,lane:-1.35,period:4,phase:0},{kind:'piston',t:.9429,side:1,lane:1.35,period:4,phase:.5},
    ],
  },
  {
    // 칼디르 빙원: switchbacks over ice, few obstacles, speed is the danger.
    title: '설산', accent: '#73c7ef', road: '#cfdfeb', wall: '#f4f8fc', sky: ['#91c6e4', '#dceaf3'],
    points: [[0,82,20],[0,77,-10],[-18,70,-38],[-48,63,-40],[-65,56,-15],[-48,49,10],[-20,42,5],[3,35,-20],[30,28,-38],[58,22,-15],[50,17,15],[26,13,30],[0,9,25],[-20,6,45],[-20,3,80],[-20,0,115]],
    features: [
      { kind: 'ice', t0: .05, t1: .2 }, { kind: 'booster', t: .22, power: 8 }, { kind: 'pegs', t: .3, count: 6 },
      { kind: 'ice', t0: .36, t1: .5 }, { kind: 'bumper', t: .54, u: -.45, r: .55 }, { kind: 'bumper', t: .56, u: .45, r: .55 },
      { kind: 'spinner', t: .71, speed: 2.2 }, { kind: 'ice', t0: .76, t1: .9 }, { kind: 'booster', t: .92, power: 9 },
      { kind: 'gate', t: .43, period: 4.2 }, { kind: 'gate', t: .63, period: 3.8 }, { kind: 'gate', t: .84, period: 4.6 },
      {kind:'piston',t:.25,side:-1,period:4.2},{kind:'piston',t:.88,side:1,period:4.4},
      {kind:'piston',t:.9286,side:-1,lane:-1.35,period:4,phase:0},{kind:'piston',t:.9414,side:1,lane:1.35,period:4,phase:.5},
    ],
  },
  {
    title: '도심', accent: '#ffcd71', road: '#4b5267', wall: '#8190ac', sky: ['#111a34', '#37405c'],
    points: [[0,64,20],[0,60,-10],[-20,55,-30],[-50,50,-30],[-70,44,-50],[-60,38,-75],[-25,32,-80],[10,27,-80],[45,22,-65],[55,18,-35],[35,14,-10],[12,10,10],[12,6,45],[12,2,80],[12,0,110]],
    features: [{kind:'booster',t:.08,power:8},{kind:'pegs',t:.19,count:8},{kind:'divider',t:.3,length:12},{kind:'spinner',t:.4,speed:-2},{kind:'bumper',t:.48,u:-.5,r:.7},{kind:'bumper',t:.5,u:.5,r:.7},{kind:'booster',t:.58,power:9},{kind:'pegs',t:.73,count:7},{kind:'spinner',t:.82,speed:2.2},{kind:'booster',t:.9,power:8},{kind:'gate',t:.35,period:4.2},{kind:'gate',t:.65,period:3.8},{kind:'gate',t:.87,period:4.6},
      {kind:'piston',t:.24,side:1,period:4.2},{kind:'piston',t:.60,side:-1,period:4.4},
      {kind:'piston',t:.9114,side:-1,lane:-1.35,period:4,phase:0},{kind:'piston',t:.9271,side:1,lane:1.35,period:4,phase:.5}],
  },
  {
    title: '화산', accent: '#ff9858', road: '#5b4240', wall: '#a05b43', sky: ['#321b2a', '#793d36'],
    points: [[0,76,20],[0,72,-8],[-18,65,-30],[-42,58,-15],[-36,51,15],[-12,44,28],[14,38,7],[20,32,-25],[0,27,-50],[-28,22,-55],[-50,18,-30],[-45,14,0],[-20,10,20],[8,6,40],[18,3,75],[18,0,110]],
    features: [{kind:'booster',t:.06,power:8},{kind:'bumper',t:.15,u:-.5,r:.8},{kind:'bumper',t:.18,u:.5,r:.8},{kind:'pegs',t:.27,count:8},{kind:'spinner',t:.46,speed:2},{kind:'divider',t:.56,length:12},{kind:'booster',t:.64,power:10},{kind:'pegs',t:.78,count:8},{kind:'spinner',t:.87,speed:-2.4},{kind:'gate',t:.35,period:4.2},{kind:'gate',t:.7,period:3.8},{kind:'gate',t:.92,period:4.6},
      {kind:'piston',t:.24,side:-1,period:4.2},{kind:'piston',t:.60,side:1,period:4.4},
      {kind:'piston',t:.9286,side:-1,lane:-1.35,period:4,phase:0},{kind:'piston',t:.9414,side:1,lane:1.35,period:4,phase:.5}],
  },
  {
    // Long canyon traverses: three broad reversals, with room to build speed
    // between them. Dense sampling keeps the long road's collision mesh smooth.
    title: '협곡', accent: '#ffd294', road: '#b98656', wall: '#76523d', sky: ['#7192a0', '#e8c797'], sampleCount: 1400,
    points: [[-100,145,30],[-100,141,0],[-65,133,-18],[70,118,-48],[100,110,-68],[105,104,-88],[70,98,-108],[-70,80,-138],[-100,73,-158],[-105,67,-178],[-70,61,-198],[70,43,-228],[100,36,-248],[105,30,-268],[70,25,-288],[-70,12,-318],[-100,8,-338],[-100,4,-370],[-100,0,-410]],
    features: [
      {kind:'booster',t:.07,power:8},{kind:'sweeper',t:.14,side:1,period:4.6},{kind:'sweeper',t:.18,side:-1,period:5.2},
      {kind:'gate',t:.25,period:4.8},{kind:'booster',t:.32,power:8},{kind:'divider',t:.38,length:18},
      {kind:'bumper',t:.42,u:-.5,r:.7},{kind:'bumper',t:.44,u:.5,r:.7},{kind:'sweeper',t:.48,side:-1,period:4.5},
      {kind:'booster',t:.55,power:9},{kind:'bumper',t:.59,u:-.4,r:.75},{kind:'bumper',t:.61,u:.4,r:.75},
      {kind:'gate',t:.66,period:4.4},{kind:'sweeper',t:.71,side:1,period:5.1},
      {kind:'booster',t:.79,power:8},{kind:'sweeper',t:.83,side:-1,period:4.2},{kind:'sweeper',t:.86,side:1,period:4.8},{kind:'spinner',t:.93,speed:1.8},
      {kind:'piston',t:.10,side:-1,period:4.2},{kind:'piston',t:.115,side:1,period:4.2},
      {kind:'piston',t:.34,side:1,period:4.4},{kind:'piston',t:.355,side:-1,period:4.4},
      {kind:'piston',t:.755,side:-1,period:4},{kind:'piston',t:.77,side:1,period:4},
      {kind:'piston',t:.9643,side:-1,lane:-1.35,period:4,phase:0},{kind:'piston',t:.9707,side:1,lane:1.35,period:4,phase:.5},
    ],
  },
];
export const RACE_THEMES = [
  { icon: '🌴', subtitle: 'JUNGLE RUN', detail: '숲속 나무다리 · 범퍼 · 회전 게이트' },
  { icon: '🌌', subtitle: 'GALAXY RUN', detail: '우주 고가 트랙 · 급커브 · 가속 패드' },
  { icon: '🏔️', subtitle: 'ALPINE RUN', detail: '눈 덮인 능선 · 빙판 · 헤어핀' },
  { icon: '🌃', subtitle: 'CITY RUN', detail: '네온 스카이라인 · 터널 · 핀볼' },
  { icon: '🌋', subtitle: 'VOLCANO RUN', detail: '용암 계곡 · 현무암 · 회전 장애물' },
  { icon: '🏜️', subtitle: 'CANYON CROSSING', detail: '긴 협곡 횡단 · 큰 지그재그 · 마지막 역전' },
];
export const RACE_TRACKS = tracks.map(t => t.title);

export type Sample = { p: Vector3; tangent: Vector3; side: Vector3; up: Vector3; s: number; t: number; ice: boolean; gap: boolean };
// Sample the centre line: y is forced to never climb (the course only goes down), and cumulative length `s` drives progress.
export function sampleTrack(track: Track, count = track.sampleCount ?? 700): Sample[] {
  const curve = new CatmullRomCurve3(track.points.map(([x, y, z]) => new Vector3(x, y, z)), false, 'centripetal');
  if (track.sampleCount) { curve.arcLengthDivisions = count; curve.updateArcLengths(); }
  const tangentAt = (t: number) => track.sampleCount ? curve.getTangentAt(t) : curve.getTangent(t);
  const samples: Sample[] = []; let s = 0, lastY = Infinity;
  for (let i = 0; i <= count; i++) {
    const t = i / count, p = track.sampleCount ? curve.getPointAt(t) : curve.getPoint(t); if (p.y > lastY) p.y = lastY; lastY = p.y;
    const tangent = tangentAt(t).normalize(), up = new Vector3(0, 1, 0), side = new Vector3().crossVectors(tangent, up).normalize(); up.crossVectors(side, tangent).normalize();
    const before = tangentAt(Math.max(0,t-.012)), after = tangentAt(Math.min(1,t+.012));
    const bank = Math.max(-.28,Math.min(.28,(before.x*after.z-before.z*after.x)*.9));
    side.applyAxisAngle(tangent,bank); up.applyAxisAngle(tangent,bank);
    if (i) s += p.distanceTo(samples[i - 1].p);
    samples.push({ p, tangent, side, up, s, t, ice: track.features.some(f => f.kind === 'ice' && t >= f.t0 && t <= f.t1), gap: false });
  }
  return samples;
}
// Road and wall triangles as flat arrays (shared by physics and rendering). Every adjacent pair remains connected.
export function roadGeometry(samples: Sample[]) {
  const road: number[] = [], roadIdx: number[] = [], wall: number[] = [], wallIdx: number[] = [];
  const push = (arr: number[], v: Vector3) => { arr.push(v.x, v.y, v.z); return arr.length / 3 - 1; };
  for (let i = 0; i < samples.length - 1; i++) {
    const a = samples[i], b = samples[i + 1]; if (a.gap || b.gap) continue;
    const aL = a.p.clone().addScaledVector(a.side, -ROAD_HALF), aR = a.p.clone().addScaledVector(a.side, ROAD_HALF), bL = b.p.clone().addScaledVector(b.side, -ROAD_HALF), bR = b.p.clone().addScaledVector(b.side, ROAD_HALF);
    const i0 = push(road, aL), i1 = push(road, aR), i2 = push(road, bR), i3 = push(road, bL); roadIdx.push(i0, i1, i2, i0, i2, i3);
    for (const [p0, p1] of [[aL, bL], [aR, bR]] as const) { const j0 = push(wall, p0), j1 = push(wall, p1), j2 = push(wall, p1.clone().addScaledVector(b.up, WALL_H)), j3 = push(wall, p0.clone().addScaledVector(a.up, WALL_H)); wallIdx.push(j0, j1, j2, j0, j2, j3); }
  }
  return { road, roadIdx, wall, wallIdx };
}
export const sampleAt = (samples: Sample[], t: number) => samples[Math.max(0, Math.min(samples.length - 1, Math.round(t * (samples.length - 1))))];

// Top of the rising pillar relative to the road. Hold fully below the surface
// for 45% of each cycle, then rise, pause and lower with eased motion.
export function pistonTop(time: number, period: number, phase = 0) {
  const cycle = ((time / period + phase) % 1 + 1) % 1;
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const lift = cycle < .45 ? 0 : cycle < .6 ? smooth((cycle - .45) / .15) : cycle < .8 ? 1 : 1 - smooth((cycle - .8) / .2);
  return -.18 + lift * 1.28;
}
export type Obstacle = { kind: 'bumper' | 'peg' | 'spinner' | 'divider' | 'gate' | 'sweeper' | 'piston'; body: CANNON.Body; size: number[]; };
export async function createRace(items: DrawItem[], seed: number, trackIndex = 0) {
  const random = seeded(seed), track = tracks[trackIndex] ?? tracks[0], samples = sampleTrack(track), geometry = roadGeometry(samples);
  const length = samples[samples.length - 1].s, finish = length - FINISH_BACK;
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -25, 0) }); world.broadphase = new CANNON.SAPBroadphase(world); world.allowSleep = false;
  const roadMat = new CANNON.Material('road'), wallMat = new CANNON.Material('wall'), marbleMat = new CANNON.Material('marble'), iceMat = new CANNON.Material('ice'), bumperMat = new CANNON.Material('bumper');
  world.addContactMaterial(new CANNON.ContactMaterial(marbleMat, roadMat, { friction: .05, restitution: .08 }));
  world.addContactMaterial(new CANNON.ContactMaterial(iceMat, roadMat, { friction: .004, restitution: .05 }));
  world.addContactMaterial(new CANNON.ContactMaterial(marbleMat, wallMat, { friction: 0, restitution: .32 })); world.addContactMaterial(new CANNON.ContactMaterial(iceMat, wallMat, { friction: 0, restitution: .32 }));
  world.addContactMaterial(new CANNON.ContactMaterial(marbleMat, marbleMat, { friction: .02, restitution: .6 })); world.addContactMaterial(new CANNON.ContactMaterial(iceMat, marbleMat, { friction: .02, restitution: .6 })); world.addContactMaterial(new CANNON.ContactMaterial(iceMat, iceMat, { friction: .02, restitution: .6 }));
  world.addContactMaterial(new CANNON.ContactMaterial(marbleMat, bumperMat, { friction: 0, restitution: 1.15 })); world.addContactMaterial(new CANNON.ContactMaterial(iceMat, bumperMat, { friction: 0, restitution: 1.15 }));
  // Small, locally centered collision meshes let SAP discard distant road sections.
  // One world-sized mesh made every marble query the entire course on every tick.
  for(let from=0;from<samples.length-1;from+=24){
    const section=samples.slice(from,Math.min(samples.length,from+25)),mesh=roadGeometry(section),origin=section[Math.floor(section.length/2)].p;
    for(const [vertices,indices,material] of [[mesh.road,mesh.roadIdx,roadMat],[mesh.wall,mesh.wallIdx,wallMat]] as const){
      if(!indices.length)continue;
      const local=vertices.map((v,i)=>v-(i%3===0?origin.x:i%3===1?origin.y:origin.z));
      const body=new CANNON.Body({type:CANNON.Body.STATIC,material,position:new CANNON.Vec3(origin.x,origin.y,origin.z)});
      body.addShape(new CANNON.Trimesh(local,indices));world.addBody(body);
    }
  }
  const obstacles: Obstacle[] = []; const jitter = () => (random() - .5) * .6;
  const gates: { body: CANNON.Body; q: Sample; phase: number; omega: number }[] = [];
  const sweepers: { body: CANNON.Body; q: Sample; pivot: Vector3; side: number; phase: number; omega: number; angle: number }[] = [];
  const pistons: { body: CANNON.Body; q: Sample; base: Vector3; period: number; phase: number }[] = [];
  // Separate phase stream keeps obstacle timing independent of player identity and grid size.
  const gateRandom = seeded(seed ^ 0x6a09e667);
  const pistonRandom = seeded(seed ^ 0x1f83d9ab);
  for (const f of track.features) {
    if (f.kind === 'piston') {
      const q=sampleAt(samples,f.t),lane=f.lane??f.side*3.25,base=q.p.clone().addScaledVector(q.side,lane),phase=f.phase??pistonRandom();
      const pos=base.clone().addScaledVector(q.up,pistonTop(0,f.period,phase)-.6);
      const body=new CANNON.Body({type:CANNON.Body.KINEMATIC,material:wallMat,position:new CANNON.Vec3(pos.x,pos.y,pos.z)});
      body.quaternion.setFromVectors(new CANNON.Vec3(0,1,0),new CANNON.Vec3(q.up.x,q.up.y,q.up.z));
      body.addShape(new CANNON.Cylinder(.42,.42,1.2,12));world.addBody(body);
      obstacles.push({kind:'piston',body,size:[.42,1.2,f.t,lane]});pistons.push({body,q,base,period:f.period,phase});
    }
    if (f.kind === 'sweeper') {
      const q=sampleAt(samples,f.t),phase=gateRandom()*Math.PI*2,omega=Math.PI*2/f.period,angle=Math.sin(phase)*.95;
      // The hinge side needs a through-lane too: a 1 m marble plus .5 m
      // clearance outside the visible .38 m hinge, throughout the whole swing.
      const pivotOffset=ROAD_HALF-MARBLE_R*2-.5-.38;
      const pivot=q.p.clone().addScaledVector(q.side,f.side*pivotOffset).addScaledVector(q.up,.55);
      const pos=pivot.clone().addScaledVector(q.side,-f.side*1.9*Math.cos(angle)).addScaledVector(q.tangent,-f.side*1.9*Math.sin(angle));
      const rotation=new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(q.side,q.up,q.tangent.clone().negate())).multiply(new Quaternion().setFromAxisAngle(new Vector3(0,1,0),angle));
      const body=new CANNON.Body({type:CANNON.Body.KINEMATIC,material:wallMat,position:new CANNON.Vec3(pos.x,pos.y,pos.z)});
      body.quaternion.set(rotation.x,rotation.y,rotation.z,rotation.w);body.addShape(new CANNON.Box(new CANNON.Vec3(1.9,.28,.18)));world.addBody(body);
      obstacles.push({kind:'sweeper',body,size:[1.9,.28,.18,f.side]});sweepers.push({body,q,pivot,side:f.side,phase,omega,angle});
    }
    if (f.kind === 'gate') {
      const q=sampleAt(samples,f.t),phase=gateRandom()*Math.PI*2,omega=Math.PI*2/f.period;
      const pos=q.p.clone().addScaledVector(q.up,.8).addScaledVector(q.side,Math.sin(phase)*2.2);
      const rotation=new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(q.side,q.up,q.tangent.clone().negate()));
      const body=new CANNON.Body({type:CANNON.Body.KINEMATIC,material:wallMat,position:new CANNON.Vec3(pos.x,pos.y,pos.z)});
      body.quaternion.set(rotation.x,rotation.y,rotation.z,rotation.w);body.addShape(new CANNON.Box(new CANNON.Vec3(2.8,.8,.4)));world.addBody(body);
      obstacles.push({kind:'gate',body,size:[2.8,.8,.4]});gates.push({body,q,phase,omega});
    }
    if (f.kind === 'bumper') { const q = sampleAt(samples, f.t), pos = q.p.clone().addScaledVector(q.side, f.u * (ROAD_HALF - 1) + jitter()).addScaledVector(q.up, f.r); const body = new CANNON.Body({ type: CANNON.Body.STATIC, material: bumperMat, position: new CANNON.Vec3(pos.x, pos.y, pos.z) }); body.addShape(new CANNON.Sphere(f.r)); world.addBody(body); obstacles.push({ kind: 'bumper', body, size: [f.r] }); }
    else if (f.kind === 'pegs') for (let i = 0; i < f.count; i++) {
      const q = sampleAt(samples, f.t + (i % 3) * .006), radius = .28;
      // Keep a full marble diameter plus clearance between each outer peg and wall,
      // including seeded jitter. Otherwise the downhill force wedges balls in the gap.
      const limit = ROAD_HALF - radius - MARBLE_R * 2 - .3;
      const u = Math.max(-limit, Math.min(limit, (i / (f.count - 1) - .5) * 2 * (ROAD_HALF - 1.2) + jitter()));
      const pos = q.p.clone().addScaledVector(q.side, u).addScaledVector(q.up, .5);
      const body = new CANNON.Body({ type: CANNON.Body.STATIC, material: bumperMat, position: new CANNON.Vec3(pos.x, pos.y, pos.z) });
      body.quaternion.setFromVectors(new CANNON.Vec3(0, 1, 0), new CANNON.Vec3(q.up.x, q.up.y, q.up.z));
      body.addShape(new CANNON.Cylinder(radius, radius, 1, 8)); world.addBody(body); obstacles.push({ kind: 'peg', body, size: [radius, 1] });
    }
    else if (f.kind === 'spinner') { const q = sampleAt(samples, f.t), pos = q.p.clone().addScaledVector(q.up, .5), body = new CANNON.Body({ type: CANNON.Body.KINEMATIC, material: wallMat, position: new CANNON.Vec3(pos.x, pos.y, pos.z) }); body.addShape(new CANNON.Box(new CANNON.Vec3(ROAD_HALF - .4, .3, .25))); body.angularVelocity.set(0, f.speed, 0); world.addBody(body); obstacles.push({ kind: 'spinner', body, size: [ROAD_HALF - .4, .3, .25] }); }
    else if (f.kind === 'divider') { const q = sampleAt(samples, f.t), pos = q.p.clone().addScaledVector(q.up, .6), body = new CANNON.Body({ type: CANNON.Body.STATIC, material: wallMat, position: new CANNON.Vec3(pos.x, pos.y, pos.z) }); body.quaternion.setFromVectors(new CANNON.Vec3(0, 0, 1), new CANNON.Vec3(q.tangent.x, q.tangent.y, q.tangent.z)); body.addShape(new CANNON.Box(new CANNON.Vec3(.25, .6, f.length / 2))); world.addBody(body); obstacles.push({ kind: 'divider', body, size: [.25, .6, f.length / 2] }); }
  }
  const boosters = track.features.filter((f): f is Extract<Feature, { kind: 'booster' }> => f.kind === 'booster').map(f => ({ ...f, s: sampleAt(samples, f.t).s }));
  // Start grid: five across, rows back up the road, slot order shuffled by the seed. Marbles are frozen until start().
  const slots = shuffle(Array.from({ length: Math.max(items.length, 1) }, (_, i) => i), seed ^ 0x2545f491), startSample = samples.find(s=>s.s>=9) ?? samples[0];
  const marbles = items.map((item, index) => {
    const slot = slots[index], col = slot % 5, rowIndex = Math.floor(slot / 5);
    const pos = startSample.p.clone().addScaledVector(startSample.side, (col - 2) * 1.4).addScaledVector(startSample.tangent, -rowIndex * 1.3).addScaledVector(startSample.up, MARBLE_R + .1);
    const body = new CANNON.Body({ mass: MARBLE_MASS, material: marbleMat, position: new CANNON.Vec3(pos.x, pos.y, pos.z), linearDamping: .01, angularDamping: .08 }); body.addShape(new CANNON.Sphere(MARBLE_R)); body.type = CANNON.Body.STATIC; world.addBody(body);
    const sampleIndex = samples.reduce((best, q, i) => q.p.distanceToSquared(pos) < samples[best].p.distanceToSquared(pos) ? i : best, 0);
    return { item, index, body, x: pos.x, y: pos.y, z: pos.z, px: pos.x, py: pos.y, pz: pos.z, sampleIndex, safeSampleIndex: sampleIndex, progress: samples[sampleIndex].s, boostAt: -100, onIce: false, bestProgress: samples[sampleIndex].s, stall: 0, stalls: 0, recoveries: 0 };
  });
  const results: string[] = [], done = new Set<string>(), finishTicks = new Map<string, number>(); let tick = 0, started = false, disposed = false;
  const nearest = (m: typeof marbles[number]) => { let best = m.sampleIndex, bestD = Infinity; for (let i = Math.max(0, m.sampleIndex - 30); i <= Math.min(samples.length - 1, m.sampleIndex + 60); i++) { const q = samples[i].p, d = (q.x - m.x) ** 2 + (q.y - m.y) ** 2 + (q.z - m.z) ** 2; if (d < bestD) { bestD = d; best = i; } } return best; };
  function recover(m: typeof marbles[number], from: number) {
    // Search sideways, then backwards from the last road position. Never skip
    // forward over an obstacle, and avoid respawning inside a peg or divider.
    for (let i = from; i >= 0; i--) for (const lane of [0, -1.4, 1.4, -2.8, 2.8]) {
      const q = samples[i], spot = q.p.clone().addScaledVector(q.side, lane).addScaledVector(q.up, MARBLE_R + .12);
      const point = new CANNON.Vec3(spot.x, spot.y, spot.z), clearance = MARBLE_R + .12;
      const blocked = obstacles.some(o => {
        const local = o.body.pointToLocalFrame(point);
        if (o.kind === 'bumper') return local.length() < o.size[0] + clearance;
        if (o.kind === 'peg' || o.kind === 'piston') return Math.hypot(Math.max(0, Math.hypot(local.x, local.z) - o.size[0]), Math.max(0, Math.abs(local.y) - o.size[1] / 2)) < clearance;
        return Math.hypot(Math.max(0, Math.abs(local.x) - o.size[0]), Math.max(0, Math.abs(local.y) - o.size[1]), Math.max(0, Math.abs(local.z) - o.size[2])) < clearance;
      }) || marbles.some(other => other !== m && !done.has(other.item.id) && other.body.position.distanceTo(point) < MARBLE_R * 2 + .1);
      if (blocked) continue;
      m.body.position.copy(point); m.body.previousPosition.copy(point); m.body.interpolatedPosition.copy(point);
      m.body.velocity.set(q.tangent.x * 2, q.tangent.y * 2, q.tangent.z * 2); m.body.angularVelocity.set(0, 0, 0);
      m.body.aabbNeedsUpdate = true; m.body.wakeUp();
      m.x = m.px = spot.x; m.y = m.py = spot.y; m.z = m.pz = spot.z;
      m.sampleIndex = m.safeSampleIndex = i; m.progress = m.bestProgress = q.s;
      m.stall = m.stalls = 0; m.boostAt = tick; m.recoveries++;
      return;
    }
  }
  function start() { if (started) return; started = true; for (const m of marbles) { m.body.type = CANNON.Body.DYNAMIC; m.body.wakeUp(); } }
  function step() {
    if (disposed || results.length === items.length) return;
    tick++;
    for (const m of marbles) { m.px = m.x; m.py = m.y; m.pz = m.z; }
    const live = marbles.filter(m => !done.has(m.item.id)), leader = live.reduce((best, m) => Math.max(best, m.progress), 0);
    // Translate through physical velocity so the moving opening pushes marbles naturally.
    // Even at the centre there are two 1.2 m passages; the road is never completely sealed.
    if(started)for(const {body,q,phase,omega} of gates){
      const current=(body.position.x-q.p.x)*q.side.x+(body.position.y-q.p.y)*q.side.y+(body.position.z-q.p.z)*q.side.z;
      // Yield at a trapped marble instead of crushing it through the wall. Once
      // the gap clears, resume at the gate's normal speed (never catch up in a jump).
      const travel=2.2*omega*STEP;
      let offset=Math.max(current-travel,Math.min(current+travel,Math.sin(phase+tick*STEP*omega)*2.2));
      for(const m of live){
        const dx=m.x-q.p.x,dy=m.y-q.p.y,dz=m.z-q.p.z;
        const lane=dx*q.side.x+dy*q.side.y+dz*q.side.z;
        if(Math.abs(lane)<ROAD_HALF-MARBLE_R-.2)continue;
        const along=dx*q.tangent.x+dy*q.tangent.y+dz*q.tangent.z;
        const height=dx*q.up.x+dy*q.up.y+dz*q.up.z;
        const depthGap=Math.max(0,Math.abs(along)-.4),heightGap=Math.max(0,-height,height-1.6);
        const contactRadius2=(MARBLE_R+.02)**2-depthGap**2-heightGap**2;
        if(contactRadius2<=0)continue;
        const reach=2.8+Math.sqrt(contactRadius2);
        if(offset>current&&lane>current+2.8)offset=Math.min(offset,Math.max(current,lane-reach));
        else if(offset<current&&lane<current-2.8)offset=Math.max(offset,Math.min(current,lane+reach));
      }
      body.velocity.set((q.p.x+q.up.x*.8+q.side.x*offset-body.position.x)/STEP,(q.p.y+q.up.y*.8+q.side.y*offset-body.position.y)/STEP,(q.p.z+q.up.z*.8+q.side.z*offset-body.position.z)/STEP);
    }
    if(started)for(const arm of sweepers){
      const {body,q,pivot,side,phase,omega}=arm,angle=Math.sin(phase+tick*STEP*omega)*.95;
      const pos=pivot.clone().addScaledVector(q.side,-side*1.9*Math.cos(angle)).addScaledVector(q.tangent,-side*1.9*Math.sin(angle));
      body.velocity.set((pos.x-body.position.x)/STEP,(pos.y-body.position.y)/STEP,(pos.z-body.position.z)/STEP);
      const speed=(angle-arm.angle)/STEP;body.angularVelocity.set(q.up.x*speed,q.up.y*speed,q.up.z*speed);arm.angle=angle;
    }
    if(started)for(const {body,q,base,period,phase} of pistons){
      const pos=base.clone().addScaledVector(q.up,pistonTop(tick*STEP,period,phase)-.6);
      body.velocity.set((pos.x-body.position.x)/STEP,(pos.y-body.position.y)/STEP,(pos.z-body.position.z)/STEP);
    }
    if (started) for (const m of live) {
      const q = samples[m.sampleIndex], v = m.body.velocity;
      // Catch-up assist for anyone far behind the leader; boosters add speed along the road once per pass.
      // Close stretched packs gradually; fade the assist out before the finishing sprint.
      const gap = leader - m.progress; if (gap > CATCH_UP_GAP) { const fade=Math.max(0,Math.min(1,(finish-m.progress-14)/36)),a = Math.min(4.8, (gap - CATCH_UP_GAP) * .16) * fade * STEP; v.x += q.tangent.x * a; v.y += q.tangent.y * a; v.z += q.tangent.z * a; }
      for (const z of boosters) if (tick - m.boostAt > 90 && Math.abs(m.progress - z.s) < 2.5) { v.x += q.tangent.x * z.power; v.y += q.tangent.y * z.power; v.z += q.tangent.z * z.power; m.boostAt = tick; }
      const ice = q.ice; if (ice !== m.onIce) { m.onIce = ice; m.body.material = ice ? iceMat : marbleMat; }
      const speed = v.length(); if (speed > MAX_SPEED) v.scale(MAX_SPEED / speed, v);
    }
    world.step(STEP);
    for (const m of live) {
      m.x = m.body.position.x; m.y = m.body.position.y; m.z = m.body.position.z; m.sampleIndex = nearest(m); m.progress = samples[m.sampleIndex].s;
      if (!started) continue;
      // Remember only positions near the road surface. Airborne movement must
      // not advance the checkpoint used to recover a fallen marble.
      const q = samples[m.sampleIndex], off = m.body.position.vsub(new CANNON.Vec3(q.p.x, q.p.y, q.p.z));
      const lateral = off.x * q.side.x + off.y * q.side.y + off.z * q.side.z;
      const height = off.x * q.up.x + off.y * q.up.y + off.z * q.up.z;
      // Waiting for a moving opening is not a stall. Actual falls still recover.
      const atGate = gates.some(g => Math.abs(q.s - g.q.s) < 2 && height >= MARBLE_R - .2 && height <= WALL_H);
      if (Math.abs(lateral) <= ROAD_HALF - MARBLE_R + .1 && height >= MARBLE_R - .2 && height <= MARBLE_R + .3) m.safeSampleIndex = m.sampleIndex;
      if (height < -1.5 || Math.abs(lateral) > ROAD_HALF + MARBLE_R || off.length() > ROAD_HALF + 9) { recover(m, Math.min(m.sampleIndex, m.safeSampleIndex)); continue; }
      // First try a small physical push. Repeated stalls restart alongside or
      // behind the same position, rather than teleporting down the course.
      if (m.progress > m.bestProgress + .05) { m.bestProgress = m.progress; m.stall = 0; m.stalls = 0; }
      else if (atGate) { m.stall = 0; m.stalls = 0; }
      else if (++m.stall >= 480) { m.stall = 0; if (m.stalls++ === 0) m.body.velocity.vadd(new CANNON.Vec3(q.tangent.x * 3, .5, q.tangent.z * 3), m.body.velocity); else recover(m, Math.min(m.sampleIndex, m.safeSampleIndex)); }
    }
    if (started) {
      const crossed = live.filter(m => m.progress >= finish).sort((p, q) => q.progress - p.progress || p.index - q.index);
      for (const m of crossed) { done.add(m.item.id); results.push(m.item.id); finishTicks.set(m.item.id, tick); world.removeBody(m.body); }
    }
  }
  return { track, samples, geometry, obstacles, boosters, marbles, results, done, finishTicks, length, finish, start, step, get tick() { return tick; }, get started() { return started; }, dispose() { disposed = true; } };
}
export const seconds = (ticks: number) => `${(ticks * STEP).toFixed(2)}초`;
