// Reusable props for the building models (docs/10-building-art-brief.md section 2, P11 to P26).
import * as THREE from 'three';
import { GeoBuilder, PAL, mulRGB, toRGB, type Col, type PartOpts } from '../builder';
import { FEATHER } from '../chickens';
import { FARM } from './farm';
import { placed, pyramid, roundBox, taperBox } from './partsShapes';

/** P11: egg standing on y0. Sphere detail 1 for r >= 0.05 unless `detail` forces it. Gold eggs pass `{ emit: 0.25 }`. */
export function egg(b: GeoBuilder, x: number, y0: number, z: number, r = 0.04, col: Col = FARM.egg, o?: PartOpts, detail?: number): void {
  b.sphere(x, y0 + 1.1 * r, z, r, col, { jitter: 0, smooth: true, scale: [0.85, 1.12, 0.85], ...o }, detail ?? (r >= 0.05 ? 1 : 0));
}

/**
 * P12: straw nest ring with eggs in it. About 130 + 20 per egg tris. `lite` (what buildings use): a 4 x 8 torus, a
 * straw plate only for big nests (r >= 0.15) and detail-0 eggs, about 64 + 20 per egg.
 */
export function nest(b: GeoBuilder, x: number, y0: number, z: number, r = 0.12, eggs = 3, eggCol: Col = FARM.egg, lite = false): void {
  b.part(new THREE.TorusGeometry(r, r * 0.38, lite ? 4 : 5, lite ? 8 : 10), x, y0 + 0.38 * r, z, PAL.hay, { rotX: Math.PI / 2, jitter: 0.06 });
  if (!lite || r >= 0.15) b.cyl(x, y0, z, 0.8 * r, 0.8 * r, 0.5 * r, PAL.thatch, lite ? 6 : 8, { jitter: 0.04 });
  for (let i = 0; i < eggs; i++) {
    const a = (i / Math.max(1, eggs)) * Math.PI * 2 + 0.5;
    const rr = eggs === 1 ? 0 : 0.36 * r;
    egg(b, x + Math.cos(a) * rr, y0 + (lite && r < 0.15 ? 0.3 : 0.5) * r, z + Math.sin(a) * rr, 0.32 * r, eggCol, undefined, lite ? 0 : undefined);
  }
}

/** P13: rounded hay bale with a twine band (about 120 tris); `lite` is a tapered block plus band (24 tris). */
export function hayBale(b: GeoBuilder, x: number, y0: number, z: number, rotY = 0, s = 1, lite = false): void {
  if (lite) {
    taperBox(b, x, y0, z, 0.2 * s, 0.14 * s, 0.15 * s, PAL.hay, 0.97, { rotY, jitter: 0.06 });
    taperBox(b, x, y0 + 0.05 * s, z, 0.205 * s, 0.025, 0.155 * s, PAL.timberLight, 0.97, { rotY, jitter: 0 });
    return;
  }
  roundBox(b, x, y0, z, 0.2 * s, 0.14 * s, 0.15 * s, PAL.hay, 0.035 * s, { rotY, jitter: 0.06 });
  b.box(x, y0 + 0.07 * s - 0.009, z, 0.205 * s, 0.018, 0.155 * s, PAL.timberLight, { rotY, jitter: 0 });
}

/**
 * P14: round bale lying along local X (rotY turns it). Roughly 120 tris with straw end discs; `lite` (buildings) is a
 * 6-sided roll with one twine band, 48 tris.
 */
export function roundBale(b: GeoBuilder, x: number, y0: number, z: number, r = 0.11, len = 0.16, rotY = 0, lite = false): void {
  const seg = lite ? 6 : 10;
  b.part(new THREE.CylinderGeometry(r, r, len, seg), x, y0 + r, z, PAL.hay, { rotY, rotZ: Math.PI / 2, jitter: 0.05 });
  const c = Math.cos(rotY), sn = Math.sin(rotY);
  if (lite) {
    const d = len * 0.22;
    b.part(new THREE.CylinderGeometry(r + 0.008, r + 0.008, 0.03, seg), x + c * d, y0 + r, z - sn * d, PAL.timberLight, { rotY, rotZ: Math.PI / 2, jitter: 0 });
    return;
  }
  for (const sg of [-1, 1]) {
    const d = sg * (len / 2 + 0.005);
    b.part(new THREE.CylinderGeometry(0.7 * r, 0.7 * r, 0.02, 10), x + c * d, y0 + r, z - sn * d, PAL.thatch, { rotY, rotZ: Math.PI / 2, jitter: 0 });
  }
}

