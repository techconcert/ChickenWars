// Reusable rounded / roofed shapes for the building models (docs/10-building-art-brief.md section 2, P1 to P10).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { GeoBuilder, PAL, mulRGB, toRGB, type Col, type PartOpts } from '../builder';
import { FEATHER } from '../chickens';
import { FARM } from './farm';

/**
 * Build `fn` into a scratch builder in local coordinates (origin at the footprint centre, real heights) and append it
 * rotated by `rotY` about the vertical axis through (x, z). Deterministic jitter seed derived from the position.
 */
export function placed(b: GeoBuilder, x: number, z: number, rotY: number, fn: (s: GeoBuilder) => void): void {
  const s = new GeoBuilder(((Math.round(x * 100) * 31 + Math.round(z * 100)) | 0) + 5);
  s.ao = b.ao;
  fn(s);
  b.append(GeoBuilder.transformed(s, x, 0, z, rotY));
}

/**
 * Cheap cone: an n-sided pyramid, base centre at (x, y0, z), same orientation and rotation pivot as `b.cone`. A
 * `b.cone(.., seg)` costs 3 * seg triangles (seg of them degenerate); this costs 2 * seg - 2 (3 sides: 4, 4 sides: 6).
 */
export function pyramid(b: GeoBuilder, x: number, y0: number, z: number, r: number, h: number, col: Col, seg = 4, o?: PartOpts): void {
  const verts: number[][] = [[0, h, 0]];
  const base: number[] = [];
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    verts.push([Math.sin(a) * r, 0, Math.cos(a) * r]);
    base.push(i + 1);
  }
  const faces: number[][] = [base];
  for (let i = 0; i < seg; i++) faces.push([0, i + 1, ((i + 1) % seg) + 1]);
  b.solid(verts, faces, x, y0, z, col, o);
}

/** P1: rounded-edge wall mass; y0 is the base. 108 tris. */
export function roundBox(b: GeoBuilder, x: number, y0: number, z: number, w: number, h: number, d: number, col: Col, r = 0.04, o?: PartOpts): void {
  const g = new RoundedBoxGeometry(w, h, d, 1, r);
  g.translate(0, h / 2, 0);
  b.part(g, x, y0, z, col, { jitter: 0.02, ...o });
  g.dispose();
}

/** P2: box whose top is `taper` times the base footprint. 12 tris. */
export function taperBox(b: GeoBuilder, x: number, y0: number, z: number, w: number, h: number, d: number, col: Col, taper = 0.93, o?: PartOpts): void {
  const a = w / 2, c = d / 2, ta = a * taper, tc = c * taper;
  b.solid(
    [[-a, 0, -c], [a, 0, -c], [a, 0, c], [-a, 0, c], [-ta, h, -tc], [ta, h, -tc], [ta, h, tc], [-ta, h, tc]],
    [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [1, 2, 6, 5], [3, 0, 4, 7]],
    x, y0, z, col, { jitter: 0.02, ...o },
  );
}

export interface GableOpts { rotY?: number; over?: number; thick?: number; infill?: Col; ridge?: Col }

function ridgeRoll(s: GeoBuilder, len: number, y: number, col: Col): void {
  // cylinder is built along +Y then rotZ(PI/2) sends +Y to -X, so start at +len/2
  s.cyl(len / 2, y, 0, 0.045, 0.045, len, col, 8, { rotZ: Math.PI / 2, jitter: 0.02 });
}

/**
 * P3: gable roof made of two overhanging slabs plus a ridge roll. Ridge along local X (rotY turns it).
 * `infill` fills the gable triangles (wall colour). Returns the absolute y of the ridge top. About 70 tris.
 */
