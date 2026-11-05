import * as THREE from 'three';
import { GeoBuilder, PAL, parseColour, type Col } from './builder';
import { addOutline, getCelMaterial } from '../materials';
import { getIconCanvas } from '../../gen/icons';
import { banner as bannerPart, fence, flag, hut, smokePuff, crate, logPile, FARM, picketFence, roundBox, barnRoof, softGable, face, comb, weathervaneRooster, archDoor, hayBale, nest, miniChicken } from './buildings/parts';
import { makeOak, makePine, makeRockVariant } from './props';

export type NodeKind = 'forest' | 'farmland' | 'quarry' | 'gold' | 'ember';
export type PoiKind = 'camp' | 'lair' | 'boss' | 'ruin' | 'village' | 'shrine' | 'cache' | 'capital';
export type MarkerKind = NodeKind | PoiKind;
export type Faction = 'bandit' | 'ally' | 'neutral' | 'player';

export interface MarkerOpts {
  faction?: Faction;
  /** Skull count on the banner (1..5). Defaults to the tier for hostile POIs, 0 otherwise. */
  danger?: number;
  /** Floating icon disc above the model (default true). */
  icon?: boolean;
  /** Colour-blind mode: add a shape badge (triangle hostile, circle node, square village, diamond other) beside the icon. */
  colourBlind?: boolean;
  /** Override banner colour (`#rrggbb`), e.g. a lord's colour. */
  banner?: string;
  fogOfWar?: boolean;
  cleared?: boolean;
}

export const NODE_KINDS: NodeKind[] = ['forest', 'farmland', 'quarry', 'gold', 'ember'];
export const POI_KINDS: PoiKind[] = ['camp', 'lair', 'boss', 'ruin', 'village', 'shrine', 'cache', 'capital'];

const FACTION_COL: Record<Faction, number> = { bandit: PAL.bandit, ally: PAL.ally, neutral: PAL.neutral, player: PAL.blue };
const ICON: Record<MarkerKind, string> = {
  forest: 'log', farmland: 'wheat', quarry: 'rock', gold: 'coin', ember: 'flame',
  camp: 'skull', lair: 'skull', boss: 'skull', ruin: 'quest', village: 'pop', shrine: 'research', cache: 'gift', capital: 'cat_core',
};

/* ---------- small shape helpers ---------- */

function crystal(b: GeoBuilder, x: number, y0: number, z: number, r: number, h: number, col: Col, emit: number, tilt = 0, rotY = 0): void {
  b.cone(x, y0, z, r, h, col, 5, { emit, rotZ: tilt, rotY, jitter: 0.04 });
  b.cone(x, y0, z, r, h * 0.3, col, 5, { emit: emit * 0.6, rotX: Math.PI, rotZ: -tilt, rotY, jitter: 0.04 });
}

function rocks(b: GeoBuilder, spots: [number, number, number, number][], pal: number[] = PAL.boulder, dark = PAL.boulderDark): void {
  spots.forEach(([x, z, s, v], i) => {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, 0.1 * s, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), i * 1.7), new THREE.Vector3(s, s, s));
    b.merge(rockGeo(v, pal, dark), m);
  });
}
const rockCache = new Map<string, THREE.BufferGeometry>();
function rockGeo(v: number, pal: number[], dark: number): THREE.BufferGeometry {
  const key = `${v}|${pal[0]}|${dark}`;
  let g = rockCache.get(key);
  if (!g) {
    g = makeRockVariant(v, pal, dark);
    rockCache.set(key, g);
  }
  return g;
}
const treeCache: THREE.BufferGeometry[] = [];
function tree(i: number): THREE.BufferGeometry {
  if (!treeCache[i]) treeCache[i] = i < 3 ? makePine(i, false) : makeOak(i - 3);
  return treeCache[i]!;
}
function tr(x: number, y: number, z: number, s: number, rot = 0): THREE.Matrix4 {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot), new THREE.Vector3(s, s, s));
}

/* ---------- resource node models ---------- */

