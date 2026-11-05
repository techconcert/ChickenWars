/**
 * Hex grid helpers shared by the world map and the base scene (contract section 2).
 * Axial coords (q,r), pointy-top, circumradius 1: x = sqrt(3)*(q + r/2), z = 1.5*r.
 * Only basic arithmetic and sqrt are used so results are identical in every JS engine.
 */
export const SQ3 = Math.sqrt(3);
export const NBQ: readonly number[] = [1, 0, -1, -1, 0, 1];
export const NBR: readonly number[] = [0, 1, 1, 0, -1, -1];

export interface HexGrid {
  R: number;
  count: number;
  q: Int32Array;
  r: Int32Array;
  /** cell id for (q,r), or -1 when outside the grid */
  idxOf(q: number, r: number): number;
  /** count*6 neighbour ids, -1 outside the grid; neighbour k uses (NBQ[k], NBR[k]) */
  nb: Int32Array;
  /** cell centres in world units */
  x: Float64Array;
  z: Float64Array;
}

/** Cells are listed `for q in -R..R, for r in -R..R if |q+r| <= R`; CellId = index in that list. */
export function makeHexGrid(R: number): HexGrid {
  const W2 = 2 * R + 1;
  const tbl = new Int32Array(W2 * W2).fill(-1);
  const count = 3 * R * (R + 1) + 1;
  const q = new Int32Array(count);
  const r = new Int32Array(count);
  let n = 0;
  for (let a = -R; a <= R; a++) {
    for (let b = -R; b <= R; b++) {
      if (Math.abs(a + b) > R) continue;
      tbl[(a + R) * W2 + (b + R)] = n;
      q[n] = a;
      r[n] = b;
      n++;
    }
  }
  const idxOf = (a: number, b: number): number =>
    a < -R || a > R || b < -R || b > R ? -1 : tbl[(a + R) * W2 + (b + R)]!;
  const x = new Float64Array(count);
  const z = new Float64Array(count);
  const nb = new Int32Array(count * 6);
  for (let i = 0; i < count; i++) {
    const qi = q[i]!;
    const ri = r[i]!;
    x[i] = SQ3 * (qi + ri / 2);
    z[i] = 1.5 * ri;
    for (let k = 0; k < 6; k++) nb[i * 6 + k] = idxOf(qi + NBQ[k]!, ri + NBR[k]!);
  }
  return { R, count, q, r, idxOf, nb, x, z };
}

export function cellQR(g: HexGrid, i: number): [number, number] {
  return [g.q[i]!, g.r[i]!];
}

export function hexDistance(aq: number, ar: number, bq: number, br: number): number {
  const dq = aq - bq;
  const dr = ar - br;
  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
}

/** Hex distance between two cell ids. */
export function cellDistance(g: HexGrid, a: number, b: number): number {
  return hexDistance(g.q[a]!, g.r[a]!, g.q[b]!, g.r[b]!);
}

export function neighbours(g: HexGrid, i: number): number[] {
  const out: number[] = [];
  for (let k = 0; k < 6; k++) {
    const n = g.nb[i * 6 + k]!;
    if (n >= 0) out.push(n);
  }
  return out;
}

export function hexToWorld(q: number, r: number): [number, number] {
  return [SQ3 * (q + r / 2), 1.5 * r];
}

/** Axial (fractional) coordinates rounded to the containing hex; returns the cell id or -1 outside the grid. */
export function worldToCell(g: HexGrid, x: number, z: number): number {
  const fq = (SQ3 / 3) * x - z / 3;
  const fr = (2 / 3) * z;
  const fy = -fq - fr;
  let rq = Math.round(fq);
  let rr = Math.round(fr);
  const ry = Math.round(fy);
  const dq = Math.abs(rq - fq);
  const dr = Math.abs(rr - fr);
  const dy = Math.abs(ry - fy);
  if (dq > dr && dq > dy) rq = -rr - ry;
  else if (dr > dy) rr = -rq - ry;
  return g.idxOf(rq, rr);
}
