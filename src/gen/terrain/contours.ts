import { clamp, lerp } from './sdf';

export interface Chain {
  xs: number[];
  zs: number[];
  cum: number[];
  len: number;
}

export interface GridDims {
  GW: number;
  GH: number;
  x0: number;
  z0: number;
  h: number;
}

/** Marching squares on one SDF (zero level) with edge-linked chaining into polylines. */
export function extractContours(sdf: Float32Array, F: GridDims): Chain[] {
  const { GW, GH, x0, z0, h } = F;
  const P: number[] = [];
  const adj: number[][] = [];
  const map = new Map<number, number>();
  const pt = (id: number): number => {
    let k = map.get(id);
    if (k !== undefined) return k;
    const horiz = (id & 1) === 0;
    const cell = id >> 1;
    const i = cell % GW;
    const j = (cell - i) / GW;
    const a = sdf[cell]!;
    const b = horiz ? sdf[cell + 1]! : sdf[cell + GW]!;
    const t = a / (a - b);
    k = P.length >> 1;
    P.push(horiz ? x0 + (i + t) * h : x0 + i * h, horiz ? z0 + j * h : z0 + (j + t) * h);
    adj.push([]);
    map.set(id, k);
    return k;
  };
  for (let j = 0; j < GH - 1; j++) {
    for (let i = 0; i < GW - 1; i++) {
      const k0 = j * GW + i;
      const b0 = sdf[k0]! > 0;
      const b1 = sdf[k0 + 1]! > 0;
      const b2 = sdf[k0 + GW + 1]! > 0;
      const b3 = sdf[k0 + GW]! > 0;
      if (b0 === b1 && b1 === b2 && b2 === b3) continue;
      const es: number[] = [];
      if (b0 !== b1) es.push(k0 * 2);
      if (b1 !== b2) es.push((k0 + 1) * 2 + 1);
      if (b3 !== b2) es.push((k0 + GW) * 2);
      if (b0 !== b3) es.push(k0 * 2 + 1);
      for (let q = 0; q + 1 < es.length; q += 2) {
        const A = pt(es[q]!);
        const B = pt(es[q + 1]!);
        adj[A]!.push(B);
        adj[B]!.push(A);
      }
    }
  }
  const nP = P.length >> 1;
  const vis = new Uint8Array(nP);
  const chains: Chain[] = [];
  const trace = (start: number): number[] => {
    const ids: number[] = [];
    let prev = -1;
    let cur = start;
    for (;;) {
      vis[cur] = 1;
      ids.push(cur);
      let nx = -1;
      for (const q of adj[cur]!) {
        if (q !== prev && !vis[q]) { nx = q; break; }
      }
      if (nx < 0) {
        if (prev !== -1 && ids.length > 2 && adj[cur]!.includes(start) && adj[start]!.length === 2) ids.push(start);
        break;
      }
      prev = cur;
      cur = nx;
    }
    return ids;
  };
  const emit = (ids: number[]): void => {
    if (ids.length < 4) return;
    const xs: number[] = [];
    const zs: number[] = [];
    const cum: number[] = [0];
    ids.forEach((id, q) => {
      xs.push(P[id * 2]!);
      zs.push(P[id * 2 + 1]!);
      if (q > 0) cum.push(cum[q - 1]! + Math.hypot(xs[q]! - xs[q - 1]!, zs[q]! - zs[q - 1]!));
    });
    const len = cum[cum.length - 1]!;
    if (len > 1.5) chains.push({ xs, zs, cum, len });
  };
  for (let i = 0; i < nP; i++) if (!vis[i] && adj[i]!.length === 1) emit(trace(i));
  for (let i = 0; i < nP; i++) if (!vis[i] && adj[i]!.length >= 1) emit(trace(i));
  return chains;
}

/** Point at arc length s along a chain. */
export function chainPoint(ch: Chain, s: number): [number, number] {
  const c = ch.cum;
  let lo = 0;
  let hi = c.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (c[m]! <= s) lo = m;
    else hi = m;
  }
  const t = clamp((s - c[lo]!) / Math.max(1e-6, c[hi]! - c[lo]!), 0, 1);
  return [lerp(ch.xs[lo]!, ch.xs[hi]!, t), lerp(ch.zs[lo]!, ch.zs[hi]!, t)];
}
