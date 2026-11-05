// Economy buildings, part 2: Feed Silo, Egg Trading Post, Egg Market (docs/10-building-art-brief.md 3.7 to 3.9).
import * as THREE from 'three';
import { GeoBuilder, PAL, type Col } from '../builder';
import {
  FARM, LOW_COMB, banner, comb, crate, domeRoof, egg, miniChicken, nest,
  softGable, taperBox, type Gen,
} from './parts';
import { lowBarrel, lowDoor, lowSack, lowWheel, miniSign, porthole } from './economyBits';

const PI = Math.PI;

/** Build `fn` in local coordinates and append it moved, turned and scaled. */
function sub(b: GeoBuilder, x: number, z: number, rotY: number, sc: number, fn: (s: GeoBuilder) => void): void {
  const t = new GeoBuilder(((Math.round(x * 100) * 17 + Math.round(z * 100)) | 0) + 11);
  t.ao = b.ao;
  fn(t);
  b.append(GeoBuilder.transformed(t, x, 0, z, rotY, sc));
}

const wheel = lowWheel;

function eggCrate(b: GeoBuilder, x: number, y0: number, z: number, s = 0.14, rotY = 0): void {
  crate(b, x, y0, z, s, rotY);
  const o = s * 0.2;
  for (const [ex, ez] of [[-o, o], [o, o]] as const) egg(b, x + ex, y0 + s, z + ez, 0.03, ex > 0 ? FARM.eggBrown : FARM.egg, undefined, 0);
}

// ---------------------------------------------------------------- Feed Silo

