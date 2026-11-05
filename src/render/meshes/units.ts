import * as THREE from 'three';
import { GeoBuilder, PAL, parseColour } from './builder';
import { addOutline, getCelMaterial } from '../materials';
import { atv, chickenArcher, chickenHero, chickenInfantry, chickenLeg, eggCatapult, farmer, hayRoller, pigBody, pigLeg, shotgunner, tractor } from './chickens';

export type UnitClass = 'infantry' | 'archer' | 'cavalry' | 'siege' | 'hero';
export const UNIT_CLASSES: UnitClass[] = ['infantry', 'archer', 'cavalry', 'siege', 'hero'];
export type Tint = string | number;
export type SiegeVariant = 'ram' | 'catapult';

const OUT = 0.06;

interface Limb {
  mesh: THREE.Mesh;
  phase: number;
  amp: number;
}

function legGeo(len: number, r: number, col: number): THREE.BufferGeometry {
  const b = new GeoBuilder(5);
  b.ao = false;
  // pivot at the top (hip) so rotation swings the foot
  b.cyl(0, -len, 0, r, r * 0.9, len, col, 6, { jitter: 0.02 });
  b.box(0, -len, r * 0.8, r * 2.2, r * 1.2, r * 3.2, PAL.timberDark, { jitter: 0 });
  return b.build();
}

function mesh(geo: THREE.BufferGeometry, fow?: boolean): THREE.Mesh {
  const m = new THREE.Mesh(geo, getCelMaterial({ fogOfWar: fow }));
  addOutline(m, OUT, null, fow);
  return m;
}

interface UnitRig {
  group: THREE.Group;
  rig: THREE.Group;
  limbs: Limb[];
  wheels: THREE.Object3D[];
}

function makeRig(): UnitRig {
  const group = new THREE.Group();
  const rig = new THREE.Group();
  group.add(rig);
  return { group, rig, limbs: [], wheels: [] };
}

const geoCache = new Map<string, THREE.BufferGeometry>();
function cached(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}

function wheel(r: number): THREE.BufferGeometry {
  const b = new GeoBuilder(8);
  b.ao = false;
  b.cyl(0, -0.02, 0, r, r, 0.04, PAL.timberDark, 10, { rotZ: Math.PI / 2, jitter: 0 });
  b.box(0, -r + 0.02, 0, 0.05, r * 1.7, 0.03, PAL.timberLight, { jitter: 0 });
  return b.build();
}

export type UnitFaction = 'chicken' | 'human';