function forestNode(b: GeoBuilder, tier: number): void {
  const spots: [number, number, number, number][] = [[-0.25, -0.2, 0.62, 0], [0.28, -0.22, 0.58, 1], [0.0, 0.12, 0.7, 3], [-0.38, 0.28, 0.5, 2], [0.38, 0.26, 0.55, 4]];
  spots.slice(0, 3 + Math.min(2, tier)).forEach(([x, z, s, v], i) => b.merge(tree(v), tr(x, 0, z, s, i * 1.3)));
  logPile(b, 0.0, 0, 0.6, 2, 0.3, 0.2);
}

function farmNode(b: GeoBuilder, tier: number): void {
  b.box(0, 0, 0, 1.0, 0.05, 0.9, PAL.soil, { jitter: 0.03 });
  for (let i = 0; i < 5; i++) b.box(0, 0.05, -0.32 + i * 0.16, 0.88, 0.07, 0.08, i % 2 ? PAL.crop : PAL.hay, { jitter: 0.07 });
  for (let i = 0; i < 2 + tier; i++) {
    const x = -0.35 + (i * 0.7) / Math.max(1, 1 + tier);
    b.cone(x, 0.05, 0.38, 0.09, 0.26, PAL.hay, 5, { jitter: 0.06 });
    b.box(x, 0.2, 0.38, 0.2, 0.02, 0.02, PAL.timberLight, { jitter: 0 });
  }
}

function quarryNode(b: GeoBuilder, tier: number): void {
  rocks(b, ([[-0.22, -0.12, 0.8, 0], [0.22, -0.2, 0.65, 3], [0.05, 0.2, 0.5, 5], [-0.4, 0.28, 0.4, 2]] as [number, number, number, number][]).slice(0, 3 + Math.min(1, tier)));
  b.box(0.4, 0, 0.3, 0.2, 0.14, 0.16, PAL.stoneLight, { rotY: 0.4 });
  b.box(0.52, 0, 0.1, 0.18, 0.12, 0.16, PAL.stone, { rotY: -0.2 });
  b.box(0.42, 0.14, 0.28, 0.14, 0.1, 0.12, PAL.stoneLight, { rotY: 0.1 });
  b.box(-0.55, 0.0, 0.1, 0.02, 0.22, 0.02, PAL.timberDark, { rotZ: 0.8 });
  b.box(-0.47, 0.17, 0.1, 0.14, 0.03, 0.03, PAL.stoneDark, { rotZ: 0.8 });
}

function oreNode(b: GeoBuilder, tier: number, pal: number[], dark: number, cols: number[], emit: number): void {
  rocks(b, [[-0.3, -0.3, 0.75, 1], [0.4, -0.25, 0.55, 4], [-0.5, 0.2, 0.4, 6]], pal, dark);
  const n = 4 + Math.min(3, tier);
  for (let i = 0; i < n; i++) {
    const a = i * 2.4 + 0.4, rad = 0.12 + 0.12 * (i % 3);
    crystal(b, Math.cos(a) * rad + 0.05, 0.02, Math.sin(a) * rad + 0.1, 0.1 + 0.03 * (i % 2), 0.36 + 0.1 * (i % 3), cols[i % cols.length]!, emit, Math.sin(a) * 0.3, a);
  }
}

function goldNode(b: GeoBuilder, tier: number): void {
  oreNode(b, tier, PAL.boulder.map((c) => c - 0x101010), 0x4f4d49, [PAL.gold, 0xf3cf6e, 0xc9962a], 0.45);
}

function emberNode(b: GeoBuilder, tier: number): void {
  oreNode(b, tier, [0x4a4442, 0x57504d, 0x645c58], 0x2b2523, [PAL.ember, 0xff7a2a, 0xc23a22], 0.9);
  b.box(0.0, 0.02, 0.45, 0.5, 0.025, 0.06, 0xffa040, { emit: 1, rotY: 0.3, jitter: 0 });
  b.cone(-0.2, 0.0, 0.5, 0.05, 0.12, 0xffa040, 4, { emit: 1, jitter: 0 });
}

/* ---------- POI models ---------- */

