import { describe, expect, it } from 'vitest';
import { canMove, cellUnlocked, findPath, gridFor, pathIsValid, reachableFrom, stepCost } from '@sim/nav';
import { richState } from './richState';

function dijkstra(s: ReturnType<typeof richState>, from: number, to: number, allowLocked: boolean): number {
  const w = s.world;
  const g = gridFor(w.radius);
  const d = new Map<number, number>([[from, 0]]);
  const done = new Set<number>();
  for (;;) {
    let c = -1;
    let best = Infinity;
    for (const [k, v] of d) if (!done.has(k) && v < best) { best = v; c = k; }
    if (c < 0) return Infinity;
    if (c === to) return best;
    done.add(c);
    for (let k = 0; k < 6; k++) {
      const b = g.nb[c * 6 + k]!;
      if (b < 0 || !canMove(w, c, b) || (!allowLocked && !cellUnlocked(w, b))) continue;
      const nd = best + stepCost(w, c, b);
      if (nd < (d.get(b) ?? Infinity)) d.set(b, nd);
    }
  }
}

describe('nav', () => {
  const s = richState();
  const w = s.world;
  const pois = Object.values(w.pois);

  it('paths never cross cliffs: same level or one level across a ramp cell', () => {
    for (const p of pois) {
      const path = findPath(w, w.capitalCell, p.cell, { allowLocked: true })!;
      expect(path[0]).toBe(w.capitalCell);
      expect(path[path.length - 1]).toBe(p.cell);
      expect(pathIsValid(w, path, true)).toBe(true);
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1]!;
        const b = path[i]!;
        const d = Math.abs(w.level[a]! - w.level[b]!);
        expect(d <= 1).toBe(true);
        if (d === 1) expect((w.flags[a]! | w.flags[b]!) & 8).toBeGreaterThan(0);
      }
    }
    expect(Math.max(...w.level)).toBeGreaterThanOrEqual(2);
    expect(w.ramps.length).toBeGreaterThanOrEqual(4);
  });

  it('is optimal (matches Dijkstra cost) and deterministic', () => {
    for (const p of pois.slice(0, 8)) {
      const path = findPath(w, w.capitalCell, p.cell, { allowLocked: true })!;
      let c = 0;
      for (let i = 1; i < path.length; i++) c += stepCost(w, path[i - 1]!, path[i]!);
      expect(c).toBeCloseTo(dijkstra(s, w.capitalCell, p.cell, true), 6);
      expect(findPath(w, w.capitalCell, p.cell, { allowLocked: true })).toEqual(path);
    }
  });

  it('cached results are copies', () => {
    const a = findPath(w, w.capitalCell, pois[0]!.cell, { allowLocked: true })!;
    a.length = 0;
    expect(findPath(w, w.capitalCell, pois[0]!.cell, { allowLocked: true })!.length).toBeGreaterThan(1);
  });

  it('locked regions are refused unless allowLocked; unlocking opens them', () => {
    const t = s.world.regions.find((r) => !r.unlocked)!;
    const target = pois.find((p) => p.region === t.id)!;
    expect(findPath(w, w.capitalCell, target.cell)).toBeNull();
    expect(findPath(w, w.capitalCell, target.cell, { allowLocked: true })).not.toBeNull();
    t.unlocked = true;
    expect(findPath(w, w.capitalCell, target.cell)).not.toBeNull();
    t.unlocked = false;
    expect(findPath(w, w.capitalCell, target.cell)).toBeNull();
  });

  it('blocked cells and lake are not enterable; same cell is a one-cell path', () => {
    const lake = w.flags.findIndex((f) => (f & 16) !== 0);
    expect(findPath(w, w.capitalCell, lake, { allowLocked: true })).toBeNull();
    expect(findPath(w, w.capitalCell, w.capitalCell)).toEqual([w.capitalCell]);
  });

  it('survives more than 64 distinct queries (LRU)', () => {
    const cells = Object.values(w.nodes).map((n) => n.cell);
    for (let i = 0; i < 80; i++) expect(findPath(w, w.capitalCell, cells[i % cells.length]!, { allowLocked: true })).not.toBeNull();
    const reach = reachableFrom(w, w.capitalCell);
    expect(reach[w.capitalCell]).toBe(1);
  });
});