/** Chibi unit figure (about 0.7 high). Class: infantry (pitchfork), archer (egg sling / shotgun), cavalry (pig / ATV), siege, hero. Chickens are ours, humans the enemy. */
export function buildUnitMesh(cls: UnitClass, tint: Tint, variant: SiegeVariant = 'ram', faction: UnitFaction = 'chicken'): THREE.Group {
  const tc = parseColour(tint, PAL.blue);
  const u = makeRig();
  const human = faction === 'human';
  u.group.name = `unit:${cls}`;
  u.group.userData['cls'] = cls;
  u.group.userData['faction'] = faction;
  const add = (m: THREE.Object3D): void => void u.rig.add(m);
  const pantsCol = 0x5a4636;
  if (cls === 'infantry' || cls === 'archer' || cls === 'hero') {
    const key = `${faction}|${cls}|${tc}`;
    const body = mesh(cached(key, () => {
      const b = new GeoBuilder(11);
      b.ao = false;
      if (human) {
        if (cls === 'infantry') farmer(b);
        else if (cls === 'archer') shotgunner(b);
        else farmer(b, 1.2, 0.24);
      } else if (cls === 'infantry') chickenInfantry(b, tc);
      else if (cls === 'archer') chickenArcher(b, tc);
      else chickenHero(b, tc);
      return b.build();
    }));
    add(body);
    const sc = cls === 'hero' ? 1.2 : 1;
    const lg = cached(`${faction}|leg|${sc}`, () => (human ? legGeo(0.2 * sc, 0.05 * sc, pantsCol) : chickenLeg(0.09 * sc, 0.03 * sc).build()));
    for (const [i, sx] of [-1, 1].entries()) {
      const m = mesh(lg);
      m.position.set(sx * (human ? 0.065 : 0.075) * sc, (human ? 0.2 : 0.095) * sc, 0);
      add(m);
      u.limbs.push({ mesh: m, phase: i * Math.PI, amp: 0.7 });
    }
  } else if (cls === 'cavalry' && human) {
    add(mesh(cached(`human|atv|${tc}`, () => {
      const b = new GeoBuilder(12);
      b.ao = false;
      atv(b);
      return b.build();
    })));
    const wg = cached('wheel', () => wheel(0.1));
    for (const sx of [-1, 1]) for (const z of [-0.22, 0.22]) {
      const m = mesh(wg);
      m.position.set(sx * 0.19, 0.1, z);
      add(m);
      u.wheels.push(m);
    }
  } else if (cls === 'cavalry') {
    add(mesh(cached(`chicken|pig|${tc}`, () => {
      const b = new GeoBuilder(12);
      b.ao = false;
      pigBody(b, tc);
      const rider = new GeoBuilder(13);
      rider.ao = false;
      chickenInfantry(rider, tc, 0.8, 0.0);
      b.append(GeoBuilder.transformed(rider, 0, 0.47, -0.02, 0, 1));
      return b.build();
    })));
    const lg = cached('pigleg', () => pigLeg().build());
    const pos: [number, number, number][] = [[-0.09, 0.22, 0.22], [0.09, 0.22, 0.22], [-0.09, 0.22, -0.22], [0.09, 0.22, -0.22]];
    pos.forEach((p, i) => {
      const m = mesh(lg);
      m.position.set(...p);
      add(m);
      u.limbs.push({ mesh: m, phase: (i % 2 === 0 ? 0 : Math.PI) + (i >= 2 ? Math.PI * 0.5 : 0), amp: 0.6 });
    });
  } else {
    const key = `${faction}|siege|${variant}|${tc}`;
    add(mesh(cached(key, () => {
      const b = new GeoBuilder(14);
      b.ao = false;
      if (human) tractor(b);
      else if (variant === 'catapult') eggCatapult(b, tc);
      else hayRoller(b, tc);
      return b.build();
    })));
    const wg = cached(human ? 'wheelBig' : 'wheel', () => wheel(human ? 0.16 : 0.1));
    for (const sx of [-1, 1]) for (const z of human ? [-0.12, 0.34] : [-0.28, 0.28]) {
      const m = mesh(wg);
      m.position.set(sx * 0.3, human ? 0.16 : 0.1, z);
      add(m);
      u.wheels.push(m);
    }
  }
  u.group.userData['limbs'] = u.limbs;
  u.group.userData['wheels'] = u.wheels;
  u.group.userData['rig'] = u.rig;
  return u.group;
}

/** Walk cycle: bob, leg swing, wheel spin. Call each frame; `moving` false gives a gentle idle sway. */
export function animateUnit(unit: THREE.Group, t: number, moving: boolean, phase = 0): void {
  const rig = unit.userData['rig'] as THREE.Group | undefined;
  const limbs = unit.userData['limbs'] as Limb[] | undefined;
  const wheels = unit.userData['wheels'] as THREE.Object3D[] | undefined;
  if (!rig || !limbs || !wheels) return;
  const w = t * 9 + phase;
  rig.position.y = moving ? Math.abs(Math.sin(w)) * 0.045 : Math.sin(t * 2 + phase) * 0.006;
  rig.rotation.z = moving ? Math.sin(w) * 0.05 : 0;
  for (const l of limbs) l.mesh.rotation.x = moving ? Math.sin(w + l.phase) * l.amp : 0;
  for (const wh of wheels) wh.rotation.x = moving ? t * 6 + phase : wh.rotation.x;
}

export type MarchComposition = Partial<Record<UnitClass, number>> | { cls: UnitClass; count: number }[];

function normalise(c: MarchComposition): [UnitClass, number][] {
  const m = new Map<UnitClass, number>();
  if (Array.isArray(c)) for (const e of c) m.set(e.cls, (m.get(e.cls) ?? 0) + e.count);
  else for (const k of Object.keys(c) as UnitClass[]) m.set(k, c[k] ?? 0);
  return [...m.entries()].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
}