export const storehouse: Gen = (b, c) => {
  const s = c.stage;
  const H = [0.42, 0.5, 0.75, 0.8, 0.9][s]!;
  const plinth = s >= 3 ? 0.08 : 0;
  const cz = -0.1;
  const silo = (x: number, z: number, r: number, h: number, bandN: number, domeH: number): number => {
    if (plinth) b.cyl(x, 0, z, r + 0.05, r + 0.06, plinth, PAL.stoneLight, 10, { jitter: 0.02 });
    b.cyl(x, plinth, z, r * 0.94, r, h, PAL.cream, 10, { smooth: true, jitter: 0.02 });
    for (let i = 0; i < bandN; i++) {
      const y = plinth + ((i + 0.6) / (bandN + 0.2)) * h;
      b.cyl(x, y, z, r * 1.02, r * 1.04, 0.035, FARM.barnRedDark, 10, { jitter: 0.02 });
    }
    if (domeH > 0) return domeRoof(b, x, plinth + h, z, r * 1.1, domeH, c.roof, 10, true, { rings: 3 });
    b.cone(x, plinth + h, z, r * 1.15, 0.2, c.roof, 10, { smooth: true, jitter: 0.02 });
    b.sphere(x, plinth + h + 0.2, z, 0.04, c.roof, { jitter: 0 }, 0);
    return plinth + h + 0.24;
  };
  const nb = s === 2 ? 4 : 3;
  const top = silo(0, cz, 0.3, H, nb, s >= 2 ? [0, 0, 0.2, 0.2, 0.24][s]! : 0);

  const front = cz + 0.3;
  if (s >= 1) {
    b.box(0, plinth, front - 0.01, 0.16, 0.24, 0.04, PAL.timberDark, { jitter: 0 });
    b.box(0, plinth + 0.24, front - 0.01, 0.2, 0.03, 0.05, PAL.stoneLight, { jitter: 0 });
    // side ladder
    for (const z of [cz - 0.05, cz + 0.07]) b.box(0.3, plinth, z, 0.035, H * 0.9, 0.035, PAL.timberLight, { jitter: 0.02 });
    for (let i = 1; i <= 3; i++) b.box(0.3, plinth + i * (H * 0.9) / 4, cz + 0.01, 0.035, 0.035, 0.14, PAL.timber, { jitter: 0 });
  }
  // sacks and barrels at the front
  lowSack(b, -0.34, 0, 0.3, 0xd8c9a0, 0.2);
  lowSack(b, -0.2, 0, 0.4, 0xc9b98c, -0.2);
  if (s >= 1) {
    lowSack(b, -0.47, 0, 0.42, 0xc9b98c, 0.3);
    lowBarrel(b, -0.58, 0, 0.18, 1.3);
  }
  if (s >= 2) {
    // lean-to feed shed
    taperBox(b, -0.5, plinth, -0.05, 0.36, 0.32, 0.5, FARM.barnRed, 0.94);
    b.shed(-0.5, plinth + 0.32, -0.05, 0.6, 0.46, 0.14, c.roof, { rotY: -PI / 2, jitter: 0.02 });
    lowDoor(b, -0.5, 0.2, 0.13, 0.22, PAL.timberDark, plinth);
  }
  if (s >= 3) {
    // second silo, catwalk, chute and trough
    const x2 = 0.5, z2 = -0.42;
    silo(x2, z2, 0.2, 0.62, 2, 0.14);
    const dx = x2, dz = z2 - cz;
    const L = Math.hypot(dx, dz);
    const ang = Math.atan2(-dz, dx);
    const gap = L - 0.3 - 0.2;
    b.box(dx * (0.3 + gap / 2) / L, plinth + 0.58, cz + dz * (0.3 + gap / 2) / L, gap + 0.1, 0.04, 0.09, PAL.timber, { rotY: ang, jitter: 0.02 });
    b.cyl(0.4, 0.2, 0.18, 0.045, 0.045, 0.45, PAL.stoneLight, 6, { rotZ: 0.6, jitter: 0.02 });
    taperBox(b, 0.45, 0, 0.22, 0.3, 0.1, 0.13, PAL.timber, 0.9);
    b.box(0.45, 0.095, 0.22, 0.22, 0.012, 0.08, FARM.corn, { jitter: 0.06 });
    miniChicken(b, 0.45, 0.1, 0.24, -0.2, 0.9, FARM.egg, true);
    b.sphere(0, top + 0.02, cz, 0.05, PAL.gold, { jitter: 0, emit: 0.1 }, 0);
  }
  if (s >= 4) {
    comb(b, 0, top - 0.02, cz, 1.2, true, LOW_COMB);
    // corn badge on the silo front
    const by = plinth + H * 0.62, bz = front + 0.03;
    b.sphere(0, by, bz, 0.07, FARM.corn, { scale: [0.7, 1.4, 0.25], smooth: true, jitter: 0 }, 1);
    for (const sg of [-1, 1]) b.cone(sg * 0.045, by - 0.08, bz, 0.03, 0.12, FARM.cornLeaf, 4, { rotZ: sg * 0.6, scale: [1, 1, 0.5], jitter: 0 });
    banner(b, -0.62, 0, -0.5, 0.95, c.banner);
  }
};

// ---------------------------------------------------------------- Egg Trading Post

/** Covered wagon, long axis along X, open end at +X. Local origin on the ground at the wagon centre. */
function wagon(b: GeoBuilder, hood: Col, back: boolean, simple = false): void {
  const bedY = 0.2;
  taperBox(b, 0, bedY, 0, 0.9, 0.08, 0.46, PAL.timber, 0.95);
  const hx = 0.05, hy = bedY + 0.08, hr = 0.28;
  b.part(new THREE.CylinderGeometry(hr, hr, 0.72, 10, 1, true, -PI / 2, PI), hx, hy, 0, hood, { rotX: -PI / 2, rotY: PI / 2, jitter: 0.02 });
  for (const rx of simple ? [] : [0.36]) {
    b.part(new THREE.TorusGeometry(hr + 0.01, 0.022, 3, 8, PI), hx + rx, hy, 0, PAL.timber, { rotY: PI / 2, jitter: 0 });
  }
  // back wall of the hood so it does not look hollow
  for (const sz of simple ? [1] : [-1, 1]) {
    wheel(b, -0.3, 0.16, sz * 0.3, 0.16);
    wheel(b, 0.3, 0.14, sz * 0.3, 0.14);
  }
  b.box(0.52, 0.25, 0, 0.2, 0.035, 0.035, PAL.timberDark, { jitter: 0 }); // tongue
  if (back) {
    eggCrate(b, -0.5, 0.28, -0.1);
    eggCrate(b, -0.5, 0.28, 0.1);
  }
}

