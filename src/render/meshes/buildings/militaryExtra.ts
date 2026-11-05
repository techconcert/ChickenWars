// Small local helpers shared by military.ts, support.ts and supportExtra.ts (slabs, posts, kegs, targets, cogs, ladders).
// Fences, combs, nests and bales are the shared parts in parts.ts, called with their cheap options.
import * as THREE from 'three';
import { PAL, type Col, type GeoBuilder } from '../builder';
import {
  FARM, LOW_FENCE, banner, barnRoof, chimney, egg, face, hayBale, miniChicken, picketFence, placed, roundBale, roundBox, smokePuff, softGable,
  taperBox, type Gen,
} from './parts';

/** Low stone plinth under a main mass (stage 3+). Base sits on the ground. */
export function plinth(b: GeoBuilder, cx: number, cz: number, w: number, d: number, h = 0.1): void {
  taperBox(b, cx, 0, cz, w, h, d, PAL.stoneLight, 0.94, { jitter: 0.03 });
}

/** Cheap wall slab (12 tris): taperBox with a hint of taper, used for everything that is not a main mass. */
export function slab(b: GeoBuilder, x: number, y0: number, z: number, w: number, h: number, d: number, col: Col, o?: { rotY?: number; jitter?: number }): void {
  taperBox(b, x, y0, z, w, h, d, col, 0.97, o);
}



/** Small cask: two tapered halves and a hoop (about 72 tris). */
export function keg(b: GeoBuilder, x: number, y0: number, z: number, k = 1): void {
  b.cyl(x, y0, z, 0.065 * k, 0.05 * k, 0.075 * k, PAL.timber, 6);
  b.cyl(x, y0 + 0.075 * k, z, 0.05 * k, 0.065 * k, 0.075 * k, PAL.timber, 6);
  b.cyl(x, y0 + 0.06 * k, z, 0.07 * k, 0.07 * k, 0.03 * k, PAL.coal, 6, { jitter: 0 });
}


/** Plain door slab with a lintel, base at y0 (24 tris). */
export function doorY(b: GeoBuilder, x: number, z: number, w = 0.17, h = 0.26, col: Col = PAL.timberDark, y0 = 0): void {
  slab(b, x, y0, z, w, h, 0.04, col, { jitter: 0 });
  slab(b, x, y0 + h, z, w + 0.05, 0.035, 0.05, PAL.stoneLight, { jitter: 0 });
  b.sphere(x + w * 0.28, y0 + h * 0.45, z + 0.03, 0.018, PAL.gold, { jitter: 0 }, 0);
}


/** Simple round post. */
export function post(b: GeoBuilder, x: number, y0: number, z: number, h: number, r = 0.04, col: Col = PAL.timber, seg = 6): void {
  b.cyl(x, y0, z, r, r * 1.05, h, col, seg, { jitter: 0.02 });
}

/** Flat farmer cut-out target (human enemy): red coat, skin head, straw hat. Faces +Z before rotY. */
export function farmerCutout(b: GeoBuilder, x: number, y0: number, z: number, rotY = 0, s = 1): void {
  placed(b, x, z, rotY, (m) => {
    const J = { jitter: 0 };
    m.box(0, y0 + 0.02 * s, -0.035 * s, 0.035, 0.22 * s, 0.035, PAL.timberDark, J);
    m.box(0, y0 + 0.03 * s, 0, 0.17 * s, 0.24 * s, 0.035, 0xb3453c, J);
    m.cyl(0, y0 + 0.275 * s, 0.0, 0.05 * s, 0.05 * s, 0.035, PAL.skin, 10, { rotX: Math.PI / 2, ...J });
    m.cyl(0, y0 + 0.325 * s, 0.0, 0.085 * s, 0.085 * s, 0.025, PAL.hay, 10, J);
    m.sphere(0, y0 + 0.345 * s, 0.0, 0.04 * s, PAL.hay, J, 0);
  });
}

/** Round target: concentric discs facing +Z, centre at y (about 110 tris). */
export function bullseye(b: GeoBuilder, x: number, y: number, z: number, r = 0.16): void {
  const J = { jitter: 0, rotX: Math.PI / 2 };
  b.cyl(x, y, z, r, r, 0.04, PAL.white, 10, J);
  b.cyl(x, y, z + 0.015, r * 0.7, r * 0.7, 0.04, FARM.barnRed, 10, J);
  b.cyl(x, y, z + 0.03, r * 0.36, r * 0.36, 0.04, PAL.white, 8, J);
}


