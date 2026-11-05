import * as THREE from 'three';
import { smoothNormals } from '../materials/smooth';

export type RGB = [number, number, number];
export type Col = number | RGB;

/** Art-direction palette (docs/03-art-direction.md) plus building colours. */
export const PAL = {
  meadow: [0x588d44, 0x679b4a, 0x76ab50] as number[],
  boulder: [0x8f8d89, 0xa09d97, 0xb2aea6] as number[],
  boulderDark: 0x6a6762,
  pine: [0x3d7746, 0x4b8750, 0x5c9a5c] as number[],
  oak: [0x4c8a3e, 0x6aa84c, 0x80bb58] as number[],
  trunk: 0x7a5538,
  sand: 0xd9c08a,
  dirt: 0xc9aa7c,
  snow: [0xe9f1fa, 0xd8e6f4] as number[],
  roofRed: 0xb5503c,
  roofOrange: 0xc9683f,
  cream: 0xe8d8b0,
  timber: 0x7a5538,
  timberDark: 0x573a26,
  timberLight: 0xa6794c,
  stone: 0x8f8d89,
  stoneLight: 0xb2aea6,
  stoneDark: 0x6a6762,
  slate: 0x5f6d7c,
  thatch: 0xd2b45f,
  blue: 0x3c6ea8,
  bandit: 0xa83c3c,
  ally: 0x4c8a3e,
  neutral: 0x8f8d89,
  gold: 0xe3b341,
  white: 0xf1ece0,
  ink: 0x3a2f26,
  coal: 0x2b2622,
  glass: 0x3b4a5c,
  hay: 0xe0c060,
  crop: 0x9fb54a,
  soil: 0x8a6a46,
  ember: 0xe0502a,
  parchment: 0xf3e7c9,
  skin: 0xf0c8a0,
};

export function hexRGB(h: number): RGB {
  return [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
}
export const toRGB = (c: Col): RGB => (typeof c === 'number' ? hexRGB(c) : c);
export const mixRGB = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const mulRGB = (a: RGB, k: number): RGB => [Math.min(1, a[0] * k), Math.min(1, a[1] * k), Math.min(1, a[2] * k)];
/** Accepts `#rrggbb`, `0xrrggbb` numbers. */
export function parseColour(c: string | number | undefined, fallback: number): number {
  if (c === undefined) return fallback;
  if (typeof c === 'number') return c;
  const m = /^#?([0-9a-f]{6})$/i.exec(c.trim());
  return m && m[1] ? parseInt(m[1], 16) : fallback;
}

/** Deterministic helpers (render-only, not the sim RNG). */
export function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hash3i(x: number, y: number, z: number, s: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1274126177) ^ Math.imul(s | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export const clamp = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x));
export const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
/** Smooth 3D value noise in [-1,1]. */
export function makeNoise3(seed: number): (x: number, y: number, z: number) => number {
  const v = (ix: number, iy: number, iz: number): number => hash3i(ix, iy, iz, seed) * 2 - 1;
  return (x, y, z) => {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    const fx = x - ix, fy = y - iy, fz = z - iz;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), uz = fz * fz * (3 - 2 * fz);
    const l = (a: number, b: number, t: number): number => a + (b - a) * t;
    return l(
      l(l(v(ix, iy, iz), v(ix + 1, iy, iz), ux), l(v(ix, iy + 1, iz), v(ix + 1, iy + 1, iz), ux), uy),
      l(l(v(ix, iy, iz + 1), v(ix + 1, iy, iz + 1), ux), l(v(ix, iy + 1, iz + 1), v(ix + 1, iy + 1, iz + 1), ux), uy),
      uz,
    );
  };
}

export interface PartOpts {
  rotY?: number;
  rotX?: number;
  rotZ?: number;
  /** 0..1 unlit amount (glowing gems, lanterns, windows). */
  emit?: number;
  /** Per-face brightness jitter (default 0.05). */
  jitter?: number;
  scale?: [number, number, number];
  /** Keep the geometry's own (smooth) vertex normals instead of recomputing flat ones: spheres, domes, silos shade round. */
  smooth?: boolean;
}

const _m = new THREE.Matrix4();
const _r = new THREE.Matrix4();
const _v = new THREE.Vector3();

/**
 * Merges primitives into one flat-shaded, vertex-coloured, non-indexed BufferGeometry (position, normal, color,
 * aEmit, aSmooth). All primitives sit with their local origin at the BASE centre and grow up +Y.
 */
export class GeoBuilder {
  private pos: number[] = [];
  private nrm: number[] = [];
  private col: number[] = [];
  private emit: number[] = [];
  private face = 0;
  /** Darken the lowest 0.45 units (cheap ambient occlusion on buildings). */
  ao = true;
  constructor(private seed = 1) {}

