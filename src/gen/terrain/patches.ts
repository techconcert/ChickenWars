import { isWater, type World } from './types';

export interface Patches {
  /** patch id per cell, -1 for sea / water */
  id: Int32Array;
  cells: number[][];
  level: number[];
}

/** Flat patches: connected land (non-water) cells that share a level. */
export function computePatches(w: World): Patches {
  const { N, grid, isLand, lvl } = w;
  const id = new Int32Array(N).fill(-1);
  const cells: number[][] = [];
  const level: number[] = [];
  for (let c = 0; c < N; c++) {
    if (!isLand[c] || id[c]! >= 0 || isWater(w, c)) continue;
    const pid = cells.length;
    const cc = [c];
    id[c] = pid;
    for (let h = 0; h < cc.length; h++) {
      const a = cc[h]!;
      for (let k = 0; k < 6; k++) {
        const b = grid.nb[a * 6 + k]!;
        if (b >= 0 && isLand[b] && id[b]! < 0 && lvl[b] === lvl[c] && !isWater(w, b)) {
          id[b] = pid;
          cc.push(b);
        }
      }
    }
    cells.push(cc);
    level.push(lvl[c]!);
  }
  return { id, cells, level };
}

/** Merge flat patches under 4 hexes into the most common neighbouring level. Returns cells changed. */
export function mergeSmallPatches(w: World, passes = 3): number {
  let total = 0;
  for (let pass = 0; pass < passes; pass++) {
    const P = computePatches(w);
    let changed = 0;
    for (let p = 0; p < P.cells.length; p++) {
      const comp = P.cells[p]!;
      if (comp.length >= 4) continue;
      const cnt = new Map<number, number>();
      for (const a of comp) {
        for (let k = 0; k < 6; k++) {
          const b = w.grid.nb[a * 6 + k]!;
          if (b < 0 || !w.isLand[b] || isWater(w, b) || P.id[b] === p) continue;
          cnt.set(w.lvl[b]!, (cnt.get(w.lvl[b]!) ?? 0) + 1);
        }
      }
      let best = -1;
      let bn = 0;
      for (const [l, n] of cnt) if (n > bn || (n === bn && l < best)) { bn = n; best = l; }
      if (best >= 0) {
        for (const a of comp) w.lvl[a] = best;
        changed += comp.length;
      }
    }
    total += changed;
    if (!changed) break;
  }
  return total;
}

/**
 * Make the walkable graph connected: patches are linked when their levels differ by exactly 1 (a ramp can be
 * placed). Otherwise lower the higher side of a cliff-only border to one above the lower side. Returns true if connected.
 */
export function repairPatches(w: World): boolean {
  for (let it = 0; it < 300; it++) {
    const P = computePatches(w);
    const n = P.cells.length;
    const uf = new Int32Array(n).map((_, i) => i);
    const find = (a: number): number => {
      while (uf[a] !== a) { uf[a] = uf[uf[a]!]!; a = uf[a]!; }
      return a;
    };
    const pairs: [number, number][] = [];
    for (let p = 0; p < n; p++) {
      for (const c of P.cells[p]!) {
        for (let k = 0; k < 6; k++) {
          const b = w.grid.nb[c * 6 + k]!;
          if (b < 0) continue;
          const q = P.id[b]!;
          if (q < 0 || q === p) continue;
          const d = P.level[p]! - P.level[q]!;
          if (d === 1 || d === -1) uf[find(p)] = find(q);
          else if (d > 1) pairs.push([p, q]);
        }
      }
    }
    const roots = new Set<number>();
    for (let p = 0; p < n; p++) roots.add(find(p));
    if (roots.size <= 1) return true;
    const cand = pairs.filter(([p, q]) => find(p) !== find(q));
    if (!cand.length) return false;
    const [hi, lo] = cand[Math.floor(w.rnd() * cand.length)]!;
    const target = P.level[lo]! + 1;
    for (const c of P.cells[hi]!) w.lvl[c] = target;
  }
  return false;
}

/** Alternate merge and repair until both are stable. */
export function settleLevels(w: World): void {
  for (let i = 0; i < 8; i++) {
    const m = mergeSmallPatches(w);
    w.merged += m;
    const ok = repairPatches(w);
    const P = computePatches(w);
    if (ok && !P.cells.some((c) => c.length < 4)) break;
  }
}