/** Cog facing +Z, centre at (x, y), `n` teeth. */
export function cog(b: GeoBuilder, x: number, y: number, z: number, r: number, col: Col, n = 8, rot = 0, hub: Col = PAL.gold): void {
  const th = 0.07;
  n = Math.min(n, 8);
  b.cyl(x, y, z - th / 2, r, r, th, col, n, { rotX: Math.PI / 2, jitter: 0.02 });
  const t = Math.max(0.06, r * 0.4);
  const g = new THREE.BoxGeometry(t, t * 0.9, th);
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    b.part(g, x + Math.cos(a) * r, y + Math.sin(a) * r, z, col, { rotZ: a, jitter: 0.02 });
  }
  g.dispose();
  b.sphere(x, y, z + th / 2 + 0.005, r * 0.3, hub, { jitter: 0, scale: [1, 1, 0.6] }, 0);
}

/** Egg splat decal on a surface facing +Z. */
export function eggSplat(b: GeoBuilder, x: number, y: number, z: number, r = 0.04): void {
  b.sphere(x, y, z, r, FARM.egg, { scale: [1, 0.9, 0.22], jitter: 0 }, 0);
  b.sphere(x + r * 0.2, y, z + r * 0.12, r * 0.45, FARM.corn, { scale: [1, 1, 0.3], jitter: 0 }, 0);
}

/** Leafy bush ball. */
export function bush(b: GeoBuilder, x: number, z: number, r = 0.07, col: Col = FARM.sage): void {
  b.sphere(x, r * 0.8, z, r * 1.1, col, { scale: [1.1, 0.85, 1], smooth: true, jitter: 0.06 }, 0);
}

/** Simple ladder leaning on a +Z wall (rails + rungs), base at y0, height h, centred at x. */
export function ladder(b: GeoBuilder, x: number, y0: number, z: number, h: number, w = 0.14, tilt = 0): void {
  for (const sg of [-1, 1]) b.box(x + sg * w / 2, y0, z, 0.04, h, 0.04, PAL.timber, { rotX: tilt, jitter: 0.02 });
  const n = Math.max(2, Math.round(h / 0.17));
  for (let i = 1; i <= n; i++) b.box(x, y0 + (h * i) / (n + 1), z, w, 0.04, 0.04, PAL.timberLight, { rotX: tilt, jitter: 0.02 });
}

/** Box centred on (x, y, z), rotated about Z (diagonal braces). */
function diag(b: GeoBuilder, x: number, y: number, z: number, len: number, w: number, rot: number, col: Col): void {
  const g = new THREE.BoxGeometry(len, w, 0.03);
  b.part(g, x, y, z, col, { rotZ: rot, jitter: 0 });
  g.dispose();
}

/** Tiny piglet (about 60 tris) facing +Z. */
function piglet(b: GeoBuilder, x: number, y0: number, z: number, rotY = 0, k = 1): void {
  placed(b, x, z, rotY, (m) => {
    const J = { jitter: 0 };
    m.sphere(0, y0 + 0.085 * k, 0, 0.1 * k, FARM.pink, { scale: [1, 0.85, 1.4], smooth: true, jitter: 0.02 }, 0);
    m.cyl(0, y0 + 0.085 * k, 0.12 * k, 0.04 * k, 0.04 * k, 0.04, FARM.pinkDark, 6, { rotX: Math.PI / 2, ...J });
    for (const sg of [-1, 1]) {
      m.box(sg * 0.045 * k, y0 + 0.125 * k, 0.12 * k, 0.025, 0.03, 0.03, PAL.coal, J);
      m.cone(sg * 0.065 * k, y0 + 0.16 * k, 0.05 * k, 0.035 * k, 0.07 * k, FARM.pinkDark, 4, { rotZ: -sg * 0.5, ...J });
    }
    m.sphere(0, y0 + 0.1 * k, -0.17 * k, 0.025 * k, FARM.pinkDark, J, 0);
  });
}

