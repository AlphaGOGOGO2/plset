import Box2DFactory from 'box2d-wasm';
import { seeded, shuffle, type DrawItem } from './domain';
import { courses, CURRENT_COURSE_OFFSET, LEGACY_COURSE_COUNT } from './courses';
import { ProgressMap } from './vendor/marble-course/progressMap';

export const MARBLE_COLORS = ['#efb58a','#85b6e9','#d0a6d8','#a6cf87','#e2969c','#ddcd8b','#83caba','#b1afe9','#efb3d2','#afcbd1'];
export const PINBALL_MAPS = courses.map(course => course.title);
// Course indices stay stable for saved draws; only the default pick and dropdown order change.
export const DEFAULT_COURSE = 14;
export const COURSE_ORDER = [DEFAULT_COURSE, 10, 11, 12, 13];
// Upgrade only a new draw's setup. A saved run must always pass its original map ID to createPinball.
export function currentCourse(map = DEFAULT_COURSE) { return map >= 0 && map < CURRENT_COURSE_OFFSET ? CURRENT_COURSE_OFFSET + map % LEGACY_COURSE_COUNT : map; }
// Older DrawRun files may omit map; the pre-revision UI default was the legacy tunnel (4).
export function replayCourse(map = 4) { return map; }
type Module = Awaited<ReturnType<typeof Box2DFactory>>;
let modulePromise: Promise<Module> | undefined;
let locations: { standard: string; simd: string } | undefined;
export function configurePinballWasm(value: typeof locations) { locations = value; }
let wasmBinary: ArrayBuffer | undefined;
export function configurePinballBinary(value: Uint8Array) { wasmBinary = new Uint8Array(value).buffer; }
// `override` lets tests and tooling run a stage that is not in `courses` (e.g. a reference map for pacing comparisons).
export async function createPinball(items: DrawItem[], seed: number, mapIndex = 0, override?: (typeof courses)[number]) {
  modulePromise ??= Box2DFactory({ ...(locations ? { locateFile: (file: string) => file.includes('.simd.') ? locations!.simd : locations!.standard } : {}), ...(wasmBinary ? { wasmBinary } : {}) });
  const box = await modulePromise, random = seeded(seed), stage = override ?? courses[mapIndex] ?? courses[0];
  const progress = ProgressMap.for(stage), gravity = new box.b2Vec2(0, 10), world = new box.b2World(gravity), vector = new box.b2Vec2(0, 0);
  const entities = (stage.entities ?? []).map(entity => {
    const def = new box.b2BodyDef(); def.set_type(entity.type === 'static' ? box.b2_staticBody : box.b2_kinematicBody);
    const body = world.CreateBody(def); box.destroy(def);
    const fixture = new box.b2FixtureDef(); fixture.set_density(entity.props.density); fixture.set_restitution(entity.props.restitution);
    const s = entity.shape;
    if (s.type === 'polyline') {
      const edge = new box.b2EdgeShape(), a = new box.b2Vec2(0, 0), b = new box.b2Vec2(0, 0);
      for (let i = 0; i < s.points.length - 1; i++) {
        a.Set(...s.points[i]); b.Set(...s.points[i + 1]); edge.SetTwoSided(a, b);
        // The original overload ignores restitution. Preserve it exactly for saved maps 0..4.
        if (stage.physicsVersion === 2) { fixture.set_shape(edge); body.CreateFixture(fixture); }
        else body.CreateFixture(edge, 1);
      }
      box.destroy(edge); box.destroy(a); box.destroy(b);
    } else {
      const shape = s.type === 'circle' ? new box.b2CircleShape() : new box.b2PolygonShape();
      if (s.type === 'circle') (shape as Box2D.b2CircleShape).set_m_radius(s.radius);
      else { vector.Set(entity.arm ?? 0, 0); (shape as Box2D.b2PolygonShape).SetAsBox(s.width, s.height, vector, s.rotation); }
      fixture.set_shape(shape); body.CreateFixture(fixture); box.destroy(shape);
    }
    box.destroy(fixture); vector.Set(entity.position.x, entity.position.y); body.SetTransform(vector, 0); body.SetAngularVelocity(entity.props.angularVelocity);
    return { body, shape: s, arm: entity.arm ?? 0, prevAngle: 0, life: entity.props.life ?? -1, rotating: entity.type === 'kinematic', motion: entity.motion, kick: entity.kick ?? 0, hitTick: -100, cooldowns: new Map<number, number>() };
  });
  const columns = 8, rows = Math.max(3, Math.ceil(items.length / columns));
  const slots = shuffle(Array.from({ length: columns * rows }, (_, i) => i), seed ^ 0x5f3759df);
  const marbles = items.map((item, index) => {
    const slot = slots[index], row = Math.floor(slot / columns);
    const x = 9.75 + slot % columns * .86 + row % 2 * .12 + (random() - .5) * .12, y = .2 + row * .8 + random() * .16;
    const def = new box.b2BodyDef(); def.set_type(box.b2_dynamicBody); vector.Set(x, y); def.set_position(vector);
    const body = world.CreateBody(def), shape = new box.b2CircleShape(); shape.set_m_radius(.25); body.CreateFixture(shape, 1 + random()); box.destroy(shape); box.destroy(def);
    return { item, index, body, x, y, px: x, py: y, stuck: 0, trail: [] as { x: number; y: number }[], distance: progress.distanceAt(x, y) };
  });
  const results: string[] = [], done = new Set<string>(); let tick = 0, disposed = false;
  function step() {
    if (disposed || results.length === items.length) return;
    tick++;
    // Remember the pre-step pose so the renderer can interpolate between physics steps (smooth slow motion).
    for (const e of entities) e.prevAngle = e.body.GetAngle();
    for (const m of marbles) { m.px = m.x; m.py = m.y; }
    for (const e of entities) if (e.motion) {
      const { amplitude, frequency, phase } = e.motion, t = tick * .01 * frequency + phase;
      e.body.SetTransform(e.body.GetPosition(), Math.sin(t) * amplitude);
      e.body.SetAngularVelocity(Math.cos(t) * amplitude * frequency);
    }
    world.Step(.01, 8, 3);
    for (const e of entities) if (e.kick > 0) {
      for (let edge = e.body.GetContactList(); box.getPointer(edge); edge = edge.next) {
        const other = edge.other, pointer = box.getPointer(other);
        if (other.GetType() !== box.b2_dynamicBody || !edge.contact.IsTouching() || tick - (e.cooldowns.get(pointer) ?? -100) < 24) continue;
        const a = e.body.GetPosition(), b = other.GetPosition(), dx = b.get_x() - a.get_x(), dy = b.get_y() - a.get_y(), length = Math.max(.01, Math.hypot(dx, dy)), mass = other.GetMass();
        vector.Set(dx / length * e.kick * mass, (dy / length * e.kick - 1.5) * mass); other.ApplyLinearImpulseToCenter(vector, true);
        e.cooldowns.set(pointer, tick); e.hitTick = tick;
      }
    }
    for (let i = entities.length - 1; i >= 0; i--) {
      const e = entities[i]; if (e.life <= 0) continue;
      const edge = e.body.GetContactList();
      if (box.getPointer(edge) && box.getPointer(edge.contact) && edge.contact.IsTouching()) { world.DestroyBody(e.body); entities.splice(i, 1); }
    }
    const crossed: { id: string; index: number; fraction: number }[] = [];
    for (const m of marbles) {
      if (done.has(m.item.id)) continue;
      const p = m.body.GetPosition(), x = p.get_x(), y = p.get_y(), previousY = m.y;
      m.stuck = (x - m.x) ** 2 + (y - m.y) ** 2 < .00001 ? m.stuck + 1 : 0;
      m.x = x; m.y = y; m.distance += (progress.distanceAt(x, y) - m.distance) * .025;
      // Stuck watchdog: a gentle nudge toward the lane centre and slightly upward, not a random pop.
      if (m.stuck >= 500) { vector.Set(Math.sign(13 - x) * (1 + random() * 1.5), -(1 + random())); m.body.ApplyLinearImpulseToCenter(vector, true); m.stuck = 0; }
      if (tick % 5 === 0) { m.trail.push({ x, y }); if (m.trail.length > 8) m.trail.shift(); }
      if (y > stage.goalY) crossed.push({ id: m.item.id, index: m.index, fraction: (stage.goalY - previousY) / Math.max(.00001, y - previousY) });
    }
    crossed.sort((a, b) => a.fraction - b.fraction || a.index - b.index).forEach(c => { done.add(c.id); results.push(c.id); world.DestroyBody(marbles[c.index].body); });
  }
  return { stage, progress, marbles, entities, results, done, step, get tick() { return tick; }, dispose() { if (disposed) return; disposed = true; box.destroy(world); box.destroy(vector); box.destroy(gravity); } };
}
