import { describe, expect, it } from 'vitest';
import { hash32, hashRand, rngInt, rngNext } from '@sim/rng';
import { clamp, compareKeys, costAtLevel, sortedKeys } from '@sim/util';

describe('trivial', () => {
  it('runs', () => expect(1 + 1).toBe(2));
});

describe('rng', () => {
  it('is deterministic and in [0,1)', () => {
    const a = { rng: 42 };
    const b = { rng: 42 };
    for (let i = 0; i < 1000; i++) {
      const x = rngNext(a);
      expect(x).toBe(rngNext(b));
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
    expect(a.rng).toBe(b.rng);
  });
  it('rngInt stays in range and has spread', () => {
    const s = { rng: 7 };
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) { const v = rngInt(s, 6); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(6); seen.add(v); }
    expect(seen.size).toBe(6);
  });
  it('hash32/hashRand are stable and order sensitive', () => {
    expect(hash32('a', 1)).toBe(hash32('a', 1));
    expect(hash32('a', 1)).not.toBe(hash32(1, 'a'));
    expect(hash32('ab', 'c')).not.toBe(hash32('a', 'bc'));
    const r = hashRand(1, 'x', 5, 'id');
    expect(r).toBe(hashRand(1, 'x', 5, 'id'));
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThan(1);
  });
});

describe('util', () => {
  it('sortedKeys is numeric aware', () => {
    expect(sortedKeys({ '10': 1, '2': 1, b: 1, a: 1, '1': 1 })).toEqual(['1', '2', '10', 'a', 'b']);
    expect(compareKeys('9', '10')).toBeLessThan(0);
  });
  it('clamp', () => { expect(clamp(5, 0, 3)).toBe(3); expect(clamp(-1, 0, 3)).toBe(0); expect(clamp(2, 0, 3)).toBe(2); });
  it('costAtLevel follows round(base * growth^(level-1))', () => {
    expect(costAtLevel({ baseCost: { wood: 100 }, costGrowth: 1.5 }, 1)).toEqual({ wood: 100 });
    expect(costAtLevel({ baseCost: { wood: 100 }, costGrowth: 1.5 }, 3)).toEqual({ wood: 225 });
  });
});