export const tradingpost: Gen = (b, c) => {
  const s = c.stage;
  taperBox(b, 0, 0, 0, 1.3, 0.05, 1.15, PAL.stoneLight, 0.97, { jitter: 0.03 });
  if (s === 0) {
    // hand cart with egg crates and a parasol
    taperBox(b, 0, 0.14, 0.05, 0.56, 0.09, 0.34, PAL.timber, 0.95);
    for (const sz of [-1, 1]) wheel(b, 0, 0.13, 0.05 + sz * 0.21, 0.13);
    b.box(0.5, 0.2, 0.05, 0.4, 0.035, 0.035, PAL.timberDark, { jitter: 0 });
    eggCrate(b, -0.12, 0.23, 0.05);
    eggCrate(b, 0.12, 0.23, 0.05);
    b.cyl(0.0, 0.23, -0.08, 0.022, 0.022, 0.34, PAL.timberDark, 5, { jitter: 0 });
    b.cone(0.0, 0.55, -0.08, 0.26, 0.1, FARM.terracotta, 8, { jitter: 0.02 });
    b.sphere(0.0, 0.66, -0.08, 0.03, PAL.cream, { jitter: 0 }, 0);
    lowSack(b, -0.45, 0.05, 0.4, 0xd8c9a0, 0.3);
    return;
  }
  sub(b, 0.12, 0.1, 0, 0.85, (t) => wagon(t, PAL.cream, true));
  lowSack(b, -0.6, 0.05, 0.1, 0xd8c9a0, 0.3);
  // signpost topped with an egg, front centre
  miniSign(b, 0.1, 0.05, 0.52, 1.1);
  // parasol beside the wagon keeps the shop identity from stage 0 (and keeps stage 1 taller than stage 0)
  b.cyl(-0.45, 0.05, 0.3, 0.022, 0.022, 0.62, PAL.timberDark, 5, { jitter: 0 });
  b.cone(-0.45, 0.62, 0.3, 0.27, 0.13, FARM.terracotta, 8, { jitter: 0.02 });
  b.sphere(-0.45, 0.77, 0.3, 0.03, PAL.cream, { jitter: 0 }, 0);
  if (s >= 2) {
    // office hut with a counter and an awning
    const hx = -0.42, hz = -0.42, hy = s >= 3 ? 0.08 : 0;
    const wall = [0, 0, 0.46, 0.5, 0.5][s]!, gab = [0, 0, 0.34, 0.36, 0.36][s]!;
    if (s >= 3) taperBox(b, hx, 0.05, hz, 0.42, hy, 0.38, PAL.stoneLight, 0.95);
    taperBox(b, hx, 0.05 + hy, hz, 0.36, wall, 0.32, PAL.cream, 0.96);
    const ridge = softGable(b, hx, 0.05 + hy + wall, hz, 0.32, 0.38, gab, c.roof, { rotY: PI / 2 });
    lowDoor(b, hx - 0.07, hz + 0.16, 0.14, 0.24, PAL.timberDark, 0.05 + hy);
    porthole(b, hx + 0.06, 0.05 + hy + wall + 0.15, hz + 0.17, 0.05);
    if (s >= 4) egg(b, hx, ridge - 0.02, hz, 0.1, PAL.gold, { emit: 0.25 }, 0);
    // counter + awning
    taperBox(b, -0.2, 0.05, -0.2, 0.3, 0.14, 0.14, PAL.timberLight, 0.94);
    for (const px of [-0.33, -0.07]) b.cyl(px, 0.05, -0.12, 0.025, 0.025, 0.3, PAL.timberDark, 5, { jitter: 0 });
    b.shed(-0.2, 0.35, -0.2, 0.4, 0.26, 0.09, FARM.terracotta, { jitter: 0.02 });
  }
  if (s >= 3) {
    // gold egg hanging from an L-bracket
    const px = -0.18, pz = -0.52;
    b.cyl(px, 0.05, pz, 0.03, 0.03, 0.72, PAL.timberDark, 5, { jitter: 0 });
    b.box(px + 0.12, 0.72, pz, 0.28, 0.04, 0.04, PAL.timberDark, { jitter: 0 });
    b.cyl(px + 0.22, 0.58, pz, 0.01, 0.01, 0.14, PAL.ink, 4, { jitter: 0 });
    egg(b, px + 0.22, 0.4, pz, 0.09, PAL.gold, { emit: 0.25 }, 0);
    nest(b, -0.2, 0.19, -0.2, 0.08, 3, FARM.eggBrown, true);
    miniChicken(b, -0.3, 0.05, -0.04, 0.2, 0.85, FARM.egg, true);
  }
  if (s >= 4) {
    sub(b, 0.47, 0.4, 0.5, 0.5, (t) => wagon(t, FARM.mustard, false, true));
    eggCrate(b, 0.15, 0.05, -0.5);
    miniChicken(b, -0.2, 0.05, 0.5, -0.4, 0.85, FARM.eggBrown, true);
    banner(b, 0.62, 0.05, -0.3, 0.95, c.banner);
  }
};

