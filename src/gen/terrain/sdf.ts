/** Grid helpers for the height field: chamfer distance, box blur, signed distance fields. Any maths allowed here. */
export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
/** terrace profile: smooth 0..1 over x in [-1,1] */
export const prof = (x: number): number => {
  const s = clamp((x + 1) * 0.5, 0, 1);
  return s * s * (3 - 2 * s);
};

export function chamfer(src: ArrayLike<number>, GW: number, GH: number): Float32Array {
  const n = GW * GH;
  const d = new Float32Array(n);
  const D = 1.4142;
  for (let i = 0; i < n; i++) d[i] = src[i] ? 0 : 1e4;
  for (let j = 0; j < GH; j++) {
    for (let i = 0; i < GW; i++) {
      const k = j * GW + i;
      let v = d[k]!;
      if (i > 0) {
        v = Math.min(v, d[k - 1]! + 1);
        if (j > 0) v = Math.min(v, d[k - GW - 1]! + D);
      }
      if (j > 0) {
        v = Math.min(v, d[k - GW]! + 1);
        if (i < GW - 1) v = Math.min(v, d[k - GW + 1]! + D);
      }
      d[k] = v;
    }
  }
  for (let j = GH - 1; j >= 0; j--) {
    for (let i = GW - 1; i >= 0; i--) {
      const k = j * GW + i;
      let v = d[k]!;
      if (i < GW - 1) {
        v = Math.min(v, d[k + 1]! + 1);
        if (j < GH - 1) v = Math.min(v, d[k + GW + 1]! + D);
      }
      if (j < GH - 1) {
        v = Math.min(v, d[k + GW]! + 1);
        if (i > 0) v = Math.min(v, d[k + GW - 1]! + D);
      }
      d[k] = v;
    }
  }
  return d;
}

/** In-place separable box blur with clamped borders. */
export function blurArr(a: Float32Array, GW: number, GH: number, passes: number, rad = 1): Float32Array {
  const t = new Float32Array(a.length);
  const inv = 1 / (2 * rad + 1);
  for (let p = 0; p < passes; p++) {
    for (let j = 0; j < GH; j++) {
      const o = j * GW;
      for (let i = 0; i < GW; i++) {
        let s = 0;
        for (let q = -rad; q <= rad; q++) s += a[o + Math.min(GW - 1, Math.max(0, i + q))]!;
        t[o + i] = s * inv;
      }
    }
    for (let j = 0; j < GH; j++) {
      for (let i = 0; i < GW; i++) {
        let s = 0;
        for (let q = -rad; q <= rad; q++) s += t[Math.min(GH - 1, Math.max(0, j + q)) * GW + i]!;
        a[j * GW + i] = s * inv;
      }
    }
  }
  return a;
}

/** Signed distance in world units: positive inside the mask, negative outside, lightly blurred. */
export function sdfFromMask(mask: ArrayLike<number>, GW: number, GH: number, h: number, blur: number): Float32Array {
  const n = GW * GH;
  const inv = new Uint8Array(n);
  for (let i = 0; i < n; i++) inv[i] = mask[i] ? 0 : 1;
  const dOut = chamfer(inv, GW, GH);
  const dIn = chamfer(mask, GW, GH);
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) s[i] = clamp(mask[i] ? dOut[i]! - 0.5 : -(dIn[i]! - 0.5), -60, 60) * h;
  return blurArr(s, GW, GH, blur, 1);
}
