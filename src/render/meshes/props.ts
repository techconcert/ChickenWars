import * as THREE from 'three';
import { GeoBuilder, PAL, clamp, hexRGB, makeNoise3, mixRGB, mulRGB, mulberry32, hash3i, smoothstep, type RGB } from './builder';
import { getCelMaterial, getOutlineMaterial } from '../materials';
import { ensureSmoothNormals } from '../materials/smooth';

/* ---------- soup helper for per-face colour functions (port of the prototype's partToSoup) ---------- */

type ColFn = (sx: number, sy: number, sz: number, face: number, ny: number) => RGB;
interface Soup { pos: number[]; nrm: number[]; col: number[] }

function partToSoup(geo: THREE.BufferGeometry, m: THREE.Matrix4, colFn: ColFn, out: Soup): void {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.applyMatrix4(m);
  g.computeVertexNormals();
  const p = g.attributes['position']!.array;
  const n = g.attributes['normal']!.array;
  for (let f = 0; f < p.length / 9; f++) {
    const fc = colFn(
      p[f * 9]! + p[f * 9 + 3]! + p[f * 9 + 6]!, p[f * 9 + 1]! + p[f * 9 + 4]! + p[f * 9 + 7]!, p[f * 9 + 2]! + p[f * 9 + 5]! + p[f * 9 + 8]!,
      f, n[f * 9 + 1]!,
    );
    for (let v = 0; v < 3; v++) {
      out.pos.push(p[f * 9 + v * 3]!, p[f * 9 + v * 3 + 1]!, p[f * 9 + v * 3 + 2]!);
      out.nrm.push(n[f * 9 + v * 3]!, n[f * 9 + v * 3 + 1]!, n[f * 9 + v * 3 + 2]!);
      out.col.push(fc[0], fc[1], fc[2]);
    }
  }
  g.dispose();
}

function geoFromSoup(s: Soup): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(s.pos), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(s.nrm), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(s.col), 3));
  ensureSmoothNormals(g);
  g.computeBoundingSphere();
  return g;
}

const hex = hexRGB;
const T = (x: number, y: number, z: number): THREE.Matrix4 => new THREE.Matrix4().makeTranslation(x, y, z);

/* ---------- natural props (ported from the prototype) ---------- */

/** Faceted boulder, variant i (0..7). Base at y~0, about 0.5 radius. */
export function makeRockVariant(i: number, palette: number[] = PAL.boulder, darkCol: number = PAL.boulderDark, detail = 1): THREE.BufferGeometry {
  const nz = makeNoise3(100 + i * 31);
  const g = new THREE.IcosahedronGeometry(0.5, detail);
  const pos = g.attributes['position']!;
  const rr = mulberry32(900 + i * 7);
  const sq = 0.75 + 0.15 * rr(), sa = 1.0 + 0.35 * rr(), sb = 0.85 + 0.3 * rr();
  for (let v = 0; v < pos.count; v++) {
    let x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v);
    const l = Math.hypot(x, y, z);
    x /= l; y /= l; z /= l;
    let d = nz(x * 1.9 + i, y * 1.9, z * 1.9);
    d = Math.round(d * 3) / 3;
    const r = 0.5 * (1 + 0.26 * d);
    x *= r * sa; y *= r * sq; z *= r * sb;
    if (y > 0) y *= 0.85;
    if (y < -0.26) y = -0.26;
    pos.setXYZ(v, x, y, z);
  }
  const out: Soup = { pos: [], nrm: [], col: [] };
  const pal = palette.map(hex);
  const dark = hex(darkCol);
  partToSoup(g, new THREE.Matrix4(), (_sx, sy, _sz, f, ny) => {
    const y = sy / 3, h = hash3i(f, i, 3, 1);
    const base = pal[ny > 0.45 ? (h < 0.5 ? 1 : 2) : h < 0.4 ? 0 : h < 0.8 ? 1 : 2]!;
    return mixRGB(dark, base, smoothstep(-0.28, 0.12, y) * 0.95 + 0.05);
  }, out);
  return geoFromSoup(out);
}

