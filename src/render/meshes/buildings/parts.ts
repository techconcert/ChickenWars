import { GeoBuilder, PAL, type Col } from '../builder';

export { FARM } from './farm';
export * from './partsShapes';
export * from './partsProps';

export interface BuildCtx {
  level: number;
  /** Visual stage 0..4 (hall 0..5). */
  stage: number;
  /** Banner cloth colour. */
  banner: number;
  /** Roof colour (accent override or default red). */
  roof: number;
  damaged: boolean;
}

export type Gen = (b: GeoBuilder, c: BuildCtx) => void;

/** Front of every building faces +Z (default camera yaw 0). */

export function door(b: GeoBuilder, x: number, z: number, w = 0.16, h = 0.26, col: Col = PAL.timberDark): void {
  b.box(x, 0, z, w, h, 0.04, col, { jitter: 0 });
  b.box(x, h, z, w + 0.04, 0.03, 0.05, PAL.stoneLight, { jitter: 0 });
}

export function windows(b: GeoBuilder, xs: number[], y: number, z: number, w = 0.1, h = 0.12): void {
  for (const x of xs) {
    b.box(x, y, z, w + 0.04, h + 0.04, 0.03, PAL.timberDark, { jitter: 0 });
    b.box(x, y + 0.02, z + 0.012, w, h, 0.03, PAL.glass, { emit: 0.35, jitter: 0 });
  }
}

export function chimney(b: GeoBuilder, x: number, y0: number, z: number, h: number): void {
  b.cyl(x, y0, z, 0.08, 0.09, h, PAL.stone, 8, { rotZ: 0.06, jitter: 0.03 });
  b.cyl(x - Math.sin(0.06) * h, y0 + h, z, 0.1, 0.1, 0.045, PAL.stoneDark, 8, { jitter: 0 });
}

/** Pole with a pennant (triangular tip). */
export function flag(b: GeoBuilder, x: number, y0: number, z: number, h: number, col: Col, size = 1): void {
  b.cyl(x, y0, z, 0.027, 0.032, h, PAL.timber, 6, { jitter: 0 }); // r >= 0.03 so the pole keeps its colour under the outline
  const w = 0.12 * size, ph = 0.1 * size;
  b.box(x + 0.01 + w / 2, y0 + h - ph - 0.02, z, w, ph, 0.03, col, { jitter: 0 });
  b.cone(x + 0.01 + w, y0 + h - ph / 2 - 0.02, z, ph / 2, 0.09 * size, col, 3, { rotZ: -Math.PI / 2, scale: [1, 1, 0.4], jitter: 0 });
  b.sphere(x, y0 + h + 0.01, z, 0.03, PAL.gold, { jitter: 0 }, 0);
}

/** Hanging banner on a cross-bar, visible from both sides; cloth gets longer with skull count (danger 1-5). */
export function banner(b: GeoBuilder, x: number, y0: number, z: number, h: number, col: Col, skulls = 0): void {
  const L = skulls > 0 ? 0.12 + skulls * 0.075 : 0.28;
  const top = y0 + h - 0.03;
  b.cyl(x, y0, z, 0.027, 0.032, h, PAL.timber, 6, { jitter: 0 }); // r >= 0.03 so the pole keeps its colour under the outline
  b.box(x, top, z, 0.22, 0.03, 0.03, PAL.timberDark, { jitter: 0 });
  b.box(x, top - L, z, 0.16, L, 0.03, col, { jitter: 0 });
  b.box(x, top - L - 0.03, z, 0.16, 0.035, 0.034, PAL.gold, { jitter: 0 });
  b.cone(x, top - L - 0.03, z, 0.08, 0.07, col, 3, { rotX: Math.PI, scale: [1, 1, 0.45], jitter: 0 });
  for (let i = 0; i < skulls; i++) {
    const yy = top - 0.07 - i * 0.075;
    b.skull(x, yy, z + 0.018, 0.03, 1);
    b.skull(x, yy, z - 0.018, 0.03, -1);
  }
}

export function fence(b: GeoBuilder, x0: number, z0: number, x1: number, z1: number, h = 0.16, col: Col = PAL.timberLight): void {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.max(2, Math.round(len / 0.18));
  const ang = Math.atan2(-(z1 - z0), x1 - x0);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    b.box(x0 + (x1 - x0) * t, 0, z0 + (z1 - z0) * t, 0.035, h, 0.035, col, { jitter: 0.03 });
  }
  for (const yy of [h * 0.35, h * 0.75]) {
    b.box((x0 + x1) / 2, yy, (z0 + z1) / 2, len, 0.025, 0.02, col, { rotY: ang, jitter: 0.03 });
  }
}

export function crate(b: GeoBuilder, x: number, y0: number, z: number, s = 0.14, rotY = 0): void {
  b.box(x, y0, z, s, s, s, PAL.timberLight, { rotY });
  b.box(x, y0 + s * 0.4, z, s * 1.02, s * 0.2, s * 1.02, PAL.timber, { rotY, jitter: 0 });
}

/** Pile of logs lying along local X (rotated by rotY). */
export function logPile(b: GeoBuilder, x: number, y0: number, z: number, rows = 3, len = 0.4, rotY = 0): void {
  const cs = Math.cos(rotY), sn = Math.sin(rotY);
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < rows - r; i++) {
      const off = (i - (rows - r - 1) / 2) * 0.095;
      b.cyl(x - sn * off, y0 + 0.045 + r * 0.082, z - cs * off, 0.045, 0.045, len, i % 2 ? PAL.timberLight : PAL.timber, 6, { rotZ: Math.PI / 2, rotY });
    }
  }
}