/** Pig weathervane in profile facing +X, curly tail. */
function pigVane(b: GeoBuilder, x: number, y0: number, z: number, k = 1): void {
  const J = { jitter: 0, emit: 0.08 };
  b.cyl(x, y0, z, 0.014, 0.014, 0.1 * k, PAL.coal, 5, { jitter: 0 });
  b.box(x, y0 + 0.08 * k, z, 0.2 * k, 0.03, 0.03, PAL.coal, { jitter: 0 });
  const by = y0 + 0.17 * k;
  b.sphere(x, by, z, 0.065 * k, FARM.pinkDark, { ...J, scale: [1.3, 1, 0.55] }, 0);
  b.sphere(x + 0.09 * k, by + 0.015 * k, z, 0.04 * k, FARM.pinkDark, { ...J, scale: [1, 1, 0.6] }, 0);
  b.cyl(x + 0.13 * k, by, z, 0.022 * k, 0.022 * k, 0.04, FARM.pink, 6, { ...J, rotZ: -Math.PI / 2 });
  b.cone(x + 0.07 * k, by + 0.045 * k, z, 0.025 * k, 0.05 * k, FARM.pinkDark, 4, { ...J, rotZ: 0.4 });
  b.part(new THREE.TorusGeometry(0.03 * k, 0.018, 3, 6), x - 0.09 * k, by + 0.02 * k, z, FARM.pinkDark, { ...J, rotX: 0 });
  for (const dx of [-0.04, 0.05]) b.cyl(x + dx * k, by - 0.1 * k, z, 0.016, 0.016, 0.06 * k, FARM.pinkDark, 5, J);
}

export const stable: Gen = (b, c) => {
  const s = c.stage;
  const pl = s >= 3 ? 0.1 : 0;
  // the mud wallow
  b.cyl(0.05, 0, s === 0 ? 0.3 : 0.46, 0.27, 0.28, 0.025, FARM.mud, 12, { scale: [1, 1, 0.7], jitter: 0 });
  slab(b, -0.42, 0, s === 0 ? 0.32 : 0.52, 0.3, 0.07, 0.1, PAL.timber);
  b.box(-0.42, 0.065, s === 0 ? 0.32 : 0.52, 0.24, 0.02, 0.06, PAL.hay, { jitter: 0.05 });
  if (s === 0) {
    // pink-planked lean-to with a big snout sign, a pink trough and the mud wallow
    taperBox(b, 0, 0, -0.3, 0.8, 0.34, 0.4, FARM.pink, 0.96);
    b.shed(0, 0.34, -0.3, 0.95, 0.56, 0.18, c.roof, { jitter: 0.04 });
    for (const sg of [-1, 1]) post(b, sg * 0.4, 0, -0.07, 0.34, 0.035, PAL.timberDark);
    b.box(0, 0.04, -0.08, 0.3, 0.22, 0.03, PAL.timberDark, { jitter: 0 });
    face(b, 0, 0.3, -0.085, 1.0, 'pig');
    slab(b, 0.38, 0, 0.56, 0.3, 0.1, 0.12, FARM.pink);
    slab(b, 0.38, 0.1, 0.56, 0.22, 0.02, 0.06, FARM.pinkDark, { jitter: 0 });
    return;
  }
  const wh = s >= 4 ? 0.44 : s >= 2 ? 0.4 : 0.36;
  const gh = s >= 2 ? 0.45 : 0.3;
  if (s >= 3) plinth(b, 0, -0.2, 0.9, 0.8);
  roundBox(b, 0, pl, -0.2, 0.8, wh, 0.7, FARM.pink, 0.045);
  for (const sx of [-1, 1]) for (const sz of [-0.55, 0.15]) b.box(sx * 0.4, pl, sz + (sz > 0 ? 0 : 0), 0.05, wh, 0.05, PAL.timber, { jitter: 0 });
  slab(b, 0, pl + wh * 0.55, 0.15, 0.82, 0.04, 0.03, PAL.timber, { jitter: 0 });
  const rt = softGable(b, 0, pl + wh, -0.2, 0.7, 0.8, gh, c.roof, { rotY: Math.PI / 2, infill: FARM.pink, over: 0.04, ridge: s >= 4 ? PAL.gold : undefined });
  // two half-doors
  for (const sx of [-0.2, 0.2]) {
    b.box(sx, pl, 0.155, 0.28, 0.28, 0.02, PAL.timberDark, { jitter: 0 });
    b.box(sx, pl, 0.17, 0.26, 0.13, 0.03, PAL.timberLight, { jitter: 0.02 });
    b.box(sx, pl + 0.13, 0.17, 0.3, 0.035, 0.035, PAL.timber, { jitter: 0 });
  }
  if (s >= 2) face(b, 0, pl + wh + 0.14, 0.15, 1.05, 'pig');
  else b.sphere(0, pl + wh + 0.1, 0.16, 0.04, FARM.pinkDark, { jitter: 0, scale: [1.2, 1, 0.4] }, 0);
  // paddock
  picketFence(b, -0.66, 0.3, -0.66, 0.7, 0.14, PAL.white, { ...LOW_FENCE, gap: 0.3 });
  picketFence(b, -0.66, 0.7, 0.66, 0.7, 0.14, PAL.white, { ...LOW_FENCE, gap: 0.3 });
  picketFence(b, 0.66, 0.7, 0.66, 0.3, 0.14, PAL.white, { ...LOW_FENCE, gap: 0.3 });
  if (s >= 3) {
    // hay loft wing with its own gable along X
    taperBox(b, 0.52, pl, -0.32, 0.3, 0.38, 0.4, FARM.pink, 0.96);
    softGable(b, 0.52, pl + 0.38, -0.32, 0.3, 0.42, 0.18, c.roof, { infill: FARM.pink });
    hayBale(b, 0.52, pl, 0.0, 0.1, 1.0, true);
    // saddle rack with a team blanket
    post(b, -0.62, 0, 0.12, 0.22, 0.035, PAL.timberDark);
    post(b, -0.42, 0, 0.12, 0.22, 0.035, PAL.timberDark);
    b.box(-0.52, 0.2, 0.12, 0.26, 0.04, 0.04, PAL.timberDark, { jitter: 0 });
    b.box(-0.52, 0.14, 0.12, 0.18, 0.08, 0.08, c.banner, { jitter: 0 });
    piglet(b, 0.1, 0, 0.45, 0.2);
  } else {
    hayBale(b, 0.5, 0, 0.5, 0.2, 1, true);
  }
  if (s >= 4) {
    pigVane(b, 0, rt - 0.02, -0.2, 1.1);
    piglet(b, -0.15, 0, 0.5, -0.5);
    banner(b, 0.68, 0, 0.1, 0.9, c.banner);
  }
};