/** P15: feed sack with a tied neck and a corn badge on the front. */
export function feedSack(b: GeoBuilder, x: number, y0: number, z: number, col: Col = 0xd8c9a0, rotY = 0): void {
  placed(b, x, z, rotY, (s) => {
    s.sphere(0, y0 + 0.08, 0, 0.07, col, { scale: [1, 1.15, 0.8], smooth: true, jitter: 0.02 }, 1);
    s.cone(0, y0 + 0.2, 0, 0.03, 0.04, mulRGB(toRGB(col), 0.9), 5, { rotZ: Math.PI, jitter: 0.02 });
    s.sphere(0, y0 + 0.21, 0, 0.022, mulRGB(toRGB(col), 0.85), { jitter: 0 }, 0);
    s.sphere(0, y0 + 0.09, 0.05, 0.022, FARM.corn, { scale: [1, 1, 0.3], jitter: 0 }, 0);
  });
}

/** Backwards-compatible alias of `feedSack`. */
export function sack(b: GeoBuilder, x: number, y0: number, z: number, col: Col = 0xd8c9a0): void {
  feedSack(b, x, y0, z, col);
}

/** P16: signpost topped with a big egg. */
export function eggSign(b: GeoBuilder, x: number, y0: number, z: number, s = 1, col: Col = FARM.egg): void {
  b.cyl(x, y0, z, 0.025 * s, 0.025 * s, 0.45 * s, PAL.timberDark, 6, { jitter: 0 });
  b.cyl(x, y0 + 0.55 * s, z - 0.03, 0.105 * s, 0.105 * s, 0.03, PAL.timberDark, 12, { rotX: Math.PI / 2, jitter: 0 });
  b.sphere(x, y0 + 0.55 * s, z, 0.1 * s, col, { scale: [0.85, 1.15, 0.45], smooth: true, jitter: 0 }, 1);
}

export interface FenceOpts {
  /** Picket spacing (default 0.11; buildings use 0.14 to 0.2). */
  gap?: number;
  /** Number of rails: 2 (default) or 1. */
  rails?: 1 | 2;
  /** End posts: 'round' (default, cylinder with a ball cap), 'square' (cheap box post with a pointed cap) or 'none'. */
  posts?: 'round' | 'square' | 'none';
}

/** Pointed picket: a house-shaped prism, 16 tris. */
function picket(b: GeoBuilder, x: number, z: number, ang: number, h: number, col: Col): void {
  const w = 0.025, d = 0.015, tip = h + 0.045;
  b.solid(
    [[-w, 0, -d], [w, 0, -d], [w, h, -d], [0, tip, -d], [-w, h, -d], [-w, 0, d], [w, 0, d], [w, h, d], [0, tip, d], [-w, h, d]],
    [[0, 1, 2, 3, 4], [5, 6, 7, 8, 9], [0, 1, 6, 5], [1, 2, 7, 6], [2, 3, 8, 7], [3, 4, 9, 8], [4, 0, 5, 9]],
    x, 0, z, col, { rotY: ang, jitter: 0.02 },
  );
}

/**
 * P17: white picket fence from (x0, z0) to (x1, z1): pointed pickets, rails a shade darker, end posts. The one fence
 * style for every building (and the capital marker); cheap variants only change spacing, rails and posts.
 */