/** Rail fence ring (posts and two rails) used around human farms; `gap` leaves a gate opening at that angle. */
function fenceRing(b: GeoBuilder, R: number, n: number, gap: number | null, col: Col = PAL.white): void {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    if (gap !== null && Math.abs(Math.atan2(Math.sin(a - gap), Math.cos(a - gap))) < 0.35) continue;
    const x = Math.cos(a) * R, z = Math.sin(a) * R;
    b.cyl(x, 0, z, 0.025, 0.03, 0.2, col, 5, { jitter: 0.02 });
    const a2 = ((i + 1) / n) * Math.PI * 2;
    const mx = (x + Math.cos(a2) * R) / 2, mz = (z + Math.sin(a2) * R) / 2;
    const len = Math.hypot(Math.cos(a2) * R - x, Math.sin(a2) * R - z);
    for (const y of [0.09, 0.16]) b.box(mx, y, mz, len, 0.02, 0.02, col, { rotY: -(a + a2) / 2 - Math.PI / 2, jitter: 0 });
  }
}

function barn(b: GeoBuilder, x: number, z: number, s: number, rot: number): void {
  const t = new GeoBuilder(4);
  t.box(0, 0, 0, 0.5 * s, 0.26 * s, 0.38 * s, 0xb23a32); // red walls
  t.gable(0, 0.26 * s, 0, 0.56 * s, 0.44 * s, 0.2 * s, 0x6a5a58);
  t.box(0, 0, 0.19 * s, 0.14 * s, 0.2 * s, 0.015, PAL.white, { jitter: 0 }); // white-trimmed door
  t.box(0, 0.32 * s, 0.21 * s, 0.06 * s, 0.06 * s, 0.015, PAL.white, { jitter: 0 });
  b.append(GeoBuilder.transformed(t, x, 0, z, rot));
}

function silo(b: GeoBuilder, x: number, z: number, h: number): void {
  b.cyl(x, 0, z, 0.1, 0.1, h, 0xc8ccd0, 9, { jitter: 0.03 });
  b.sphere(x, h, z, 0.1, 0x9aa0a6, { scale: [1, 0.55, 1], jitter: 0.02 }, 1);
}

function scarecrow(b: GeoBuilder, x: number, z: number): void {
  b.cyl(x, 0, z, 0.012, 0.012, 0.3, PAL.timberDark, 4, { jitter: 0 });
  b.box(x, 0.2, z, 0.2, 0.02, 0.02, PAL.timberDark, { jitter: 0 });
  b.sphere(x, 0.34, z, 0.045, PAL.hay, { jitter: 0 }, 0);
  b.cone(x, 0.37, z, 0.05, 0.05, PAL.timber, 5, { jitter: 0 });
}

function haybale(b: GeoBuilder, x: number, z: number): void {
  b.cyl(x, 0, z, 0.06, 0.06, 0.1, PAL.hay, 8, { rotZ: Math.PI / 2, jitter: 0.04 });
}

