import { describe, expect, it } from 'vitest';
import { generateTerrainLogic, toPlainLogic } from '@gen/terrain/logic';
import { createInitialState } from '@sim/init';
import { cellDistance, findPath, gridFor } from '@sim/nav';
import { makeTestBaseTerrain } from '@sim/worldgen/testLogic';

describe('worldgen on the real terrain generator', () => {
  it('radius 40 seed 1337: reachable content, guarantees, determinism', () => {
    const l = generateTerrainLogic(1337, { radius: 40 });
    const p = toPlainLogic(l);
    // capital: walkable land cell nearest the centroid of the largest region
    const big = [...p.regions].sort((a, b) => b.cells - a.cells)[0]!;
    let cap = big.centroidCell;
    if (!(p.flags[cap]! & 4)) cap = p.flags.findIndex((f, i) => (f & 4) !== 0 && p.regionOf[i] === big.id);
    const wl = { ...p, capitalCell: cap };
    const mk = () => createInitialState(1337, {}, { worldLogic: wl as never, baseTerrain: makeTestBaseTerrain(16, 1) });
    const s = mk();
    expect(JSON.stringify(mk().world.pois)).toBe(JSON.stringify(s.world.pois));
    const g = gridFor(s.world.radius);
    expect(Object.keys(s.world.pois).length).toBeGreaterThan(10);
    for (const q of Object.values(s.world.pois)) expect(findPath(s.world, cap, q.cell, { allowLocked: true })).not.toBeNull();
    for (const n of Object.values(s.world.nodes)) expect(findPath(s.world, cap, n.cell, { allowLocked: true })).not.toBeNull();
    const camps = Object.values(s.world.pois).filter((q) => q.kind === 'bandit_camp' && q.tier === 1 && cellDistance(g, cap, q.cell) <= 12);
    expect(camps.length).toBeGreaterThanOrEqual(2);
    expect(Object.values(s.world.nodes).filter((n) => cellDistance(g, cap, n.cell) <= 12).length).toBeGreaterThanOrEqual(4);
    console.log(s.world.regions.map((r) => `${r.id}:t${r.dangerTier}`).join(' '), Object.keys(s.world.pois).length, Object.keys(s.world.nodes).length);
  });
});
