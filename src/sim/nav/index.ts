// Hex nav graph + A* (docs/systems/marches-and-nav.md). Pure and deterministic.
import type { WorldState } from '../state';
import {
  LEVEL_CHANGE_FACTOR, PATH_CACHE_SIZE, TERRAIN_SLOW_MAX, TERRAIN_SLOW_PER_COST,
} from './constants';
import { gridFor } from './hex';

export * from './constants';
export { cellDistance, cellsWithin, gridFor } from './hex';

export const F_RAMP = 8;

export interface PathOpts { allowLocked?: boolean; /** Pretend locked bridges are open (used to tell 'no road' from 'bridge locked'). */ ignoreBridges?: boolean }
type NavWorld = Pick<WorldState, 'radius' | 'regionOf' | 'level' | 'flags' | 'navCost' | 'regions'> & Partial<Pick<WorldState, 'bridges'>>;

/** True when the region holding `cell` is unlocked (sea / unknown regions never block). */
export function cellUnlocked(w: NavWorld, cell: number): boolean {
  const r = w.regionOf[cell] ?? -1;
  if (r < 0) return true;
  return w.regions[r]?.unlocked ?? true;
}

const bridgeIndexCache = new WeakMap<object, Map<number, number>>();
/** True when `cell` lies on a bridge that is still locked. Locked bridges block every march and raid, `allowLocked` or not. */
export function bridgeLocked(w: NavWorld, cell: number): boolean {
  const br = w.bridges;
  if (!br || br.length === 0) return false;
  let idx = bridgeIndexCache.get(br);
  if (!idx) {
    idx = new Map();
    for (let i = 0; i < br.length; i++) for (const c of br[i]!.cells) idx.set(c, i);
    bridgeIndexCache.set(br, idx);
  }
  const i = idx.get(cell);
  return i !== undefined && !br[i]!.unlocked;
}

/** Edge rule between two neighbouring cells, ignoring locks: both passable, same level or 1 apart across a ramp cell. */
export function canMove(w: NavWorld, a: number, b: number): boolean {
  if ((w.navCost[a] ?? 0) <= 0 || (w.navCost[b] ?? 0) <= 0) return false;
  const d = Math.abs((w.level[a] ?? 0) - (w.level[b] ?? 0));
  if (d === 0) return true;
  return d === 1 && (((w.flags[a] ?? 0) | (w.flags[b] ?? 0)) & F_RAMP) !== 0;
}

/** True when stepping a -> b changes level. */
export function isLevelChange(w: NavWorld, a: number, b: number): boolean {
  return (w.level[a] ?? 0) !== (w.level[b] ?? 0);
}

/** Path cost of entering `b` (doubled integer units: navCost x2, x3 for a level change). */
function edgeCost2(w: NavWorld, a: number, b: number): number {
  return (w.navCost[b] ?? 1) * (isLevelChange(w, a, b) ? 3 : 2);
}

/** Cost of entering b from a as a real number: navCost x (1.5 on level change). */
export function stepCost(w: NavWorld, a: number, b: number): number {
  return (w.navCost[b] ?? 1) * (isLevelChange(w, a, b) ? LEVEL_CHANGE_FACTOR : 1);
}

/** March slowdown divisor for entering cell b from a (1 = baseline). */
export function stepSlow(w: NavWorld, a: number, b: number): number {
  const t = Math.min(TERRAIN_SLOW_MAX, 1 + TERRAIN_SLOW_PER_COST * ((w.navCost[b] ?? 1) - 1));
  return t * (isLevelChange(w, a, b) ? LEVEL_CHANGE_FACTOR : 1);
}

/** Key that changes whenever any region lock state changes. */
export function unlockVersion(w: NavWorld): string {
  let s = '';
  for (const r of w.regions) s += r.unlocked ? '1' : '0';
  if (w.bridges) { s += '|'; for (const b of w.bridges) s += b.unlocked ? '1' : '0'; }
  return s;
}

const minCostCache = new WeakMap<object, number>();
function minPositiveCost(w: NavWorld): number {
  let m = minCostCache.get(w.navCost);
  if (m === undefined) {
    m = 9999;
    for (let i = 0; i < w.navCost.length; i++) { const c = w.navCost[i]!; if (c > 0 && c < m) m = c; }
    minCostCache.set(w.navCost, m);
  }
  return m;
}

/** Cells reachable from `from` ignoring locks (BFS over canMove). Cached per navCost array. */
const reachCache = new WeakMap<object, Map<number, Uint8Array>>();
export function reachableFrom(w: NavWorld, from: number): Uint8Array {
  let per = reachCache.get(w.navCost);
  if (!per) { per = new Map(); reachCache.set(w.navCost, per); }
  const hit = per.get(from);
  if (hit) return hit;
  const g = gridFor(w.radius);
  const seen = new Uint8Array(g.count);
  const q: number[] = [from];
  seen[from] = 1;
  for (let h = 0; h < q.length; h++) {
    const c = q[h]!;
    for (let k = 0; k < 6; k++) {
      const b = g.nb[c * 6 + k]!;
      if (b >= 0 && !seen[b] && canMove(w, c, b)) { seen[b] = 1; q.push(b); }
    }
  }
  per.set(from, seen);
  return seen;
}