  part(geo: THREE.BufferGeometry, x: number, y: number, z: number, color: Col, o: PartOpts = {}): this {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    _m.makeTranslation(x, y, z);
    if (o.rotY) _m.multiply(_r.makeRotationY(o.rotY));
    if (o.rotX) _m.multiply(_r.makeRotationX(o.rotX));
    if (o.rotZ) _m.multiply(_r.makeRotationZ(o.rotZ));
    if (o.scale) _m.multiply(_r.makeScale(o.scale[0], o.scale[1], o.scale[2]));
    g.applyMatrix4(_m);
    if (!(o.smooth && g.attributes['normal'])) g.computeVertexNormals();
    const p = g.attributes['position']!.array;
    const n = g.attributes['normal']!.array;
    const base = toRGB(color);
    const jit = o.jitter ?? 0.05;
    for (let f = 0; f < p.length / 9; f++) {
      const k = 1 + (hash3i(this.face++, this.seed, 7, 3) - 0.5) * 2 * jit;
      for (let v = 0; v < 3; v++) {
        const i = f * 9 + v * 3;
        const px = p[i]!, py = p[i + 1]!, pz = p[i + 2]!;
        const ao = this.ao ? 0.8 + 0.2 * smoothstep(0, 0.45, py) : 1;
        this.pos.push(px, py, pz);
        this.nrm.push(n[i]!, n[i + 1]!, n[i + 2]!);
        this.col.push(Math.min(1, base[0] * k * ao), Math.min(1, base[1] * k * ao), Math.min(1, base[2] * k * ao));
        this.emit.push(o.emit ?? 0);
      }
    }
    g.dispose();
    return this;
  }

  box(x: number, y0: number, z: number, w: number, h: number, d: number, color: Col, o?: PartOpts): this {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(0, h / 2, 0);
    return this.part(g, x, y0, z, color, o);
  }
  cyl(x: number, y0: number, z: number, rTop: number, rBot: number, h: number, color: Col, seg = 8, o?: PartOpts): this {
    const g = new THREE.CylinderGeometry(rTop, rBot, h, seg);
    g.translate(0, h / 2, 0);
    return this.part(g, x, y0, z, color, o);
  }
  cone(x: number, y0: number, z: number, r: number, h: number, color: Col, seg = 6, o?: PartOpts): this {
    const g = new THREE.ConeGeometry(r, h, seg);
    g.translate(0, h / 2, 0);
    return this.part(g, x, y0, z, color, o);
  }
  /** Sphere (centre at y). */
  sphere(x: number, y: number, z: number, r: number, color: Col, o?: PartOpts, detail = 1): this {
    return this.part(new THREE.IcosahedronGeometry(r, detail), x, y, z, color, o);
  }
  capsule(x: number, y0: number, z: number, r: number, len: number, color: Col, o?: PartOpts): this {
    const g = new THREE.CapsuleGeometry(r, len, 3, 8);
    g.translate(0, len / 2 + r, 0);
    return this.part(g, x, y0, z, color, o);
  }
  /** Pyramid with a rectangular base w x d. */
  hip(x: number, y0: number, z: number, w: number, d: number, h: number, color: Col, o: PartOpts = {}): this {
    const g = new THREE.ConeGeometry(1, h, 4);
    g.rotateY(Math.PI / 4);
    g.translate(0, h / 2, 0);
    const s = Math.SQRT2;
    return this.part(g, x, y0, z, color, { ...o, scale: [w / s, 1, d / s] });
  }
  /** Gable roof: ridge along local X (length len), eave width wid (z), height h. */
  gable(x: number, y0: number, z: number, len: number, wid: number, h: number, color: Col, o?: PartOpts): this {
    const l = len / 2, w = wid / 2;
    return this.solid(
      [[-l, 0, -w], [l, 0, -w], [l, 0, w], [-l, 0, w], [-l, h, 0], [l, h, 0]],
      [[0, 1, 2, 3], [0, 1, 5, 4], [3, 2, 5, 4], [0, 3, 4], [1, 2, 5]],
      x, y0, z, color, o,
    );
  }
  /** Lean-to / half roof: high side at -z. */
  shed(x: number, y0: number, z: number, len: number, wid: number, h: number, color: Col, o?: PartOpts): this {
    const l = len / 2, w = wid / 2;
    return this.solid(
      [[-l, 0, -w], [l, 0, -w], [l, 0, w], [-l, 0, w], [-l, h, -w], [l, h, -w]],
      [[0, 1, 2, 3], [0, 1, 5, 4], [3, 2, 5, 4], [0, 3, 4], [1, 2, 5]],
      x, y0, z, color, o,
    );
  }
  /** Convex solid from vertices + polygon faces (winding is fixed to face outward). */
  solid(verts: number[][], faces: number[][], x: number, y0: number, z: number, color: Col, o?: PartOpts): this {
    const c = [0, 0, 0];
    for (const v of verts) for (let i = 0; i < 3; i++) c[i] = c[i]! + v[i]! / verts.length;
    const tris: number[] = [];
    for (const f of faces) {
      for (let i = 1; i < f.length - 1; i++) {
        const a = f[0]!;
        let b = f[i]!, d = f[i + 1]!;
        const A = verts[a]!, B = verts[b]!, D = verts[d]!;
        const ux = B[0]! - A[0]!, uy = B[1]! - A[1]!, uz = B[2]! - A[2]!;
        const vx = D[0]! - A[0]!, vy = D[1]! - A[1]!, vz = D[2]! - A[2]!;
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const dot = nx * (A[0]! - c[0]!) + ny * (A[1]! - c[1]!) + nz * (A[2]! - c[2]!);
        if (dot < 0) [b, d] = [d, b];
        tris.push(a, b, d);
      }
    }
    const g = new THREE.BufferGeometry();
    const arr: number[] = [];
    for (const t of tris) arr.push(...(verts[t] ?? [0, 0, 0]));
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    return this.part(g, x, y0, z, color, o);
  }
  /** Flat horizontal ring-less disc / plate. */
  plate(x: number, y0: number, z: number, r: number, h: number, color: Col, seg = 16, o?: PartOpts): this {
    return this.cyl(x, y0, z, r, r, h, color, seg, o);
  }
  /** Skull-ish white disc with dark eyes, facing +Z. */
  skull(x: number, y: number, z: number, s: number, faceZ: 1 | -1 = 1): this {
    const o: PartOpts = { jitter: 0 };
    this.sphere(x, y, z, s, PAL.white, { ...o, scale: [1, 1, 0.45] }, 0);
    this.box(x - s * 0.38, y - s * 0.28, z + faceZ * s * 0.38, s * 0.4, s * 0.45, s * 0.12, PAL.coal, o);
    this.box(x + s * 0.38, y - s * 0.28, z + faceZ * s * 0.38, s * 0.4, s * 0.45, s * 0.12, PAL.coal, o);
    return this;
  }

