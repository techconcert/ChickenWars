import { describe, expect, it } from 'vitest';
import { cellDistance, makeHexGrid } from '../../src/gen/hex';
import { BASE_CLIFF, BASE_FOREST, BASE_GRASS, BASE_ROCK, BASE_WATER, buildBaseHeightField, generateBaseTerrain } from '../../src/gen/base/layout';

describe('base layout', () => {
  const g = makeHexGrid(16);
  it('is deterministic and sized to the hex grid', () => {
    const a = generateBaseTerrain(123);
    expect(a).toHaveLength(g.count);
    expect(generateBaseTerrain(123)).toEqual(a);
    expect(generateBaseTerrain(124)).not.toEqual(a);
    for (const t of a) expect(t >= 0 && t <= 4).toBe(true);
  });
  it.each([1, 2, 3, 77, 1337, 424242])('seed %i: open centre, grass share, features', (seed) => {
    const t = generateBaseTerrain(seed);
    const centre = g.idxOf(0, 0);
    let inner = 0;
    let grass = 0;
    const counts = [0, 0, 0, 0, 0];
    for (let c = 0; c < g.count; c++) {
      const d = cellDistance(g, c, centre);
      counts[t[c]!]!++;
      if (d <= 3) expect(t[c]).toBe(BASE_GRASS);
      if (d <= 10) { inner++; if (t[c] === BASE_GRASS) grass++; }
      if (d === 16) expect(t[c]).toBe(BASE_CLIFF);
    }
    expect(grass / inner).toBeGreaterThanOrEqual(0.6);
    expect(counts[BASE_FOREST]).toBeGreaterThan(10);
    expect(counts[BASE_ROCK]).toBeGreaterThan(0);
    expect(counts[BASE_WATER]).toBeGreaterThanOrEqual(3);
  });
  it('height field is a plateau with cliffs to water', () => {
    const t = generateBaseTerrain(5);
    const f = buildBaseHeightField(t, 16, 5);
    const centre = g.idxOf(0, 0);
    expect(Math.abs(f.cellHeight(centre) - f.plateauY)).toBeLessThan(0.4);
    expect(f.heightAt(f.x0 + 1, f.z0 + 1)).toBeLessThan(-1.5);
    expect(f.heightAt(3, 2)).toBe(f.heightAt(3, 2));
    expect(buildBaseHeightField(t, 16, 5).H).toEqual(f.H);
  });
});