/** Human outpost: tiers 1-3 are farms (barn, silo, fence, hay), tiers 4-5 city blocks (towers with lit windows). */
function campModel(b: GeoBuilder, tier: number, flagCol: number, danger: number): void {
  const R = 0.55 + 0.05 * tier;
  if (tier <= 3) {
    fenceRing(b, R, 16 + tier * 2, Math.PI / 2);
    barn(b, -0.12, -0.12, 0.9 + 0.12 * tier, 0.15);
    silo(b, 0.3, -0.18, 0.4 + 0.08 * tier);
    if (tier >= 2) silo(b, 0.18, -0.34, 0.34 + 0.08 * tier);
    haybale(b, -0.35, 0.18); haybale(b, -0.22, 0.28);
    scarecrow(b, 0.3, 0.2);
    if (tier >= 3) { for (const sx of [-1, 1]) b.box(sx * 0.15, 0, 0.42, 0.22, 0.12, 0.12, 0x8a8a90); b.box(0, 0.12, 0.42, 0.5, 0.03, 0.14, PAL.stoneDark); } // feedlot troughs
  } else {
    b.box(0, 0, 0.02, 1.0 + 0.1 * tier, 0.04, 0.9 + 0.1 * tier, 0x6a6a70, { jitter: 0.03 }); // asphalt
    const towers: [number, number, number, number, number][] = [[-0.28, -0.14, 0.22, 0.9, 0x8a929c], [0.0, -0.22, 0.2, 1.2, 0x6f7a8a], [0.28, -0.1, 0.2, 0.7, 0xa0a4aa], [-0.05, 0.14, 0.16, 0.5, 0x9a8a7a], [0.3, 0.24, 0.14, 0.4, 0xb2a48a]];
    towers.slice(0, 2 + tier).forEach(([x, z, w, h, col]) => {
      b.box(x, 0.04, z, w, h * (0.7 + 0.1 * tier), w, col);
      for (let k = 1; k < 4; k++) b.box(x, 0.04 + k * h * 0.2, z + w / 2, w * 0.7, 0.04, 0.012, 0xffe08a, { emit: 0.9, jitter: 0 });
    });
    b.cyl(0.42, 0.04, 0.0, 0.012, 0.012, 0.35, PAL.coal, 4, { jitter: 0 }); // street light
    b.box(0.42, 0.38, 0.03, 0.05, 0.025, 0.05, 0xffe08a, { emit: 1, jitter: 0 });
  }
  bannerPart(b, 0.0, 0, R * 0.95, 0.75 + 0.05 * danger + (danger > 3 ? 0.12 : 0), flagCol, danger);
  crate(b, -R + 0.15, 0, 0.1, 0.12);
}

/** Human compound (lair): a corrugated warehouse with a chimney, fence and floodlights. */
function lairModel(b: GeoBuilder, tier: number, danger: number, flagCol: number): void {
  b.box(0, 0, 0.0, 1.1, 0.04, 0.9, 0x6a6a70, { jitter: 0.03 });
  b.box(-0.05, 0.04, -0.1, 0.8, 0.36, 0.46, 0x8a929c);
  b.gable(-0.05, 0.4, -0.1, 0.86, 0.5, 0.18, 0x5f6a74);
  b.box(-0.05, 0.04, 0.14, 0.26, 0.24, 0.02, PAL.coal, { jitter: 0 }); // roller door
  b.cyl(0.38, 0.04, -0.25, 0.06, 0.07, 0.6, 0x9a5a48, 8); // chimney
  b.sphere(0.38, 0.68, -0.25, 0.05, 0xbfc3c8, { scale: [1.2, 0.8, 1.2], jitter: 0.02 }, 0);
  for (const sx of [-1, 1]) {
    b.cyl(sx * 0.45, 0.04, 0.34, 0.012, 0.012, 0.32, PAL.coal, 4, { jitter: 0 });
    b.sphere(sx * 0.45, 0.38, 0.34, 0.03, 0xffeaa0, { emit: 1, jitter: 0 }, 0); // floodlights
  }
  fenceRing(b, 0.62, 22, Math.PI / 2, 0x9a9a9e);
  for (let i = 0; i < tier; i++) b.box(0.45 + i * 0.07, 0.0, 0.62, 0.1, 0.03, 0.03, PAL.cream, { rotY: i, jitter: 0 });
  bannerPart(b, -0.58, 0, 0.45, 0.8 + (danger > 3 ? 0.1 : 0), flagCol, danger);
}

/** Boss base: a giant barn flanked by silos with a lit sign and a flag; the boss lives here. */
function bossModel(b: GeoBuilder, danger: number, dark: number): void {
  b.cyl(0, 0, 0, 0.62, 0.66, 0.1, PAL.stoneDark, 10);
  b.box(0, 0.1, -0.05, 0.9, 0.5, 0.6, 0xa8342c);
  b.gable(0, 0.6, -0.05, 0.98, 0.7, 0.34, 0x4a3f48);
  b.box(0, 0.1, 0.26, 0.26, 0.36, 0.03, PAL.white, { jitter: 0 });
  b.box(0, 0.48, 0.27, 0.12, 0.12, 0.03, 0xffe08a, { emit: 0.8, jitter: 0 });
  for (const sx of [-1, 1]) { silo(b, sx * 0.62, -0.22, 0.9); silo(b, sx * 0.5, 0.15, 0.6); }
  scarecrow(b, 0.0, 0.5);
  fenceRing(b, 0.88, 24, Math.PI / 2, PAL.white);
  bannerPart(b, 0.0, 1.35, -0.05, 0.6, dark, danger);
  bannerPart(b, -0.75, 0, 0.5, 0.85, dark, 0);
  bannerPart(b, 0.75, 0, 0.5, 0.85, dark, 0);
}

