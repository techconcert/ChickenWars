import { describe, expect, it } from 'vitest';
import { buildHeightField } from '../../src/gen/terrain/field';
import { generateTerrainLogic } from '../../src/gen/terrain/logic';
import { generatePlacements } from '../../src/gen/terrain/placement';
import { distanceToCliff, heightAt, isWalkableAt, nearestRamp, rampAt, slopeAt } from '../../src/gen/terrain/queries';
import { clearTerrainCache, defaultSampleSize, generateTerrainAsync, generateTerrainSync, terrainCacheKey } from '../../src/gen/terrain/client';

const now = (): number => performance.now();

describe('height field', () => {
  const rows: string[] = [];
  it.each([1337, 5, 99])('every ramp slope is at most 0.6, radius 40 seed %i', (seed) => {
    const logic = generateTerrainLogic(seed, { radius: 40 });
    const f = buildHeightField(logic, { now });
    rows.push(`r40 seed ${seed}: ramps ${f.stats.rampCount}, max slope ${f.stats.maxSlope.toFixed(2)}, widened ${f.stats.widened}, rerouted ${f.stats.rerouted}, lengthened ${f.stats.lengthened}, ${f.stats.genMs.toFixed(0)} ms`);
    expect(f.stats.rampCount).toBe(logic.ramps.length);
    for (const s of f.stats.slopes) expect(s).toBeLessThan(0.6);
    expect(f.stats.okCount).toBe(f.stats.rampCount);
    console.log(rows[rows.length - 1]);
  });
  it('river start keeps ramps within limit too', () => {
    const logic = generateTerrainLogic(7, { radius: 40, startType: { river: true, snowBaseline: 0, islands: 1 } });
    const f = buildHeightField(logic, { now });
    console.log(`river r40: ramps ${f.stats.rampCount}, max slope ${f.stats.maxSlope.toFixed(2)}, ${f.stats.genMs.toFixed(0)} ms`);
    for (const s of f.stats.slopes) expect(s).toBeLessThan(0.6);
  });
  it('queries and placements behave', () => {
    const logic = generateTerrainLogic(42, { radius: 40 });
    const f = buildHeightField(logic, { now });
    const rp = f.ramps[0]!;
    expect(rampAt(f, rp.px, rp.pz)).toBeGreaterThan(0.5);
    expect(nearestRamp(f, rp.px + 0.2, rp.pz)?.ramp.id).toBe(rp.id);
    expect(isWalkableAt(f, rp.px, rp.pz)).toBe(true);
    expect(slopeAt(f, rp.px, rp.pz)).toBeLessThan(0.62);
    expect(isWalkableAt(f, f.x0 + 1, f.z0 + 1)).toBe(false);
    expect(heightAt(f, f.x0 + 1, f.z0 + 1)).toBeLessThan(0);
    expect(distanceToCliff(f, rp.px, rp.pz)).toBeGreaterThanOrEqual(0);
    const pl = generatePlacements(f);
    console.log(`placements r40: rocks ${pl.rocks.length} (ramp lining ${pl.rocks.filter((r) => r.kind === 'ramp').length}), trees ${pl.trees.length}, tufts ${pl.tufts.length}, contour ${pl.contourLength.toFixed(0)}`);
    expect(pl.rocks.length).toBeGreaterThan(50);
    expect(pl.trees.length).toBeGreaterThan(50);
    expect(pl.rocks.some((r) => r.kind === 'ramp')).toBe(true);
    for (const t of pl.trees) expect(rampAt(f, t.x, t.z)).toBeLessThan(0.05);
    for (const r of pl.rocks) if (r.kind === 'cliff') expect(rampAt(f, r.x, r.z)).toBeLessThan(0.6);
  });
  it('is deterministic for the same inputs', () => {
    const logic = generateTerrainLogic(11, { radius: 40 });
    const a = buildHeightField(logic);
    const b = buildHeightField(logic);
    expect(Array.from(a.H.subarray(0, 5000))).toEqual(Array.from(b.H.subarray(0, 5000)));
  });
});

describe('bundle and client', () => {
  it('sync bundle and cached async fallback agree', async () => {
    clearTerrainCache();
    const params = { seed: 3, radius: 40, startType: { id: 'islands', river: false, snowBaseline: 0, islands: 4 } };
    const sync = generateTerrainSync(params, undefined, now);
    const progress: number[] = [];
    const asy = await generateTerrainAsync(params, (p) => progress.push(p));
    expect(asy.logic.hash).toBe(sync.logic.hash);
    expect(progress.length).toBeGreaterThan(0);
    expect(await generateTerrainAsync(params)).toBe(asy);
    console.log('bundle r40 islands timings', JSON.stringify(sync.timings, (k, v) => (typeof v === 'number' ? Math.round(v) : v)));
  });
});

describe('standard map (radius 60)', () => {
  it('is deterministic (logic hash, field samples), keeps ramps under 0.6 and uses the coarser default sampling', () => {
    expect(defaultSampleSize(40)).toBe(0.3);
    expect(defaultSampleSize(60)).toBe(0.35);
    const params = { seed: 1337, radius: 60 };
    expect(terrainCacheKey(params)).toContain('|0.35|');
    const a = generateTerrainSync(params, undefined, now);
    const b = generateTerrainSync(params);
    expect(a.logic.hash).toBe(b.logic.hash);
    expect(a.field.h).toBe(0.35);
    expect(Array.from(a.field.H.subarray(0, 20000))).toEqual(Array.from(b.field.H.subarray(0, 20000)));
    expect(a.placements.rocks.length).toBe(b.placements.rocks.length);
    expect(a.field.stats.okCount).toBe(a.field.stats.rampCount);
    for (const s of a.field.stats.slopes) expect(s).toBeLessThan(0.6);
    console.log(`r60 sample 0.35: ${a.field.n} samples, ramps ${a.field.stats.rampCount}, max slope ${a.field.stats.maxSlope.toFixed(2)}, timings ${JSON.stringify(a.timings, (_k, v) => (typeof v === 'number' ? Math.round(v) : v))}`);
  });
});