export function picketFence(b: GeoBuilder, x0: number, z0: number, x1: number, z1: number, h = 0.2, col: Col = PAL.white, o: FenceOpts = {}): void {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.max(2, Math.round(len / (o.gap ?? 0.11)));
  const ang = Math.atan2(-(z1 - z0), x1 - x0);
  const rail = mulRGB(toRGB(col), 0.86);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    picket(b, x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, ang, h, col);
  }
  for (const yy of (o.rails ?? 2) === 2 ? [h * 0.28, h * 0.66] : [h * 0.45]) {
    b.box((x0 + x1) / 2, yy, (z0 + z1) / 2, len, 0.035, 0.025, rail, { rotY: ang, jitter: 0.02 });
  }
  if (o.posts === 'none') return;
  for (const [px, pz] of [[x0, z0], [x1, z1]] as const) fencePost(b, px, pz, ang, h, col, o.posts === 'square');
}

function fencePost(b: GeoBuilder, px: number, pz: number, ang: number, h: number, col: Col, square: boolean): void {
  if (square) {
    b.box(px, 0, pz, 0.05, h + 0.03, 0.05, col, { rotY: ang, jitter: 0.02 });
    pyramid(b, px, h + 0.03, pz, 0.042, 0.05, col, 4, { rotY: ang + Math.PI / 4, jitter: 0.02 });
  } else {
    b.cyl(px, 0, pz, 0.04, 0.04, h + 0.04, col, 6, { jitter: 0.02 });
    b.sphere(px, h + 0.04, pz, 0.045, col, { jitter: 0.02 }, 0);
  }
}

/** A run of picket fence through `pts` ([x, z] corners); every corner gets one post, shared by both sides. */
export function picketRun(b: GeoBuilder, pts: [number, number][], h = 0.2, col: Col = PAL.white, o: FenceOpts = {}): void {
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x0, z0] = pts[i]!, [x1, z1] = pts[i + 1]!;
    picketFence(b, x0, z0, x1, z1, h, col, { ...o, posts: 'none' });
  }
  if (o.posts === 'none') return;
  for (const [px, pz] of pts) fencePost(b, px, pz, 0, h, col, o.posts === 'square');
}

/** Fence options every building uses: pickets every 0.16, one rail, square posts (about 16 tris per picket). */
export const LOW_FENCE: FenceOpts = { gap: 0.16, rails: 1, posts: 'square' };

/** P18: chicken-wire run: posts, a wire panel and a top rail. */
export function wireRun(b: GeoBuilder, x0: number, z0: number, x1: number, z1: number, h = 0.18): void {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.max(1, Math.round(len / 0.4));
  const ang = Math.atan2(-(z1 - z0), x1 - x0);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    b.cyl(x0 + (x1 - x0) * t, 0, z0 + (z1 - z0) * t, 0.03, 0.03, h + 0.03, PAL.timber, 6, { jitter: 0.02 });
  }
  const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
  b.box(mx, 0.02, mz, len, h - 0.02, 0.01, FARM.wire, { rotY: ang, emit: 0, jitter: 0 });
  b.box(mx, h, mz, len, 0.035, 0.035, PAL.timberLight, { rotY: ang, jitter: 0.02 });
}

/** P19: tiny sitting hen (no legs), about 0.18 tall at s = 1, 96 tris (`lite`: no eyes, 72 tris). */
export function miniChicken(b: GeoBuilder, x: number, y0: number, z: number, rotY = 0, s = 1, col: Col = FARM.egg, lite = false): void {
  placed(b, x, z, rotY, (m) => {
    const J: PartOpts = { jitter: 0 };
    m.sphere(0, y0 + 0.066 * s, 0, 0.07 * s, col, { scale: [0.95, 0.95, 1.2], jitter: 0.02 }, 0);
    m.sphere(0, y0 + 0.13 * s, 0.05 * s, 0.042 * s, col, J, 0);
    m.sphere(0, y0 + 0.172 * s, 0.05 * s, 0.02 * s, FEATHER.red, J, 0);
    pyramid(m, 0, y0 + 0.125 * s, 0.088 * s, 0.015 * s, 0.035 * s, FEATHER.beak, 4, { rotX: Math.PI / 2, ...J });
    if (!lite) for (const sg of [-1, 1]) m.box(sg * 0.03 * s, y0 + 0.135 * s, 0.085 * s, 0.012 * s, 0.012 * s, 0.012 * s, PAL.coal, J);
    pyramid(m, 0, y0 + 0.07 * s, -0.07 * s, 0.03 * s, 0.07 * s, FEATHER.tail, 4, { rotX: -0.9, ...J });
  });
}