function ruinModel(b: GeoBuilder): void {
  b.box(0, 0, 0, 1.1, 0.06, 0.9, 0x9a9488, { jitter: 0.04 });
  b.box(-0.35, 0.06, -0.3, 0.5, 0.42, 0.12, PAL.stoneLight);
  b.box(-0.12, 0.06, -0.3, 0.14, 0.62, 0.12, PAL.stone);
  b.box(0.25, 0.06, -0.3, 0.3, 0.2, 0.12, PAL.stoneLight);
  b.box(-0.5, 0.06, 0.0, 0.12, 0.3, 0.5, PAL.stone);
  for (const [x, z, h] of [[0.4, 0.2, 0.5], [0.4, -0.05, 0.3], [-0.1, 0.35, 0.18]] as const) {
    b.cyl(x, 0.06, z, 0.09, 0.1, h, PAL.stoneLight, 8);
    b.cyl(x, 0.06 + h, z, 0.12, 0.1, 0.04, PAL.stone, 8, { jitter: 0 });
  }
  b.box(0.1, 0.06, 0.1, 0.2, 0.1, 0.14, PAL.stoneDark, { rotY: 0.6 });
  b.box(-0.3, 0.06, 0.3, 0.16, 0.08, 0.2, PAL.stone, { rotY: -0.4 });
  for (const [x, z] of [[-0.45, -0.28], [0.3, -0.3], [0.38, 0.22], [-0.5, 0.25]] as const) b.sphere(x, 0.1, z, 0.09, PAL.meadow[0]!, { scale: [1, 0.6, 1] }, 0);
}

function villageModel(b: GeoBuilder, flagCol: number): void {
  hut(b, -0.3, -0.2, 0.4, 0.34, 0.26, PAL.cream, PAL.roofOrange, 0.24, 0.3);
  hut(b, 0.3, -0.25, 0.36, 0.32, 0.24, PAL.cream, PAL.roofRed, 0.22, -0.4);
  hut(b, 0.05, 0.25, 0.34, 0.3, 0.22, PAL.cream, PAL.thatch, 0.22, 0.1);
  b.cyl(-0.45, 0, 0.3, 0.07, 0.08, 0.12, PAL.stone, 8);
  fence(b, -0.7, 0.55, 0.7, 0.55, 0.1);
  bannerPart(b, 0.58, 0, 0.1, 0.85, flagCol, 0);
  smokePuff(b, -0.3, 0.55, -0.2, 0.7);
}

function shrineModel(b: GeoBuilder): void {
  b.cyl(0, 0, 0, 0.62, 0.7, 0.1, PAL.stoneLight, 8);
  b.cyl(0, 0.1, 0, 0.5, 0.56, 0.08, PAL.stone, 8);
  for (const sx of [-1, 1]) {
    b.box(sx * 0.3, 0.18, -0.1, 0.12, 0.7, 0.12, PAL.stoneLight);
    b.box(sx * 0.3, 0.18, -0.1, 0.16, 0.06, 0.16, PAL.stone);
  }
  b.box(0, 0.86, -0.1, 0.76, 0.1, 0.16, PAL.stone);
  b.cone(0, 0.18, 0.0, 0.1, 0.18, PAL.stone, 4);
  crystal(b, 0, 0.5, -0.1, 0.1, 0.34, 0x6fe0e8, 0.9);
  b.cone(0.45, 0.18, 0.3, 0.08, 0.12, 0xff9a3c, 5, { emit: 1, jitter: 0 });
  b.cyl(0.45, 0.18, 0.3, 0.07, 0.04, 0.0, PAL.stoneDark, 6);
  b.cyl(0.45, 0.0, 0.3, 0.04, 0.06, 0.18, PAL.stoneDark, 6);
}

