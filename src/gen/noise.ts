/**
 * Deterministic noise and RNG. Integer hash + smoothstep interpolation with basic arithmetic only,
 * so the logic layer is bit-identical across engines (D20). No Math.sin/cos/exp/pow here.
 */
export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer hash of 3 ints and a seed to [0,1). */
export function hash3i(x: number, y: number, z: number, s: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1274126177) ^ Math.imul(s | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Hash of 3 ints and a seed to an unsigned 32-bit integer. */
export function hashU32(x: number, y: number, z: number, s: number): number {
  return Math.floor(hash3i(x, y, z, s) * 4294967296) >>> 0;
}

const fade = (t: number): number => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export interface Noise {
  /** value noise in [-1,1] */
  n3(x: number, y: number, z: number): number;
  n2(x: number, y: number): number;
}

export function makeNoise(seed: number): Noise {
  const s = seed | 0;
  const n3 = (x: number, y: number, z: number): number => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const zi = Math.floor(z);
    const xf = fade(x - xi);
    const yf = fade(y - yi);
    const zf = fade(z - zi);
    // corner hashes inlined (no per-call closure); same calls, same arithmetic order as before
    const x1 = xi + 1, y1 = yi + 1, z1 = zi + 1;
    return (
      lerp(
        lerp(lerp(hash3i(xi, yi, zi, s), hash3i(x1, yi, zi, s), xf), lerp(hash3i(xi, y1, zi, s), hash3i(x1, y1, zi, s), xf), yf),
        lerp(lerp(hash3i(xi, yi, z1, s), hash3i(x1, yi, z1, s), xf), lerp(hash3i(xi, y1, z1, s), hash3i(x1, y1, z1, s), xf), yf),
        zf,
      ) *
        2 -
      1
    );
  };
  return { n3, n2: (x, y) => n3(x, y, 0.5) };
}

/** FNV-1a (32 bit) streaming helpers used for the logic-layer hash. */
export const FNV_OFFSET = 0x811c9dc5;
export function fnvAdd(h: number, v: number): number {
  return Math.imul((h ^ (v & 0xff)) >>> 0, 0x01000193) >>> 0;
}
export function fnvInt(h: number, v: number): number {
  const x = v | 0;
  h = fnvAdd(h, x);
  h = fnvAdd(h, x >>> 8);
  h = fnvAdd(h, x >>> 16);
  return fnvAdd(h, x >>> 24);
}
export function fnvArray(h: number, a: ArrayLike<number>): number {
  h = fnvInt(h, a.length);
  for (let i = 0; i < a.length; i++) h = fnvInt(h, a[i]!);
  return h;
}
