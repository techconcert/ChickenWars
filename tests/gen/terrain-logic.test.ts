import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { canStep, F_LAND, F_LAKE, F_RAMP, F_WALKABLE, generateTerrainLogic, reachable, toPlainLogic } from '../../src/gen/terrain/logic';
import type { StartTypeParams, TerrainLogic } from '../../src/gen/terrain/types';
import { hexDistance, makeHexGrid, worldToCell, hexToWorld } from '../../src/gen/hex';

const START: Record<string, StartTypeParams> = {
  river_valley: { id: 'river_valley', river: true, snowBaseline: 0, islands: 1 },
  frozen_north: { id: 'frozen_north', river: false, snowBaseline: 0.5, islands: 1 },
  islands: { id: 'islands', river: false, snowBaseline: 0, islands: 4 },
};
const SEEDS = [1337, 7, 42, 2024, 99001];

function connectedFraction(l: TerrainLogic): number {
  let first = -1;
  let walk = 0;
  for (let c = 0; c < l.count; c++) if (l.flags[c]! & F_WALKABLE) { walk++; if (first < 0) first = c; }
  const seen = reachable(l, first);
  let n = 0;
  for (let c = 0; c < l.count; c++) if (seen[c]) n++;
  return n / walk;
}

function smallestPatch(l: TerrainLogic): number {
  const lab = new Uint8Array(l.count);
  let smallest = 1e9;
  for (let c = 0; c < l.count; c++) {
    if (!(l.flags[c]! & F_WALKABLE) || lab[c]) continue;
    const q = [c];
    lab[c] = 1;
    for (let h = 0; h < q.length; h++) {
      const a = q[h]!;
      for (let k = 0; k < 6; k++) {
        const b = l.grid.nb[a * 6 + k]!;
        if (b >= 0 && !lab[b] && l.flags[b]! & F_WALKABLE && l.level[b] === l.level[c]) { lab[b] = 1; q.push(b); }
      }
    }
    smallest = Math.min(smallest, q.length);
  }
  return smallest;
}

describe('hex helpers', () => {
  it('follows the contract cell order and round-trips world coordinates', () => {
    const g = makeHexGrid(5);
    expect(g.count).toBe(91);
    expect(g.q[0]).toBe(-5);
    expect(g.idxOf(0, 0)).toBe(g.count >> 1);
    for (const c of [0, 10, 45, 90]) {
      const [x, z] = hexToWorld(g.q[c]!, g.r[c]!);
      expect(worldToCell(g, x, z)).toBe(c);
      expect(g.x[c]).toBeCloseTo(x, 9);
    }
    expect(hexDistance(0, 0, 3, -1)).toBe(3);
    expect(g.nb[g.idxOf(0, 0) * 6 + 0]).toBe(g.idxOf(1, 0));
  });
});