function cacheModel(b: GeoBuilder): void {
  b.box(0, 0, 0, 0.5, 0.26, 0.34, PAL.timber);
  b.cyl(0, 0.26, 0, 0.17, 0.17, 0.5, PAL.timberLight, 8, { rotZ: Math.PI / 2, scale: [1, 0.5, 1] });
  b.box(-0.14, 0, 0, 0.05, 0.3, 0.36, PAL.gold, { jitter: 0 });
  b.box(0.14, 0, 0, 0.05, 0.3, 0.36, PAL.gold, { jitter: 0 });
  b.box(0, 0.12, 0.175, 0.07, 0.1, 0.03, PAL.gold, { jitter: 0, emit: 0.3 });
  for (const [x, z] of [[0.3, 0.2], [0.38, 0.1], [-0.32, 0.22]] as const) b.cyl(x, 0, z, 0.05, 0.05, 0.02, PAL.gold, 8, { emit: 0.3, jitter: 0 });
  crystal(b, -0.35, 0, -0.1, 0.05, 0.16, PAL.gold, 0.5);
}

/** Walled capital: octagonal curtain wall, corner towers, central keep, blue banners. */
/** The player's capital on the world map: a farmyard around a big red coop with a hen face, comb and rooster weathervane. */
function capitalModel(b: GeoBuilder, bannerCol: number): void {
  b.cyl(0, 0, 0, 0.85, 0.88, 0.06, 0xb8a070, 10, { jitter: 0.03 }); // dirt yard
  // picket ring with a gate gap in front
  const R = 0.76, n = 14;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    const mid = (a0 + a1) / 2;
    if (Math.abs(Math.atan2(Math.sin(mid - Math.PI / 2), Math.cos(mid - Math.PI / 2))) < 0.3) continue; // gate in front (+Z)
    picketFence(b, Math.cos(a0) * R, Math.sin(a0) * R, Math.cos(a1) * R, Math.sin(a1) * R, 0.16, PAL.white);
  }
  // the big coop: red walls, gambrel roof, round hen-face gable, comb on the ridge
  roundBox(b, 0, 0.06, -0.08, 0.5, 0.34, 0.4, FARM.barnRed, 0.05);
  const top = barnRoof(b, 0, 0.4, -0.08, 0.62, 0.52, 0.3, 0x7a3a2e, { rotY: Math.PI / 2, infill: FARM.barnRed });
  face(b, 0, 0.5, 0.2, 1.0, 'chicken');
  comb(b, 0, top - 0.02, -0.08, 1.0, false);
  weathervaneRooster(b, 0, top + 0.02, -0.24, 0.9);
  archDoor(b, 0, 0.13, 0.2, 0.24, PAL.timberDark, 0.06);
  // small side coops on stilts with nests, hay and a mini hen
  for (const sx of [-1, 1]) {
    roundBox(b, sx * 0.5, 0.1, 0.12, 0.22, 0.18, 0.2, sx < 0 ? FARM.mustard : FARM.terracotta, 0.03);
    softGable(b, sx * 0.5, 0.28, 0.12, 0.28, 0.26, 0.14, 0x9a5a38);
    b.cyl(sx * 0.5 - 0.07, 0.0, 0.12 - 0.07, 0.015, 0.015, 0.1, PAL.timberDark, 4, { jitter: 0 });
    b.cyl(sx * 0.5 + 0.07, 0.0, 0.12 + 0.07, 0.015, 0.015, 0.1, PAL.timberDark, 4, { jitter: 0 });
  }
  hayBale(b, -0.3, 0.06, 0.42, 0.4);
  hayBale(b, -0.17, 0.06, 0.5, -0.3);
  nest(b, 0.28, 0.06, 0.45, 0.1, 3);
  miniChicken(b, 0.05, 0.06, 0.5, 0.3, 1.0);
  flag(b, 0.38, 0.06, -0.38, 0.62, bannerCol, 1.2);
}