export function softGable(b: GeoBuilder, x: number, y0: number, z: number, len: number, wid: number, h: number, col: Col, o: GableOpts = {}): number {
  const over = o.over ?? 0.09, thick = o.thick ?? 0.07, hw = wid / 2;
  const a = Math.atan2(h, hw), hyp = Math.hypot(hw, h);
  const back = thick * Math.tan(a); // slabs start past the ridge so their top faces meet at the apex
  const L = hyp + over + back;
  const apex = h + thick / Math.cos(a);
  const rc = apex - 0.02;
  const ridge = o.ridge ?? mulRGB(toRGB(col), 0.82);
  placed(b, x, z, o.rotY ?? 0, (s) => {
    s.gable(0, y0, 0, len, wid, h, o.infill ?? mulRGB(toRGB(col), 0.6), { jitter: 0.02 });
    for (const side of [1, -1]) {
      const t = L / 2 - back; // distance down the slope from the ridge to the slab centre
      const cy = y0 + h - t * Math.sin(a) + (thick / 2) * Math.cos(a);
      const cz = side * (t * Math.cos(a) + (thick / 2) * Math.sin(a));
      const g = new THREE.BoxGeometry(len + 2 * over, thick, L);
      s.part(g, 0, cy, cz, col, { rotX: side * a, jitter: 0.02 });
      g.dispose();
    }
    ridgeRoll(s, len + 2 * over, y0 + rc, ridge);
  });
  return y0 + rc + 0.045;
}

/**
 * P4: gambrel barn roof, ridge along local X. `infill` colours the gable ends (wall colour).
 * Returns the absolute y of the ridge top. About 60 tris.
 */
export function barnRoof(b: GeoBuilder, x: number, y0: number, z: number, len: number, wid: number, h: number, col: Col, o: { rotY?: number; ridge?: Col; infill?: Col } = {}): number {
  const prism = (s: GeoBuilder, w: number, l: number, c: Col, yy: number): void => {
    const pts: [number, number][] = [[-w, 0], [-0.7 * w, 0.62 * h], [0, h], [0.7 * w, 0.62 * h], [w, 0]];
    const verts: number[][] = [];
    for (const dx of [-l / 2, l / 2]) for (const [pz, py] of pts) verts.push([dx, py, pz]);
    const faces: number[][] = [[0, 1, 2, 3, 4], [5, 6, 7, 8, 9]];
    for (let i = 0; i < 5; i++) faces.push([i, (i + 1) % 5, 5 + ((i + 1) % 5), 5 + i]);
    s.solid(verts, faces, 0, yy, 0, c, { jitter: 0.02 });
  };
  const w = wid / 2 + 0.08;
  placed(b, x, z, o.rotY ?? 0, (s) => {
    prism(s, w, len + 0.16, col, y0);
    if (o.infill !== undefined) prism(s, wid / 2, len + 0.17, o.infill, y0);
    ridgeRoll(s, len + 0.16, y0 + h, o.ridge ?? mulRGB(toRGB(col), 0.82));
  });
  return y0 + h + 0.045;
}

/**
 * P5: hemispherical dome with a lip ring (set `lip` false for a plain mound). About 110 tris at the defaults; the cheap
 * building variant is `seg` 8 with `{ rings: 2 }` (about 64 tris). Returns the top y.
 */
export function domeRoof(
  b: GeoBuilder, x: number, y0: number, z: number, r: number, h: number, col: Col, seg = 10, lip = true,
  o: { rings?: number; lipCol?: Col } = {},
): number {
  const g = new THREE.SphereGeometry(1, seg, o.rings ?? 4, 0, Math.PI * 2, 0, Math.PI / 2);
  b.part(g, x, y0, z, col, { scale: [r, h, r], smooth: true, jitter: 0.02 });
  g.dispose();
  if (lip) b.cyl(x, y0, z, r * 1.06, r * 1.06, 0.04, o.lipCol ?? mulRGB(toRGB(col), 0.82), seg, { jitter: 0.02 });
  return y0 + h;
}