describe('logic determinism', () => {
  for (const radius of [40, 60]) {
    it(`same seed gives the same hash, radius ${radius}`, () => {
      const hashes = new Set<number>();
      for (const seed of SEEDS) {
        const a = generateTerrainLogic(seed, { radius });
        const b = generateTerrainLogic(seed, { radius });
        expect(a.hash).toBe(b.hash);
        expect(Array.from(a.flags)).toEqual(Array.from(b.flags));
        hashes.add(a.hash);
      }
      expect(hashes.size).toBe(SEEDS.length);
    });
  }
  it('logic files avoid trig/exp/pow/hypot/random', () => {
    for (const f of ['hex', 'noise', 'terrain/regions', 'terrain/levels', 'terrain/patches', 'terrain/ramps', 'terrain/biomes', 'terrain/logic', 'terrain/types']) {
      const src = readFileSync(new URL(`../../src/gen/${f}.ts`, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(src, f).not.toMatch(/Math\.(sin|cos|tan|exp|pow|hypot|atan2?|random|log)\b/);
    }
  });
  it('start types change the hash', () => {
    const base = generateTerrainLogic(7, { radius: 40 }).hash;
    for (const st of Object.values(START)) expect(generateTerrainLogic(7, { radius: 40, startType: st }).hash).not.toBe(base);
  });
});

describe('logic shape', () => {
  it('region counts scale with radius', () => {
    const ts: Record<number, number[]> = { 40: [], 60: [] };
    for (const seed of SEEDS) for (const radius of [40, 60]) ts[radius]!.push(generateTerrainLogic(seed, { radius }).stats.landRegions);
    console.log('land regions r40', ts[40]!.join(','), 'r60', ts[60]!.join(','));
    for (const n of ts[40]!) { expect(n).toBeGreaterThanOrEqual(6); expect(n).toBeLessThanOrEqual(16); }
    for (const n of ts[60]!) { expect(n).toBeGreaterThanOrEqual(12); expect(n).toBeLessThanOrEqual(22); }
  });
  it('still supports the prototype radius 34', () => {
    const l = generateTerrainLogic(1337, { radius: 34 });
    expect(l.stats.landRegions).toBeGreaterThan(20);
    expect(connectedFraction(l)).toBe(1);
  });
  it('plain export matches the sim input shape', () => {
    const l = generateTerrainLogic(5, { radius: 40 });
    const p = toPlainLogic(l);
    expect(p.terrainHash).toBe(l.hash);
    expect(p.regionOf).toHaveLength(l.count);
    expect(p.regionOf.some((r) => r === -1)).toBe(true);
    expect(Math.max(...p.regionOf)).toBe(l.regions.length - 1);
    expect(p.ramps.length).toBe(l.ramps.length);
    for (const r of l.regions) for (const n of r.neighbours) expect(l.regions[n]!.neighbours).toContain(r.id);
    for (const ramp of p.ramps) expect(ramp.cells.every((c) => (p.flags[c]! & F_RAMP) !== 0)).toBe(true);
    expect(JSON.parse(JSON.stringify(p))).toEqual(p);
    const sea = p.flags.findIndex((f) => (f & F_LAND) === 0);
    expect(p.navCost[sea]).toBe(0);
  });
});

describe('walkable connectivity', () => {
  it.each(SEEDS)('plain map radius 40 seed %i is one connected walkable region', (seed) => {
    expect(connectedFraction(generateTerrainLogic(seed, { radius: 40 }))).toBe(1);
  });
  it.each([1337, 7, 42])('plain map radius 60 seed %i', (seed) => {
    expect(connectedFraction(generateTerrainLogic(seed, { radius: 60 }))).toBe(1);
  });
  for (const [name, st] of Object.entries(START)) {
    it.each([1337, 7, 42, 2024])(`${name} radius 40 seed %i`, (seed) => {
      const l = generateTerrainLogic(seed, { radius: 40, startType: st });
      expect(connectedFraction(l)).toBe(1);
      expect(smallestPatch(l)).toBeGreaterThanOrEqual(4);
    });
    it(`${name} radius 60`, () => {
      expect(connectedFraction(generateTerrainLogic(5, { radius: 60, startType: st }))).toBe(1);
    });
  }
  it('canStep blocks cliffs and lakes', () => {
    const l = generateTerrainLogic(42, { radius: 40 });
    let cliffs = 0;
    let blocked = 0;
    for (let c = 0; c < l.count; c++) {
      if (!(l.flags[c]! & F_WALKABLE)) continue;
      for (let k = 0; k < 6; k++) {
        const b = l.grid.nb[c * 6 + k]!;
        if (b < 0 || !(l.flags[b]! & F_WALKABLE)) continue;
        if (Math.abs(l.level[c]! - l.level[b]!) >= 1 && !((l.flags[c]! | l.flags[b]!) & F_RAMP)) { cliffs++; if (!canStep(l, c, b)) blocked++; }
      }
    }
    expect(cliffs).toBeGreaterThan(0);
    expect(blocked).toBe(cliffs);
  });
});

describe('no flat patch under 4 hexes', () => {
  it.each(SEEDS)('seed %i', (seed) => {
    for (const radius of [40, 60]) expect(smallestPatch(generateTerrainLogic(seed, { radius }))).toBeGreaterThanOrEqual(4);
  });
});

describe('start types', () => {
  it('river start carves water with walkable fords', () => {
    const l = generateTerrainLogic(7, { radius: 40, startType: START.river_valley });
    let water = 0;
    let fords = 0;
    for (let c = 0; c < l.count; c++) {
      if (l.river[c] === 1) { water++; expect(l.flags[c]! & F_LAKE).toBeTruthy(); expect(l.flags[c]! & F_WALKABLE).toBeFalsy(); expect(l.level[c]).toBe(0); }
      if (l.river[c] === 2) { fords++; expect(l.flags[c]! & F_WALKABLE).toBeTruthy(); expect(l.level[c]).toBe(0); }
    }
    expect(water).toBeGreaterThan(8);
    expect(fords).toBeGreaterThanOrEqual(4);
  });
  it('frozen north has more snow and highland', () => {
    const count = (l: TerrainLogic): number => {
      let n = 0;
      for (let c = 0; c < l.count; c++) if ((l.flags[c]! & F_LAND) && l.biome[c]! >= 3) n++;
      return n;
    };
    let frozen = 0;
    let plain = 0;
    for (const seed of SEEDS) {
      frozen += count(generateTerrainLogic(seed, { radius: 40, startType: START.frozen_north }));
      plain += count(generateTerrainLogic(seed, { radius: 40 }));
    }
    expect(frozen).toBeGreaterThan(plain);
  });
  it('islands start has bridges linking several land masses', () => {
    const l = generateTerrainLogic(7, { radius: 60, startType: START.islands });
    expect(l.bridges.length).toBeGreaterThanOrEqual(1);
    for (const b of l.bridges) for (const c of b.cells) expect(l.flags[c]! & F_RAMP).toBeTruthy();
  });
});

describe('generation time', () => {
  it('logs logic timings', () => {
    const lines: string[] = [];
    for (const radius of [34, 40, 60]) {
      const t0 = performance.now();
      for (let i = 0; i < 3; i++) generateTerrainLogic(1000 + i, { radius });
      lines.push(`r${radius}: ${((performance.now() - t0) / 3).toFixed(0)} ms`);
    }
    console.log('logic generation (avg of 3):', lines.join(', '));
    expect(lines.length).toBe(3);
  });
});