/* ---------- assembly ---------- */

const iconTex = new Map<string, THREE.Texture>();
function iconSprite(kind: MarkerKind): THREE.Sprite | null {
  const id = ICON[kind];
  let tex = iconTex.get(id);
  if (!tex) {
    const cv = getIconCanvas(id, 64);
    if (!cv) return null;
    tex = new THREE.CanvasTexture(cv);
    tex.minFilter = THREE.LinearFilter;
    iconTex.set(id, tex);
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, depthTest: false, toneMapped: false, fog: false }));
  s.scale.set(0.42, 0.42, 1);
  s.renderOrder = 30;
  return s;
}

const badgeTex = new Map<string, THREE.Texture>();
type BadgeShape = 'triangle' | 'circle' | 'square' | 'diamond';
const BADGE_SHAPE: Partial<Record<MarkerKind, BadgeShape>> = { camp: 'triangle', lair: 'triangle', boss: 'triangle', village: 'square', ruin: 'diamond', shrine: 'diamond', cache: 'diamond' };

/** Shape badge (white fill, dark outline) so categories read without colour: triangle = hostile, circle = node, square = village. */
function badgeSprite(kind: MarkerKind): THREE.Sprite {
  const shape: BadgeShape = BADGE_SHAPE[kind] ?? 'circle';
  let tex = badgeTex.get(shape);
  if (!tex) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const c = cv.getContext('2d')!;
    c.lineWidth = 7;
    c.strokeStyle = '#2b2622';
    c.fillStyle = '#fff7dc';
    c.lineJoin = 'round';
    c.beginPath();
    if (shape === 'triangle') { c.moveTo(32, 8); c.lineTo(58, 54); c.lineTo(6, 54); c.closePath(); }
    else if (shape === 'square') c.rect(10, 10, 44, 44);
    else if (shape === 'diamond') { c.moveTo(32, 5); c.lineTo(59, 32); c.lineTo(32, 59); c.lineTo(5, 32); c.closePath(); }
    else c.arc(32, 32, 24, 0, Math.PI * 2);
    c.stroke();
    c.fill();
    tex = new THREE.CanvasTexture(cv);
    tex.minFilter = THREE.LinearFilter;
    badgeTex.set(shape, tex);
  }
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, depthTest: false, toneMapped: false, fog: false }));
  sp.scale.set(0.72, 0.72, 1); // child of the 0.42 icon sprite
  sp.renderOrder = 31;
  sp.name = 'cb-badge';
  return sp;
}

function finish(kind: MarkerKind, b: GeoBuilder, top: number, opts: MarkerOpts): THREE.Group {
  const g = new THREE.Group();
  g.name = `marker:${kind}`;
  g.userData['kind'] = kind;
  g.userData['shared'] = false;
  const mesh = new THREE.Mesh(b.build(), getCelMaterial({ fogOfWar: opts.fogOfWar }));
  addOutline(mesh, 0.06, null, opts.fogOfWar);
  g.add(mesh);
  if (opts.icon !== false) {
    const sp = iconSprite(kind);
    if (sp) {
      sp.position.set(0, top, 0);
      g.add(sp);
      g.userData['floater'] = sp;
      g.userData['floatBase'] = top;
      if (opts.colourBlind) {
        const bd = badgeSprite(kind);
        bd.position.set(0.85, 0.5, 0);
        sp.add(bd);
      }
    }
  }
  return g;
}

const TOPS: Record<MarkerKind, number> = {
  forest: 1.2, farmland: 0.7, quarry: 0.85, gold: 0.9, ember: 0.9, camp: 1.5, lair: 1.4, boss: 2.5, ruin: 1.2, village: 1.3, shrine: 1.4, cache: 0.8, capital: 1.7,
};

/** Resource node model (tier 1..5 adds trees / crystals / sheaves). */
export function buildNodeModel(kind: NodeKind, tier = 1, opts: MarkerOpts = {}): THREE.Group {
  const b = new GeoBuilder(kind.length * 17 + tier);
  const t = Math.max(1, Math.min(5, tier));
  if (kind === 'forest') forestNode(b, t);
  else if (kind === 'farmland') farmNode(b, t);
  else if (kind === 'quarry') quarryNode(b, t);
  else if (kind === 'gold') goldNode(b, t);
  else emberNode(b, t);
  return finish(kind, b, TOPS[kind], opts);
}