/** Crenellation ring around a rectangle (merlons). */
export function merlons(b: GeoBuilder, cx: number, y0: number, cz: number, w: number, d: number, col: Col = PAL.stoneLight, h = 0.08): void {
  const step = 0.17;
  const nx = Math.max(2, Math.round(w / step)), nz = Math.max(2, Math.round(d / step));
  for (let i = 0; i <= nx; i++) {
    const x = cx - w / 2 + (w * i) / nx;
    b.box(x, y0, cz - d / 2, 0.08, h, 0.08, col);
    b.box(x, y0, cz + d / 2, 0.08, h, 0.08, col);
  }
  for (let i = 1; i < nz; i++) {
    const z = cz - d / 2 + (d * i) / nz;
    b.box(cx - w / 2, y0, z, 0.08, h, 0.08, col);
    b.box(cx + w / 2, y0, z, 0.08, h, 0.08, col);
  }
}

/** Round tower with cone roof (turret). */
export function turret(b: GeoBuilder, x: number, z: number, r: number, h: number, roofCol: Col, wall: Col = PAL.stoneLight, roofH = 0.4): void {
  b.cyl(x, 0, z, r, r * 1.08, h, wall, 8);
  b.cyl(x, h, z, r * 1.2, r * 1.2, 0.05, PAL.stoneDark, 8, { jitter: 0 });
  b.cone(x, h + 0.05, z, r * 1.35, roofH, roofCol, 8);
  b.box(x, h * 0.65, z + r * 0.95, 0.05, 0.1, 0.03, PAL.coal, { jitter: 0 });
}

/** Wood-framed hut: walls + gable roof + door + windows. */
export function hut(
  b: GeoBuilder, x: number, z: number, w: number, d: number, h: number, wall: Col, roof: Col, roofH: number,
  rotY = 0, withDoor = true,
): void {
  const s = new GeoBuilder(3);
  s.box(0, 0, 0, w, h, d, wall);
  s.box(-w / 2 + 0.02, 0, d / 2 - 0.02, 0.05, h, 0.05, PAL.timber, { jitter: 0 });
  s.box(w / 2 - 0.02, 0, d / 2 - 0.02, 0.05, h, 0.05, PAL.timber, { jitter: 0 });
  s.gable(0, h, 0, w + 0.14, d + 0.14, roofH, roof);
  if (withDoor) door(s, w > 0.5 ? -w * 0.2 : 0, d / 2, 0.13, Math.min(0.24, h * 0.7));
  if (w > 0.5) windows(s, [w * 0.25], h * 0.35, d / 2, 0.09, 0.1);
  b.append(GeoBuilder.transformed(s, x, 0, z, rotY));
}

/** Smoke-ish grey puff cluster. */
export function smokePuff(b: GeoBuilder, x: number, y0: number, z: number, s = 1): void {
  b.sphere(x, y0, z, 0.09 * s, 0x8d8b88, { jitter: 0, emit: 0.1 }, 0);
  b.sphere(x + 0.05 * s, y0 + 0.13 * s, z, 0.075 * s, 0x9a9895, { jitter: 0, emit: 0.1 }, 0);
  b.sphere(x - 0.02 * s, y0 + 0.25 * s, z + 0.03 * s, 0.06 * s, 0xaaa8a4, { jitter: 0, emit: 0.1 }, 0);
}

/** Warm lit windows (tavern, homes): yellow emissive panes with dark frames. */
export function warmWindows(b: GeoBuilder, xs: number[], y: number, z: number, w = 0.1, h = 0.12): void {
  for (const x of xs) {
    b.box(x, y, z, w + 0.04, h + 0.04, 0.03, PAL.timberDark, { jitter: 0 });
    b.box(x, y + 0.02, z + 0.012, w, h, 0.03, 0xffc766, { emit: 0.85, jitter: 0 });
  }
}

/** Herb/leaf sign on a post (infirmary cue; deliberately not a cross). */
export function leafSign(b: GeoBuilder, x: number, y0: number, z: number, s = 1): void {
  b.cyl(x, y0, z, 0.02 * s, 0.025 * s, 0.5 * s, PAL.timberDark, 5, { jitter: 0 });
  b.cyl(x, y0 + 0.5 * s, z, 0.17 * s, 0.17 * s, 0.035 * s, PAL.cream, 14, { rotX: Math.PI / 2, jitter: 0 });
  b.sphere(x, y0 + 0.55 * s, z + 0.03 * s, 0.1 * s, 0x3f9a4e, { scale: [0.62, 1, 0.3], rotZ: -0.7, jitter: 0 }, 0);
  b.sphere(x + 0.06 * s, y0 + 0.5 * s, z + 0.03 * s, 0.065 * s, 0x6cc070, { scale: [0.6, 1, 0.3], rotZ: 0.9, jitter: 0 }, 0);
  b.box(x - 0.02 * s, y0 + 0.4 * s, z + 0.03 * s, 0.012 * s, 0.1 * s, 0.01, 0x2f7a3a, { rotZ: -0.6, jitter: 0 });
}