  /** Merge an existing non-indexed (or indexed) geometry with position/normal/color attributes under a matrix. */
  merge(geo: THREE.BufferGeometry, m: THREE.Matrix4, tint = 1): this {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const p = g.getAttribute('position'), n = g.getAttribute('normal'), c = g.getAttribute('color');
    const nm = new THREE.Matrix3().getNormalMatrix(m);
    for (let i = 0; i < p.count; i++) {
      _v.set(p.getX(i), p.getY(i), p.getZ(i)).applyMatrix4(m);
      this.pos.push(_v.x, _v.y, _v.z);
      _v.set(n.getX(i), n.getY(i), n.getZ(i)).applyMatrix3(nm).normalize();
      this.nrm.push(_v.x, _v.y, _v.z);
      this.col.push(c ? c.getX(i) * tint : 0.7, c ? c.getY(i) * tint : 0.7, c ? c.getZ(i) * tint : 0.7);
      this.emit.push(0);
    }
    return this;
  }

  /** Append another builder's content. */
  append(other: GeoBuilder): this {
    this.pos.push(...other.pos);
    this.nrm.push(...other.nrm);
    this.col.push(...other.col);
    this.emit.push(...other.emit);
    return this;
  }

  /** Offset / rotate everything added so far by a transform; returns a new builder holding the result. */
  static transformed(src: GeoBuilder, x: number, y: number, z: number, rotY = 0, scale = 1): GeoBuilder {
    const out = new GeoBuilder();
    _m.makeTranslation(x, y, z).multiply(_r.makeRotationY(rotY)).multiply(_r.makeScale(scale, scale, scale));
    for (let i = 0; i < src.pos.length; i += 3) {
      _v.set(src.pos[i]!, src.pos[i + 1]!, src.pos[i + 2]!).applyMatrix4(_m);
      out.pos.push(_v.x, _v.y, _v.z);
      _v.set(src.nrm[i]!, src.nrm[i + 1]!, src.nrm[i + 2]!).transformDirection(_m);
      out.nrm.push(_v.x, _v.y, _v.z);
    }
    out.col.push(...src.col);
    out.emit.push(...src.emit);
    return out;
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    const P = new Float32Array(this.pos);
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.nrm), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.col), 3));
    g.setAttribute('aEmit', new THREE.BufferAttribute(new Float32Array(this.emit), 1));
    g.setAttribute('aSmooth', new THREE.BufferAttribute(smoothNormals(P), 3));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}