/** World-map marker for a POI or node. `tier` 1..5; hostile POIs show banner skulls = danger (default tier). */
export function buildPoiMarker(kind: MarkerKind, tier = 1, opts: MarkerOpts = {}): THREE.Group {
  if ((NODE_KINDS as string[]).includes(kind)) return buildNodeModel(kind as NodeKind, tier, opts);
  const t = Math.max(1, Math.min(5, Math.round(tier)));
  const hostile = kind === 'camp' || kind === 'lair' || kind === 'boss';
  const faction: Faction = opts.faction ?? (hostile ? 'bandit' : kind === 'village' ? 'ally' : kind === 'capital' ? 'player' : 'neutral');
  const danger = Math.max(0, Math.min(5, opts.danger ?? (hostile ? t : 0)));
  const flagCol = parseColour(opts.banner, FACTION_COL[faction]);
  const b = new GeoBuilder(kind.length * 13 + t);
  let top = TOPS[kind as MarkerKind];
  switch (kind) {
    case 'camp': campModel(b, t, flagCol, danger); break;
    case 'lair': lairModel(b, t, danger, flagCol); break;
    case 'boss': bossModel(b, Math.max(5, danger), 0x2b2230); top = 2.7; break;
    case 'ruin': ruinModel(b); break;
    case 'village': villageModel(b, flagCol); break;
    case 'shrine': shrineModel(b); break;
    case 'cache': cacheModel(b); break;
    default: capitalModel(b, flagCol); break;
  }
  const g = finish(kind, b, top, opts);
  g.userData['tier'] = t;
  g.userData['danger'] = danger;
  return g;
}

/** Walled capital marker for the world map (player blue banners). */
export function buildCapitalMarker(opts: MarkerOpts = {}): THREE.Group {
  return buildPoiMarker('capital', 1, { faction: 'player', ...opts });
}

/** Gentle bob of the floating icon, plus a slow banner-ish sway of the whole model. Call each frame. */
export function animateMarker(obj: THREE.Object3D, t: number): void {
  const f = obj.userData['floater'] as THREE.Object3D | undefined;
  const base = obj.userData['floatBase'] as number | undefined;
  if (f && base !== undefined) f.position.y = base + Math.sin(t * 2.2 + obj.position.x * 1.7 + obj.position.z) * 0.06;
}

/* ---------- selection / hover ---------- */

/** White pulsing ground ring for selected things. Update with `animateSelectionRing(ring, t)`. */
export function buildSelectionRing(radius = 0.92, colour = 0xffffff): THREE.Mesh {
  const g = new THREE.RingGeometry(radius - 0.13, radius, 48);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false }));
  m.name = 'selection-ring';
  m.position.y = 0.06;
  m.renderOrder = 6;
  return m;
}

export function animateSelectionRing(ring: THREE.Mesh, t: number): void {
  const s = 1 + Math.sin(t * 4) * 0.04;
  ring.scale.set(s, 1, s);
  (ring.material as THREE.MeshBasicMaterial).opacity = 0.7 + 0.25 * Math.sin(t * 4);
}

/** Brighten (hover) or restore every cel mesh under `obj` by swapping to the shared highlighted material. */
export function setHover(obj: THREE.Object3D, on: boolean): void {
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || o.userData['isOutline']) return;
    const mat = m.material as THREE.ShaderMaterial;
    if (!mat || mat.name !== 'cel') return;
    if (on) {
      if (!o.userData['origMat']) o.userData['origMat'] = mat;
      m.material = getCelMaterial({ fogOfWar: 'USE_FOW' in (mat.defines ?? {}), hover: true });
    } else if (o.userData['origMat']) {
      m.material = o.userData['origMat'] as THREE.Material;
      o.userData['origMat'] = undefined;
    }
  });
}