// ---------------------------------------------------------------- Egg Market

type Gen0 = Parameters<Gen>[0];

/** Counter, two posts, striped awning with a rounded front lip, eggs in a basket. */
function stall(b: Gen0, x: number, z: number, w: number, a: Col, a2: Col, lip: boolean): void {
  taperBox(b, x, 0.05, z, w, 0.22, 0.26, PAL.timberLight, 0.94);
  for (const sx of [-1, 1]) b.cyl(x + sx * (w / 2 - 0.03), 0.05, z - 0.1, 0.027, 0.03, 0.5, PAL.timberDark, 4, { jitter: 0 });
  const n = 3;
  const sw = (w + 0.08) / n;
  for (let i = 0; i < n; i++) {
    b.box(x - (w + 0.08) / 2 + sw * (i + 0.5), 0.5, z + 0.02, sw * 1.01, 0.04, 0.42, i % 2 ? a2 : a, { rotX: 0.28, jitter: 0.02 });
  }
  if (lip) b.cyl(x - w / 2 - 0.04, 0.5 + 0.0, z + 0.2, 0.03, 0.03, w + 0.08, a, 6, { rotZ: -PI / 2, jitter: 0 });
  b.cyl(x, 0.27, z + 0.02, 0.1, 0.085, 0.03, PAL.thatch, 5, { jitter: 0.05 });
  for (const i of [-1, 1]) egg(b, x + i * 0.035, 0.3, z + 0.02, 0.035, i > 0 ? FARM.egg : FARM.eggBrown, undefined, 0);
}