/** P20: single corn plant (about 50 tris). */
export function cornStalk(b: GeoBuilder, x: number, z: number, h = 0.3, ripe = true): void {
  b.cyl(x, 0, z, 0.018, 0.026, h, FARM.cornLeaf, 5, { jitter: 0.06 });
  for (const sg of [-1, 1]) b.cone(x, 0.45 * h, z, 0.03, 0.16, FARM.cornLeaf, 3, { rotZ: sg, jitter: 0.07 });
  if (ripe) b.sphere(x + 0.03, 0.6 * h, z + 0.015, 0.032, FARM.corn, { scale: [0.8, 1.8, 0.8], jitter: 0.05 }, 0);
  b.cone(x, h, z, 0.02, 0.06, PAL.thatch, 4, { jitter: 0.04 });
}

/** P21: cheap corn row lying along X on soil at y0. */
export function cornRow(b: GeoBuilder, x0: number, x1: number, z: number, h: number, ripe: boolean, y0 = 0): void {
  const len = Math.abs(x1 - x0), r = h / 2;
  b.part(new THREE.CylinderGeometry(r, r, len, 6), (x0 + x1) / 2, y0 + r, z, FARM.cornLeaf, { rotZ: Math.PI / 2, scale: [1, 1, 0.7], jitter: 0.07 });
  if (!ripe) return;
  for (let x = Math.min(x0, x1) + 0.09; x < Math.max(x0, x1); x += 0.18) {
    b.sphere(x, y0 + h * 0.6, z + r * 0.7 + 0.005, 0.03, FARM.corn, { scale: [0.8, 1.5, 0.8], jitter: 0.05 }, 0);
  }
}

/** P22: bulging barrel with two hoops. */
export function barrel(b: GeoBuilder, x: number, y0: number, z: number, s = 1): void {
  b.cyl(x, y0, z, 0.065 * s, 0.05 * s, 0.075 * s, PAL.timber, 10);
  b.cyl(x, y0 + 0.075 * s, z, 0.05 * s, 0.065 * s, 0.075 * s, PAL.timber, 10);
  b.cyl(x, y0 + 0.012 * s, z, 0.058 * s, 0.058 * s, 0.018 * s, PAL.coal, 10, { jitter: 0 });
  b.cyl(x, y0 + 0.12 * s, z, 0.058 * s, 0.058 * s, 0.018 * s, PAL.coal, 10, { jitter: 0 });
}

/** P25: heap of detail-0 pebbles packed into a dome of radius r. */
export function pebblePile(b: GeoBuilder, x: number, y0: number, z: number, r = 0.18, col: Col = PAL.stone): void {
  const sr = Math.min(0.09, Math.max(0.05, r * 0.45));
  const alt = mulRGB(toRGB(col), 1.18);
  const ring = 5 + (r > 0.14 ? 1 : 0);
  for (let i = 0; i < ring; i++) {
    const a = (i / ring) * Math.PI * 2 + 0.4;
    const k = 0.8 + 0.2 * Math.sin(i * 2.3);
    b.sphere(x + Math.cos(a) * (r - sr) * 0.9, y0 + sr * 0.75, z + Math.sin(a) * (r - sr) * 0.9, sr * k, i % 2 ? alt : col, { scale: [1, 0.8, 1], jitter: 0.06 }, 0);
  }
  b.sphere(x, y0 + sr * 1.3, z, sr * 1.1, alt, { scale: [1, 0.85, 1], jitter: 0.06 }, 0);
}

/** P26: hanging lantern (glows). y0 is the bottom of the body. */
export function lantern(b: GeoBuilder, x: number, y0: number, z: number): void {
  b.cyl(x, y0, z, 0.03, 0.03, 0.06, FARM.warm, 6, { emit: 1, jitter: 0 });
  b.cone(x, y0 + 0.06, z, 0.04, 0.03, PAL.coal, 6, { jitter: 0 });
  b.box(x, y0 + 0.09, z, 0.03, 0.03, 0.03, PAL.coal, { jitter: 0 });
}
