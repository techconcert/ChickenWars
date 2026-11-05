// Low-poly economy-only props (rows, stalks, pebbles, doors, sacks, wheels, barrels, signs). Fences, combs, nests,
// bales, eggs and hens are the shared parts (`parts.ts`), called with their cheap options.
import { GeoBuilder, PAL, mulRGB, toRGB, type Col } from '../builder';
import { FARM } from './farm';
import { pyramid } from './partsShapes';

const PI = Math.PI;

/** Corn row lying along X: three lumpy leaf bumps (alternating green and sage) with a tassel every 0.15. */
export function lowRow(b: GeoBuilder, x0: number, x1: number, z: number, h: number, ripe: boolean, y0 = 0): void {
  const lo = Math.min(x0, x1), hi = Math.max(x0, x1), n = 3, seg = (hi - lo) / n, r = h / 2;
  for (let i = 0; i < n; i++) {
    const rr = r * (0.9 + 0.1 * ((i * 2) % 3));
    b.cyl(lo + seg * (i + 0.5), y0 + rr, z, rr, rr, seg * 1.12, i % 2 ? FARM.sage : FARM.cornLeaf, 5, { rotZ: PI / 2, scale: [1, 1, 0.85], jitter: 0.07 });
  }
  const th = 0.1 + h * 0.35;
  let k = 0;
  for (let x = lo + 0.07; x < hi; x += 0.15, k++) {
    pyramid(b, x, y0 + h * 0.9, z + (k % 2 ? 0.02 : -0.02), 0.024, th, ripe ? FARM.corn : PAL.thatch, 3, { rotZ: (k % 3 - 1) * 0.12, jitter: 0.04 });
  }
}

/** Single corn plant, ~36 tris. */
export function lowStalk(b: GeoBuilder, x: number, z: number, h = 0.3): void {
  b.cyl(x, 0, z, 0.02, 0.028, h, FARM.cornLeaf, 4, { jitter: 0.06 });
  for (const sg of [-1, 1]) pyramid(b, x, 0.4 * h, z, 0.035, 0.17, FARM.cornLeaf, 3, { rotZ: sg * 1.0, jitter: 0.07 });
  pyramid(b, x + 0.03, 0.55 * h, z + 0.025, 0.03, 0.12, FARM.corn, 4, { jitter: 0.05 });
}

/** Compact pebble heap: 3 ring stones and a cap (80 tris). */
export function lowPebbles(b: GeoBuilder, x: number, y0: number, z: number, r = 0.16, col: Col = PAL.stone): void {
  const sr = Math.max(0.05, r * 0.5);
  const alt = mulRGB(toRGB(col), 1.18);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * PI * 2 + 0.5;
    b.sphere(x + Math.cos(a) * (r - sr) * 0.85, y0 + sr * 0.7, z + Math.sin(a) * (r - sr) * 0.85, sr * (0.9 + 0.1 * i), i % 2 ? alt : col, { scale: [1, 0.8, 1], jitter: 0.06 }, 0);
  }
  b.sphere(x, y0 + sr * 1.15, z, sr * 1.05, alt, { scale: [1, 0.85, 1], jitter: 0.06 }, 0);
}

/** Cheap door: arched dark slab with a lintel and a step (about 56 tris instead of 136). */
export function lowDoor(b: GeoBuilder, x: number, z: number, w = 0.2, h = 0.3, col: Col = PAL.timberDark, y0 = 0): void {
  b.box(x, y0, z, w, h - w / 2, 0.04, col, { jitter: 0 });
  b.cyl(x, y0 + h - w / 2, z - 0.02, w / 2, w / 2, 0.04, col, 6, { rotX: PI / 2, jitter: 0 });
  b.box(x - w / 2 - 0.025, y0, z - 0.005, 0.045, h - w / 2, 0.045, PAL.timberLight, { jitter: 0 });
  b.box(x + w / 2 + 0.025, y0, z - 0.005, 0.045, h - w / 2, 0.045, PAL.timberLight, { jitter: 0 });
  b.sphere(x + w * 0.28, y0 + h * 0.4, z + 0.03, 0.018, PAL.gold, { jitter: 0 }, 0);
}

/** Small feed sack, about 30 tris. */
export function lowSack(b: GeoBuilder, x: number, y0: number, z: number, col: Col = 0xd8c9a0, rotY = 0): void {
  b.sphere(x, y0 + 0.08, z, 0.075, col, { scale: [1, 1.15, 0.85], rotY, jitter: 0.03 }, 0);
  b.cone(x, y0 + 0.15, z, 0.035, 0.07, mulRGB(toRGB(col), 0.88), 4, { jitter: 0.02 });
  b.sphere(x + Math.sin(rotY) * 0.05, y0 + 0.1, z + Math.cos(rotY) * 0.055, 0.022, FARM.corn, { scale: [1, 1, 0.3], jitter: 0 }, 0);
}

/** Cart wheel (axis along Z), centre (x, y, z). */
export function lowWheel(b: GeoBuilder, x: number, y: number, z: number, r: number, col: Col = PAL.timberLight): void {
  b.cyl(x, y, z - 0.02, r, r, 0.04, col, 6, { rotX: PI / 2, jitter: 0 });
}

/** Barrel: two stacked tapered cylinders (64 tris). */
export function lowBarrel(b: GeoBuilder, x: number, y0: number, z: number, s = 1): void {
  b.cyl(x, y0, z, 0.065 * s, 0.05 * s, 0.075 * s, PAL.timber, 8);
  b.cyl(x, y0 + 0.075 * s, z, 0.05 * s, 0.065 * s, 0.075 * s, PAL.timber, 8);
  b.cyl(x, y0 + 0.06 * s, z, 0.069 * s, 0.069 * s, 0.03 * s, PAL.coal, 8, { jitter: 0 });
}

/** Small signpost topped with a flat egg disc (about 70 tris). */
export function miniSign(b: GeoBuilder, x: number, y0: number, z: number, s = 1, col: Col = FARM.egg): void {
  b.cyl(x, y0, z, 0.022 * s, 0.026 * s, 0.4 * s, PAL.timberDark, 4, { jitter: 0 });
  b.cyl(x, y0 + 0.5 * s, z - 0.02, 0.1 * s, 0.1 * s, 0.03, PAL.timberDark, 8, { rotX: PI / 2, jitter: 0 });
  b.sphere(x, y0 + 0.5 * s, z, 0.09 * s, col, { scale: [0.85, 1.15, 0.4], jitter: 0 }, 0);
}

/** Cheap round window (about 48 tris): framed disc facing +Z. y is the centre, z the wall surface. */
export function porthole(b: GeoBuilder, x: number, y: number, z: number, r = 0.05, lit = false): void {
  b.cyl(x, y, z - 0.005, r + 0.02, r + 0.02, 0.03, PAL.timberDark, 6, { rotX: PI / 2, jitter: 0 });
  b.cyl(x, y, z + 0.012, r, r, 0.03, lit ? FARM.warm : PAL.glass, 6, { rotX: PI / 2, emit: lit ? 0.85 : 0.35, jitter: 0 });
}
