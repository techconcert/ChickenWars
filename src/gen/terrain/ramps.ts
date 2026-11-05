import { computePatches } from './patches';
import { isWater, type RampInfo, type World } from './types';

const RAMP_W0 = 2.6;

/**
 * Ramps: union-find spanning tree over borders between flat patches that are exactly one level apart, plus 1-2 extra
 * loops. Each chosen border yields a ramp (high cell a, low cell b) and short dirt paths on both plateaus.
 */
export function buildRamps(w: World): void {
  const { grid, lvl, rnd } = w;
  const P = computePatches(w);
  const n = P.cells.length;
  const centreCell: number[] = P.cells.map((cc) => {
    let sx = 0;
    let sz = 0;
    for (const c of cc) { sx += grid.x[c]!; sz += grid.z[c]!; }
    sx /= cc.length;
    sz /= cc.length;
    let best = cc[0]!;
    let bd = 1e18;
    for (const c of cc) {
      const d = (grid.x[c]! - sx) ** 2 + (grid.z[c]! - sz) ** 2;
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  });
  const shared = new Map<number, [number, number, number][]>();
  for (let a = 0; a < w.N; a++) {
    if (!w.isLand[a] || isWater(w, a)) continue;
    for (let k = 0; k < 6; k++) {
      const b = grid.nb[a * 6 + k]!;
      if (b < 0 || !w.isLand[b] || isWater(w, b)) continue;
      if (lvl[a]! - lvl[b]! === 1) {
        const key = P.id[a]! * n + P.id[b]!;
        let l = shared.get(key);
        if (!l) { l = []; shared.set(key, l); }
        l.push([a, k, b]);
      }
    }
  }
  const uf = new Int32Array(n).map((_, i) => i);
  const find = (a: number): number => {
    while (uf[a] !== a) { uf[a] = uf[uf[a]!]!; a = uf[a]!; }
    return a;
  };
  const keys = [...shared.keys()];
  for (let i = keys.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [keys[i], keys[j]] = [keys[j]!, keys[i]!];
  }
  const chosen: number[] = [];
  const rest: number[] = [];
  for (const key of keys) {
    const hi = Math.floor(key / n);
    const lo = key % n;
    if (find(hi) !== find(lo)) { uf[find(hi)] = find(lo); chosen.push(key); } else rest.push(key);
  }
  const extra = Math.min(rest.length, 1 + Math.floor(rnd() * 2) + Math.floor(chosen.length * 0.12));
  for (let i = 0; i < extra; i++) chosen.push(rest[i]!);

  const walkPath = (start: number, target: number, pid: number, maxLen: number): void => {
    let cur = start;
    for (let i = 0; i < maxLen; i++) {
      w.path[cur] = 1;
      if (cur === target) break;
      let best = -1;
      let bd = (grid.x[cur]! - grid.x[target]!) ** 2 + (grid.z[cur]! - grid.z[target]!) ** 2;
      for (let k = 0; k < 6; k++) {
        const nn = grid.nb[cur * 6 + k]!;
        if (nn >= 0 && P.id[nn] === pid && !w.isRampCell[nn]) {
          const d = (grid.x[nn]! - grid.x[target]!) ** 2 + (grid.z[nn]! - grid.z[target]!) ** 2;
          if (d < bd - 1e-6) { bd = d; best = nn; }
        }
      }
      if (best < 0) break;
      cur = best;
    }
  };

  const ramps: RampInfo[] = [];
  for (const key of chosen) {
    const hi = Math.floor(key / n);
    const lo = key % n;
    const ents = shared.get(key)!.slice();
    for (let i = ents.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [ents[i], ents[j]] = [ents[j]!, ents[i]!];
    }
    const nearWater = (c: number): boolean => {
      if (isWater(w, c)) return true;
      for (let q = 0; q < 6; q++) {
        const nn = grid.nb[c * 6 + q]!;
        if (nn >= 0 && isWater(w, nn)) return true;
      }
      return false;
    };
    const good = ents.filter(([a, k, b]) => {
      if (nearWater(a) || nearWater(b)) return false;
      if (w.isRampCell[a] || w.isRampCell[b] || w.path[a] || w.path[b]) return false;
      for (let q = 0; q < 6; q++) {
        const nn = grid.nb[b * 6 + q]!;
        if (nn >= 0 && w.isRampCell[nn]) return false;
      }
      const far = grid.nb[b * 6 + k]!;
      const back = grid.nb[a * 6 + ((k + 3) % 6)]!;
      return far >= 0 && P.id[far] === lo && back >= 0 && P.id[back] === hi;
    });
    const dry = ents.filter(([a, , b]) => !nearWater(a) && !nearWater(b));
    const pool = good.length ? good : dry.length ? dry : ents;
    const pick = pool[0]!;
    const [a, k, b] = pick;
    w.isRampCell[a] = 1;
    w.isRampCell[b] = 1;
    walkPath(a, centreCell[hi]!, hi, 4);
    const far = grid.nb[b * 6 + k]!;
    if (far >= 0 && P.id[far] === lo) walkPath(far, centreCell[lo]!, lo, 4);
    const back = grid.nb[a * 6 + ((k + 3) % 6)]!;
    const centre: [number, number][] = [];
    if (far >= 0 && P.id[far] === lo) centre.push([grid.x[far]!, grid.z[far]!]);
    centre.push([grid.x[b]!, grid.z[b]!], [grid.x[a]!, grid.z[a]!]);
    if (back >= 0 && P.id[back] === hi) centre.push([grid.x[back]!, grid.z[back]!]);
    const cands: number[] = [];
    const ordered = [pick, ...(good.length ? good : pool).filter((e) => e !== pick)].slice(0, 24);
    for (const e of ordered) cands.push(e[0], e[1], e[2]);
    ramps.push({
      id: ramps.length, regionA: w.region[a]!, regionB: w.region[b]!, cells: [a, b], centre, width: RAMP_W0, cands, levelHigh: lvl[a]!,
    });
  }
  w.ramps = ramps;
}