export function makePine(variant: number, snowy = false): THREE.BufferGeometry {
  const out: Soup = { pos: [], nrm: [], col: [] };
  const rr = mulberry32(40 + variant * 9 + (snowy ? 100 : 0));
  const layers = variant === 0 ? 2 : 3, sc = 0.9 + 0.2 * rr();
  const radii = [0.62, 0.5, 0.34].map((v) => v * sc), hts = [0.95, 0.8, 0.7].map((v) => v * (0.9 + 0.2 * rr()));
  const cols = PAL.pine.map(hex);
  const snow = hex(0xeaf2fa);
  partToSoup(new THREE.CylinderGeometry(0.1, 0.13, 0.55, 5), T(0, 0.27, 0), () => hex(PAL.trunk), out);
  let y = 0.3;
  for (let i = 0; i < layers; i++) {
    const cone = new THREE.ConeGeometry(radii[i]!, hts[i]!, 7, 1);
    const c0 = snowy ? mixRGB(cols[i]!, snow, [0.2, 0.55, 0.9][i]!) : cols[i]!;
    partToSoup(cone, T(0, y + hts[i]! / 2, 0), (_x, _y, _z, f, ny) => mulRGB(c0, ny < -0.3 ? 0.8 : 0.92 + 0.1 * hash3i(f, i, variant, 5)), out);
    y += hts[i]! * 0.55;
  }
  return geoFromSoup(out);
}

export function makeOak(variant: number): THREE.BufferGeometry {
  const out: Soup = { pos: [], nrm: [], col: [] };
  const rr = mulberry32(77 + variant * 13);
  partToSoup(new THREE.CylinderGeometry(0.1, 0.15, 0.8, 5), T(0, 0.4, 0), () => hex(PAL.trunk), out);
  const cols = PAL.oak.map(hex), nz = makeNoise3(300 + variant);
  const blobs: [number, number, number, number][] = [[0, 1.05, 0, 0.62], [0.3 + 0.1 * rr(), 0.85, 0.1, 0.44], [-0.28, 1.3 + 0.1 * rr(), 0.15, 0.42]];
  for (const [bx, by, bz, br] of blobs) {
    // main crown at detail 1, the two small side blobs at detail 0 (about 140 tris per oak instead of 260)
    const g = new THREE.IcosahedronGeometry(br, br > 0.5 ? 1 : 0), p = g.attributes['position']!;
    for (let v = 0; v < p.count; v++) {
      const x = p.getX(v), y = p.getY(v), z = p.getZ(v), l = Math.hypot(x, y, z);
      const d = 1 + 0.14 * nz((x / l) * 2 + bx * 5, (y / l) * 2, (z / l) * 2);
      p.setXYZ(v, (x / l) * br * d, (y / l) * br * d * 0.88, (z / l) * br * d);
    }
    partToSoup(g, T(bx, by, bz), (_x, sy, _z, f) => {
      const t = clamp((sy / 3 - by) / br * 0.5 + 0.5, 0, 1), h = hash3i(f, variant, 2, 3);
      return mulRGB(t < 0.5 ? mixRGB(cols[0]!, cols[1]!, t * 2) : mixRGB(cols[1]!, cols[2]!, (t - 0.5) * 2), 0.94 + 0.1 * h);
    }, out);
  }
  return geoFromSoup(out);
}

export function makeTuft(tall: number, col1: RGB = hex(PAL.meadow[1]!), col2: RGB = hex(0x8cc060)): THREE.BufferGeometry {
  const out: Soup = { pos: [], nrm: [], col: [] };
  const rr = mulberry32(5);
  for (let i = 0; i < 4; i++) {
    const c = new THREE.ConeGeometry(0.05, tall * (0.7 + 0.5 * rr()), 3, 1);
    const a = i * 1.57 + rr();
    const m = T(Math.cos(a) * 0.07, tall * 0.3, Math.sin(a) * 0.07).multiply(new THREE.Matrix4().makeRotationZ((rr() - 0.5) * 0.5));
    partToSoup(c, m, (_x, sy) => mixRGB(col1, col2, clamp(sy / 3 / tall, 0, 1)), out);
  }
  return geoFromSoup(out);
}

/* ---------- man-made props ---------- */

function built(fn: (b: GeoBuilder) => void, ao = false): THREE.BufferGeometry {
  const b = new GeoBuilder(21);
  b.ao = ao;
  fn(b);
  return b.build();
}

export const makeCrate = (): THREE.BufferGeometry =>
  built((b) => {
    b.box(0, 0, 0, 0.3, 0.3, 0.3, PAL.timberLight);
    b.box(0, 0.12, 0, 0.32, 0.06, 0.32, PAL.timber, { jitter: 0 });
  });