/** Number of figures standing in for an army of `total` troops (3..7). */
export function figuresFor(total: number): number {
  return total <= 10 ? 3 : total <= 50 ? 4 : total <= 200 ? 5 : total <= 1000 ? 6 : 7;
}

/** 3-7 figures in a loose column behind a banner bearer, with a team banner. */
export function buildMarchGroup(composition: MarchComposition, tint: Tint, faction: UnitFaction = 'chicken'): THREE.Group {
  const list = normalise(composition);
  const total = list.reduce((a, [, n]) => a + n, 0);
  const n = figuresFor(Math.max(1, total));
  // largest remainder allocation, at least one per present class
  const alloc: UnitClass[] = [];
  for (const [c] of list.slice(0, n)) alloc.push(c);
  const base = list.length ? list : ([['infantry', 1]] as [UnitClass, number][]);
  while (alloc.length < n) {
    let best = base[0]![0], bestScore = -1;
    for (const [c, cnt] of base) {
      const have = alloc.filter((a) => a === c).length;
      const score = cnt / total / (have + 1);
      if (score > bestScore) { bestScore = score; best = c; }
    }
    alloc.push(best);
  }
  const g = new THREE.Group();
  g.name = 'march';
  const figs: THREE.Group[] = [];
  const order = alloc.sort((a, b) => (a === 'cavalry' ? -1 : 0) - (b === 'cavalry' ? -1 : 0) || (a === 'siege' ? 1 : 0) - (b === 'siege' ? 1 : 0));
  order.forEach((cls, i) => {
    const f = buildUnitMesh(cls, tint, 'ram', faction);
    const row = Math.floor((i + 1) / 2), col = i % 2 === 0 ? -1 : 1;
    f.position.set(col * 0.3 * (i === 0 ? 0 : 1), 0, -0.12 - row * 0.4);
    f.scale.setScalar(cls === 'siege' ? 0.75 : 0.8);
    f.userData['phase'] = i * 1.3;
    g.add(f);
    figs.push(f);
  });
  // banner bearer pole at the front
  const bannerGeo = cached(`march-pole|${parseColour(tint, PAL.blue)}`, () => {
    const b = new GeoBuilder(15);
    b.ao = false;
    b.cyl(0, 0, 0, 0.012, 0.014, 0.85, PAL.timberDark, 5, { jitter: 0 });
    b.sphere(0, 0.87, 0, 0.025, PAL.gold, { jitter: 0 }, 0);
    return b.build();
  });
  const pole = mesh(bannerGeo);
  pole.position.set(0, 0, 0.3);
  g.add(pole);
  const clothGeo = cached(`march-cloth|${parseColour(tint, PAL.blue)}`, () => {
    const b = new GeoBuilder(16);
    b.ao = false;
    b.box(0.12, -0.12, 0, 0.24, 0.24, 0.012, parseColour(tint, PAL.blue), { jitter: 0 });
    b.box(0.12, -0.12, 0, 0.1, 0.1, 0.016, PAL.gold, { jitter: 0 });
    return b.build();
  });
  const cloth = mesh(clothGeo);
  cloth.position.set(0.0, 0.84, 0.3);
  g.add(cloth);
  g.userData['figures'] = figs;
  g.userData['cloth'] = cloth;
  return g;
}

/** Update a march group: figures walk (or idle) and the banner flutters. */
export function animateMarch(group: THREE.Group, t: number, moving: boolean): void {
  const figs = group.userData['figures'] as THREE.Group[] | undefined;
  const cloth = group.userData['cloth'] as THREE.Mesh | undefined;
  if (figs) for (const f of figs) animateUnit(f, t, moving, (f.userData['phase'] as number | undefined) ?? 0);
  if (cloth) {
    cloth.rotation.y = Math.sin(t * (moving ? 7 : 3)) * (moving ? 0.35 : 0.15);
    cloth.rotation.z = Math.sin(t * 5 + 1) * 0.05;
  }
}