export const market: Gen = (b, c) => {
  const s = c.stage;
  b.plate(0, 0, 0, [0.5, 0.62, 0.66, 0.66, 0.66][s]!, 0.05, PAL.stoneLight, 6, { jitter: 0.03, rotY: PI / 6 });
  stall(b, s === 0 ? -0.26 : -0.42, 0.12, 0.36, c.banner, PAL.cream, s >= 1);
  if (s >= 1) stall(b, 0.42, 0.12, 0.36, FARM.sage, PAL.cream, true);
  if (s === 0) {
    // egg-basket pyramid beside the first stall
    b.cyl(0.2, 0.05, 0.16, 0.12, 0.1, 0.08, PAL.thatch, 6, { jitter: 0.05 });
    for (const [ex, ez] of [[-0.04, 0.0], [0.05, 0.03], [0.0, -0.05]] as const) egg(b, 0.2 + ex, 0.13, 0.16 + ez, 0.04, ex > 0 ? FARM.eggBrown : FARM.egg, undefined, 0);
    egg(b, 0.2, 0.2, 0.16, 0.04, FARM.egg, undefined, 0);
  } else {
    // centre egg-crate stack between the stalls
    eggCrate(b, 0.0, 0.05, 0.15, 0.14, 0.2);
    eggCrate(b, 0.0, 0.19, 0.15, 0.13, 0.1);
  }
  miniSign(b, s === 0 ? 0.3 : -0.05, 0.05, -0.12, s === 0 ? 0.85 : 1.2);
  b.cyl(-0.6, 0.05, -0.2, 0.075, 0.07, 0.14, PAL.timber, 8);
  if (s >= 1) lowSack(b, 0.6, 0.05, -0.15, 0xd8c9a0, -0.3);
  if (s >= 2) {
    stall(b, -0.5, -0.42, 0.3, FARM.mustard, PAL.cream, true);
    const hy = s >= 3 ? 0.08 : 0;
    if (s >= 3) taperBox(b, 0.15, 0.05, -0.42, 0.52, hy, 0.46, PAL.stoneLight, 0.96);
    const wall = s >= 3 ? 0.5 : 0.42, gab = s >= 3 ? 0.36 : 0.3;
    taperBox(b, 0.15, 0.05 + hy, -0.42, 0.46, wall, 0.4, PAL.cream, 0.96);
    const ridge = softGable(b, 0.15, 0.05 + hy + wall, -0.42, 0.4, 0.46, gab, c.roof, { rotY: PI / 2 });
    lowDoor(b, 0.15, -0.21, 0.17, 0.27, PAL.timberDark, 0.05 + hy);
    porthole(b, 0.15, 0.05 + hy + wall + 0.17, -0.19, 0.06);
    if (s >= 4) egg(b, 0.15, ridge - 0.01, -0.42, 0.09, PAL.gold, { emit: 0.2 }, 0);
  }
  if (s >= 3) {
    // egg fountain at the front of the square
    const fz = 0.44;
    b.cyl(0, 0.05, fz, 0.2, 0.22, 0.1, PAL.stoneLight, 10, { jitter: 0.02 });
    b.cyl(0, 0.13, fz, 0.17, 0.17, 0.03, PAL.blue, 10, { jitter: 0, emit: 0.15 });
    b.cyl(0, 0.15, fz, 0.05, 0.07, 0.12, PAL.stoneLight, 6, { jitter: 0.02 });
    egg(b, 0, 0.26, fz, 0.09, FARM.egg);
    // bunting between two posts
    for (const sg of [-1, 1]) b.cyl(sg * 0.62, 0.05, 0.42, 0.03, 0.035, 0.62, PAL.timber, 4, { jitter: 0 });
    b.cyl(0.62, 0.62, 0.42, 0.01, 0.01, 1.24, PAL.ink, 4, { rotZ: PI / 2, jitter: 0 });
    for (let i = 0; i < 5; i++) {
      b.cone(-0.48 + i * 0.24, 0.52, 0.42, 0.05, 0.1, i % 2 ? PAL.cream : c.banner, 3, { rotX: PI, scale: [1, 1, 0.4], jitter: 0 });
    }
  }
  if (s >= 4) {
    miniChicken(b, -0.2, 0.05, 0.3, 0.3, 0.85, FARM.eggBrown, true);
    banner(b, 0.62, 0.05, -0.5, 0.95, c.banner);
  }
};