export const makeBarrel = (): THREE.BufferGeometry =>
  built((b) => {
    b.cyl(0, 0, 0, 0.12, 0.14, 0.3, PAL.timber, 8);
    for (const y of [0.05, 0.22]) b.cyl(0, y, 0, 0.145, 0.145, 0.03, PAL.coal, 8, { jitter: 0 });
  });

export const makeFence = (len = 1): THREE.BufferGeometry =>
  built((b) => {
    const n = Math.max(2, Math.round(len / 0.25));
    for (let i = 0; i <= n; i++) b.box(-len / 2 + (len * i) / n, 0, 0, 0.06, 0.3, 0.06, PAL.timberLight);
    for (const y of [0.1, 0.22]) b.box(0, y, 0, len, 0.04, 0.03, PAL.timber);
  });

export const makeBannerGeo = (colour: number = PAL.blue): THREE.BufferGeometry =>
  built((b) => {
    b.cyl(0, 0, 0, 0.02, 0.025, 0.9, PAL.timberDark, 5, { jitter: 0 });
    b.box(0, 0.58, 0, 0.3, 0.03, 0.03, PAL.timberDark, { jitter: 0 });
    b.box(0, 0.3, 0, 0.26, 0.28, 0.02, colour, { jitter: 0 });
    b.cone(0, 0.3, 0, 0.13, 0.1, colour, 3, { rotX: Math.PI, jitter: 0 });
    b.sphere(0, 0.92, 0, 0.035, PAL.gold, { jitter: 0 }, 0);
  });

export const makeTent = (colour: number = PAL.cream): THREE.BufferGeometry =>
  built((b) => {
    b.gable(0, 0, 0, 0.7, 0.62, 0.45, colour);
    b.box(0, 0, 0.3, 0.2, 0.28, 0.02, PAL.timberDark, { jitter: 0 });
    b.cyl(0, 0.44, 0, 0.012, 0.012, 0.14, PAL.timberDark, 4, { jitter: 0 });
  }, true);

export const makeHaybale = (): THREE.BufferGeometry =>
  built((b) => {
    b.cyl(0, 0, 0, 0.18, 0.18, 0.32, PAL.hay, 10, { rotZ: Math.PI / 2, rotX: 0 });
  });

/* ---------- instancing ---------- */

export interface InstanceXform {
  x: number; y: number; z: number;
  rot?: number;
  scale?: number;
  sx?: number; sy?: number; sz?: number;
  /** Multiplies vertex colour (instanceColor), 1 = unchanged. */
  tint?: number;
}

const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _m4 = new THREE.Matrix4();
const AY = new THREE.Vector3(0, 1, 0);

/**
 * Instanced mesh helper (material defaults to the shared cel material). With `withOutline` a second InstancedMesh
 * sharing the same instance matrices draws the inverted hull.
 */
export function makeInstanced(
  geo: THREE.BufferGeometry,
  material: THREE.Material | null,
  transforms: (THREE.Matrix4 | InstanceXform)[],
  withOutline = false,
  outlineThickness = 0.06,
): THREE.Group {
  const g = new THREE.Group();
  if (!transforms.length) return g;
  const m = new THREE.InstancedMesh(geo, material ?? getCelMaterial(), transforms.length);
  m.frustumCulled = false;
  const col = new THREE.Color();
  let anyTint = false;
  transforms.forEach((t, i) => {
    if (t instanceof THREE.Matrix4) {
      m.setMatrixAt(i, t);
      return;
    }
    const sc = t.scale ?? 1;
    _m4.compose(_v.set(t.x, t.y, t.z), _q.setFromAxisAngle(AY, t.rot ?? 0), _s.set((t.sx ?? 1) * sc, (t.sy ?? 1) * sc, (t.sz ?? 1) * sc));
    m.setMatrixAt(i, _m4);
    if (t.tint !== undefined) {
      anyTint = true;
      col.setRGB(t.tint, t.tint * (0.98 + 0.04 * ((i * 7) % 3) / 2), t.tint);
      m.setColorAt(i, col);
    }
  });
  if (anyTint && m.instanceColor) m.instanceColor.needsUpdate = true;
  m.instanceMatrix.needsUpdate = true;
  g.add(m);
  if (withOutline) {
    ensureSmoothNormals(geo);
    const o = new THREE.InstancedMesh(geo, getOutlineMaterial(null, outlineThickness), transforms.length);
    o.instanceMatrix = m.instanceMatrix;
    o.frustumCulled = false;
    g.add(o);
  }
  return g;
}