// ---- binary heap ordered by (f, cell id)
class Heap {
  f: number[] = [];
  id: number[] = [];
  get size(): number { return this.f.length; }
  private less(i: number, j: number): boolean {
    const a = this.f[i]!;
    const b = this.f[j]!;
    return a < b || (a === b && this.id[i]! < this.id[j]!);
  }
  private swap(i: number, j: number): void {
    const tf = this.f[i]!; this.f[i] = this.f[j]!; this.f[j] = tf;
    const ti = this.id[i]!; this.id[i] = this.id[j]!; this.id[j] = ti;
  }
  push(f: number, id: number): void {
    this.f.push(f); this.id.push(id);
    let i = this.f.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(i, p)) break;
      this.swap(i, p); i = p;
    }
  }
  pop(): number {
    const top = this.id[0]!;
    const lf = this.f.pop()!;
    const li = this.id.pop()!;
    if (this.f.length) {
      this.f[0] = lf; this.id[0] = li;
      let i = 0;
      const n = this.f.length;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < n && this.less(l, m)) m = l;
        if (r < n && this.less(r, m)) m = r;
        if (m === i) break;
        this.swap(i, m); i = m;
      }
    }
    return top;
  }
}

function astar(w: NavWorld, from: number, to: number, allowLocked: boolean, ignoreBridges: boolean): number[] | null {
  const g = gridFor(w.radius);
  if (from < 0 || to < 0 || from >= g.count || to >= g.count) return null;
  if (from === to) return [from];
  if ((w.navCost[to] ?? 0) <= 0) return null;
  if (!allowLocked && !cellUnlocked(w, to)) return null;
  if (!ignoreBridges && bridgeLocked(w, to)) return null;
  const h2 = 2 * minPositiveCost(w);
  const tq = g.q[to]!;
  const tr = g.r[to]!;
  const heur = (c: number): number => {
    const dq = g.q[c]! - tq;
    const dr = g.r[c]! - tr;
    return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr)) * h2;
  };
  const gs = new Float64Array(g.count).fill(Infinity);
  const prev = new Int32Array(g.count).fill(-1);
  const closed = new Uint8Array(g.count);
  const open = new Heap();
  gs[from] = 0;
  open.push(heur(from), from);
  while (open.size) {
    const c = open.pop();
    if (closed[c]) continue;
    closed[c] = 1;
    if (c === to) break;
    for (let k = 0; k < 6; k++) {
      const b = g.nb[c * 6 + k]!;
      if (b < 0 || closed[b] || !canMove(w, c, b)) continue;
      if (!allowLocked && !cellUnlocked(w, b)) continue;
      if (!ignoreBridges && bridgeLocked(w, b)) continue;
      const ng = gs[c]! + edgeCost2(w, c, b);
      if (ng < gs[b]!) { gs[b] = ng; prev[b] = c; open.push(ng + heur(b), b); }
    }
  }
  if (!closed[to]) return null;
  const path: number[] = [];
  for (let c = to; c !== -1; c = prev[c]!) path.push(c);
  return path.reverse();
}

const caches = new WeakMap<object, Map<string, number[] | null>>();

/**
 * Shortest path from `from` to `to` inclusive of both ends, or null. Cached per (from,to,unlockVersion) in an LRU of 64
 * per world. Tie-break by cell id is deterministic.
 */
export function findPath(world: NavWorld, from: number, to: number, opts: PathOpts = {}): number[] | null {
  const allow = opts.allowLocked === true;
  const ignoreB = opts.ignoreBridges === true;
  let cache = caches.get(world);
  if (!cache) { cache = new Map(); caches.set(world, cache); }
  const key = `${from},${to},${allow ? 1 : 0}${ignoreB ? 1 : 0},${unlockVersion(world)}`;
  if (cache.has(key)) {
    const v = cache.get(key)!;
    cache.delete(key);
    cache.set(key, v);
    return v ? v.slice() : null;
  }
  const p = astar(world, from, to, allow, ignoreB);
  cache.set(key, p ? p.slice() : null);
  if (cache.size > PATH_CACHE_SIZE) cache.delete(cache.keys().next().value as string);
  return p;
}

export function clearPathCache(world: object): void {
  caches.delete(world);
}

/** Validates that consecutive path cells are neighbours obeying the edge rules. */
export function pathIsValid(w: NavWorld, path: readonly number[], allowLocked = false): boolean {
  const g = gridFor(w.radius);
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    let adj = false;
    for (let k = 0; k < 6; k++) if (g.nb[a * 6 + k] === b) adj = true;
    if (!adj || !canMove(w, a, b)) return false;
    if (!allowLocked && !cellUnlocked(w, b)) return false;
    if (bridgeLocked(w, b)) return false;
  }
  return true;
}