export const workshop: Gen = (b, c) => {
  const s = c.stage;
  const pl = s >= 3 ? 0.1 : 0;
  if (s === 0) {
    // open smithy: red back wall, brown lean-to roof, a big upright cog facing the camera
    for (const sx of [-1, 1]) post(b, sx * 0.38, 0, -0.05, 0.42, 0.035);
    slab(b, 0, 0, -0.42, 0.84, 0.42, 0.06, FARM.barnRed);
    b.shed(0, 0.42, -0.24, 0.94, 0.56, 0.16, c.roof, { jitter: 0.04 });
    slab(b, -0.1, 0, -0.28, 0.5, 0.2, 0.24, PAL.timber);
    cog(b, 0.34, 0.3, 0.32, 0.22, PAL.stoneDark, 8, 0.2);
    keg(b, -0.5, 0, 0.22, 1.2);
    return;
  }
  const wh = s >= 4 ? 0.5 : s >= 2 ? 0.48 : 0.4;
  const rh = s >= 4 ? 0.65 : s >= 2 ? 0.5 : 0.36;
  if (s >= 3) plinth(b, 0, -0.2, 0.96, 0.72);
  roundBox(b, 0, pl, -0.2, 0.8, wh, 0.6, FARM.barnRed, 0.045);
  barnRoof(b, 0, pl + wh, -0.2, 0.6, 0.8, rh, c.roof, { rotY: Math.PI / 2, infill: FARM.barnRed, ridge: s >= 4 ? PAL.gold : undefined });
  // X-braced barn door
  const dz = 0.115;
  b.box(0, pl, dz, 0.32, 0.3, 0.03, FARM.barnRedDark, { jitter: 0 });
  for (const sx of [-1, 1]) b.box(sx * 0.16, pl, dz + 0.01, 0.04, 0.32, 0.04, PAL.white, { jitter: 0 });
  b.box(0, pl + 0.3, dz + 0.01, 0.36, 0.04, 0.04, PAL.white, { jitter: 0 });
  diag(b, 0, pl + 0.15, dz + 0.02, 0.4, 0.04, Math.PI / 4, PAL.white);
  diag(b, 0, pl + 0.15, dz + 0.02, 0.4, 0.04, -Math.PI / 4, PAL.white);
  if (s === 1) {
    b.cyl(0, pl + wh + 0.16, 0.185, 0.08, 0.08, 0.03, FARM.warm, 10, { rotX: Math.PI / 2, emit: 0.85, jitter: 0 });
  } else {
    cog(b, 0, pl + wh + 0.2, 0.225, 0.17, PAL.stoneLight, 8, 0.2);
    chimney(b, -0.28, pl + wh + 0.2, -0.38, 0.4);
    smokePuff(b, -0.28 - 0.02, pl + wh + 0.65, -0.38, 0.9);
  }
  if (s >= 4) cog(b, 0.27, pl + wh + 0.06, 0.225, 0.11, PAL.stoneDark, 8, 0.6);
  // bench with a cog and barrel in the yard
  const bz = 0.36;
  slab(b, -0.48, 0, bz, 0.4, 0.18, 0.2, PAL.timber);
  if (s >= 3) miniChicken(b, -0.48, 0.18, bz, 0.3, 0.9);
  else cog(b, -0.48, 0.28, bz, 0.09, PAL.stoneDark, 8, 0.3);
  if (s >= 3) {
    // goggles on the engineer hen
    for (const sg of [-1, 1]) b.sphere(-0.48 + sg * 0.03 + 0.012, 0.18 + 0.135 * 0.9, bz + 0.09, 0.024, PAL.glass, { emit: 0.3, jitter: 0, scale: [1, 1, 0.6] }, 0);
  }
  keg(b, -0.62, 0, 0.12);
  cog(b, -0.2, 0.11, 0.5, 0.1, PAL.stoneDark, 8, 0.4);
  if (s >= 3) {
    // jib crane at the back right: one mast, a boom swinging out sideways, a bale hanging beside the barn
    const mx = 0.62, mz = -0.45;
    b.cyl(mx, 0, mz, 0.04, 0.055, 1.0, PAL.timber, 6, { jitter: 0.02 });
    b.box(mx, 0.96, mz + 0.25, 0.05, 0.05, 0.5, PAL.timberLight, { jitter: 0.02 });
    b.box(mx, 0.6, mz, 0.035, 0.5, 0.035, PAL.timberLight, { rotX: 0.78, jitter: 0.02 });
    b.cyl(mx, 0.96, mz + 0.48, 0.05, 0.05, 0.04, PAL.stoneDark, 8, { rotZ: Math.PI / 2, jitter: 0 });
    b.cyl(mx, 0.52, mz + 0.48, 0.01, 0.01, 0.44, PAL.coal, 4, { jitter: 0 });
    roundBale(b, mx + 0.08 - 0.16, 0.38, mz + 0.48, 0.11, 0.16, 0, true);
  }
  if (s >= 4) {
    // egg-catapult prototype
    const px = 0.1, pz = 0.55;
    placed(b, px, pz, 0.2, (m) => {
      const k = 0.7;
      for (const sg of [-1, 1]) {
        m.box(sg * 0.1 * k, 0, 0, 0.06, 0.05, 0.42 * k, PAL.timberLight);
        m.box(sg * 0.1 * k, 0.05, 0.04, 0.05, 0.22 * k, 0.05, PAL.timber);
      }
      m.box(0, 0.13, 0.04, 0.24 * k, 0.04, 0.04, PAL.timberDark, { jitter: 0 });
      m.box(0, 0.1, -0.02, 0.05, 0.04, 0.38 * k, PAL.timber, { rotX: 0.6 });
      m.cyl(0, 0.2, -0.13, 0.055, 0.04, 0.05, PAL.thatch, 8, { jitter: 0.03 });
      egg(m, 0, 0.23, -0.13, 0.04);
      for (const sg of [-1, 1]) m.cyl(sg * 0.13 * k, 0, 0.1 * k, 0.04, 0.04, 0.03, PAL.timberDark, 8, { rotZ: Math.PI / 2, jitter: 0 });
    });
    banner(b, -0.68, 0, -0.4, 0.9, c.banner);
  }
};