/** P6: round porthole window; y is the centre, z the wall surface. */
export function roundWindow(b: GeoBuilder, x: number, y: number, z: number, r = 0.07, lit = false): void {
  b.cyl(x, y, z - 0.005, r + 0.025, r + 0.025, 0.03, PAL.timberDark, 10, { rotX: Math.PI / 2, jitter: 0 });
  b.cyl(x, y, z + 0.012, r, r, 0.03, lit ? FARM.warm : PAL.glass, 10, { rotX: Math.PI / 2, emit: lit ? 0.85 : 0.35, jitter: 0 });
  b.box(x, y - 0.01, z + 0.04, 2 * r, 0.02, 0.01, PAL.timberDark, { jitter: 0 });
  b.box(x - 0.01, y - r, z + 0.04, 0.02, 2 * r, 0.01, PAL.timberDark, { jitter: 0 });
}

/** P7: arched door with frame, knob and stone step. y0 is the base (default ground). */
export function archDoor(b: GeoBuilder, x: number, z: number, w = 0.2, h = 0.3, col: Col = PAL.timberDark, y0 = 0): void {
  const fw = w + 0.05;
  b.box(x, y0, z, fw, h - w / 2, 0.03, PAL.timberLight, { jitter: 0 });
  b.cyl(x, y0 + h - w / 2, z - 0.015, fw / 2, fw / 2, 0.03, PAL.timberLight, 10, { rotX: Math.PI / 2, jitter: 0 });
  b.box(x, y0, z + 0.012, w, h - w / 2, 0.03, col, { jitter: 0 });
  b.cyl(x, y0 + h - w / 2, z - 0.003, w / 2, w / 2, 0.03, col, 10, { rotX: Math.PI / 2, jitter: 0 });
  b.sphere(x + w * 0.28, y0 + h * 0.4, z + 0.045, 0.018, PAL.gold, { jitter: 0 }, 0);
  taperBox(b, x, y0, z + 0.05, w + 0.1, 0.04, 0.1, PAL.stoneLight, 0.9, { jitter: 0 }); // 12 tris instead of a 108 tri roundBox
}

export type FaceKind = 'chicken' | 'pig' | 'owl' | 'eyes';

/** P8: face facing +Z; y is the eye line, z the surface. Eyes are dark squares with a white highlight. */
export function face(b: GeoBuilder, x: number, y: number, z: number, s = 1, kind: FaceKind = 'eyes'): void {
  const J = { jitter: 0 };
  if (kind !== 'owl') {
    for (const sg of [-1, 1]) {
      const ex = x + sg * 0.09 * s;
      b.box(ex, y - 0.0275 * s, z + 0.01, 0.045 * s, 0.055 * s, 0.02, PAL.coal, J);
      b.box(ex - sg * 0.009 * s, y + 0.008 * s, z + 0.021, 0.016 * s, 0.016 * s, 0.006, PAL.white, J);
    }
  }
  if (kind === 'chicken') {
    b.cone(x, y - 0.07 * s, z, 0.06 * s, 0.13 * s, FEATHER.beak, 4, { rotX: Math.PI / 2, ...J });
    b.sphere(x, y - 0.15 * s, z + 0.03 * s, 0.035 * s, FEATHER.red, { scale: [0.8, 1.4, 0.8], ...J }, 0);
  } else if (kind === 'pig') {
    b.cyl(x, y - 0.06 * s, z, 0.08 * s, 0.08 * s, 0.05, FARM.pinkDark, 10, { rotX: Math.PI / 2, ...J });
    for (const sg of [-1, 1]) {
      b.box(x + sg * 0.03 * s, y - 0.07 * s, z + 0.045, 0.02 * s, 0.025 * s, 0.012, PAL.coal, J);
      b.cone(x + sg * 0.14 * s, y + 0.1 * s, z, 0.06 * s, 0.12 * s, FARM.pinkDark, 4, { rotZ: -sg * 0.6, ...J });
    }
  } else if (kind === 'owl') {
    for (const sg of [-1, 1]) {
      const ex = x + sg * 0.09 * s;
      b.cyl(ex, y, z, 0.075 * s, 0.075 * s, 0.02, PAL.white, 10, { rotX: Math.PI / 2, ...J });
      b.cyl(ex, y, z + 0.02, 0.05 * s, 0.05 * s, 0.01, PAL.gold, 10, { rotX: Math.PI / 2, ...J });
      b.box(ex, y - 0.0175 * s, z + 0.03, 0.035 * s, 0.035 * s, 0.01, PAL.coal, J);
      b.cone(x + sg * 0.16 * s, y + 0.06 * s, z - 0.01, 0.04 * s, 0.12 * s, FARM.owl, 4, { rotZ: -sg * 0.25, ...J });
    }
    b.cone(x, y - 0.03 * s, z + 0.01, 0.03 * s, 0.07 * s, FEATHER.beak, 4, { rotZ: Math.PI, ...J });
  }
}

export interface CombOpts {
  /** Lobe colour (gold on the gilded Grand Coop). Non-red combs glow a little. */
  col?: Col;
  /** Sphere detail: 1 (default, 240 tris) or 0 (60 tris, what every building uses to stay in budget). */
  detail?: number;
}

/** P9: three-lobed comb sitting on a ridge or dome top. The one comb style for every building and marker. */
export function comb(b: GeoBuilder, x: number, y0: number, z: number, s = 1, alongX = true, o: CombOpts = {}): void {
  const col = o.col ?? FEATHER.red;
  const emit = col === FEATHER.red ? 0 : 0.1;
  for (let i = -1; i <= 1; i++) {
    const y = y0 + (i === 0 ? 0.07 : 0.05) * s;
    const dx = alongX ? i * 0.07 * s : 0, dz = alongX ? 0 : i * 0.07 * s;
    b.sphere(x + dx, y, z + dz, 0.055 * s, col, { scale: alongX ? [0.7, 1.2, 0.9] : [0.9, 1.2, 0.7], jitter: 0, emit, smooth: true }, o.detail ?? 1);
  }
}

/** Comb options every building uses (detail-0 lobes). */
export const LOW_COMB: CombOpts = { detail: 0 };

/**
 * P10: gold rooster weathervane in side profile facing +X. About 130 tris; `lite` (buildings) drops to about 100 by
 * using a 4-sided pole, one comb bead and two tail feathers.
 */
export function weathervaneRooster(b: GeoBuilder, x: number, y0: number, z: number, s = 1, col: Col = PAL.gold, lite = false): void {
  const J: PartOpts = { jitter: 0, emit: 0.1 };
  b.cyl(x, y0, z, lite ? 0.014 : 0.012, lite ? 0.014 : 0.012, 0.22 * s, PAL.coal, lite ? 4 : 5, { jitter: 0 });
  b.box(x, y0 + 0.16 * s, z, 0.2 * s, lite ? 0.03 : 0.025, lite ? 0.03 : 0.025, col, J);
  const by = y0 + 0.28 * s;
  b.sphere(x, by, z, 0.06 * s, col, { ...J, scale: [1.3, 1, lite ? 0.5 : 0.45] }, 0);
  b.sphere(x + 0.07 * s, by + 0.06 * s, z, 0.035 * s, col, J, 0);
  if (lite) b.sphere(x + 0.07 * s, by + 0.1 * s, z, 0.022 * s, FEATHER.red, { jitter: 0 }, 0);
  else for (let i = -1; i <= 1; i++) b.sphere(x + (0.07 + i * 0.016) * s, by + 0.1 * s, z, 0.015 * s, FEATHER.red, { jitter: 0 }, 0);
  b.cone(x + 0.1 * s, by + 0.055 * s, z, 0.012 * s, 0.04 * s, col, 4, { ...J, rotZ: -Math.PI / 2 });
  const n = lite ? 2 : 3, step = lite ? 0.5 : 0.4, a0 = lite ? 0.5 : 0.45;
  for (let i = 0; i < n; i++) {
    b.cone(x - 0.07 * s, by + 0.01 * s, z, 0.025 * s, 0.09 * s, col, 4, { ...J, rotZ: a0 + i * step });
  }
}
