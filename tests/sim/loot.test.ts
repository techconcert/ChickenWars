import { describe, expect, it } from 'vitest';
import { expectedLootValue, lootQtyMult, rareChance, rewardLabel, rollLoot } from '@sim/combat/loot';
import { BALANCE, ITEMS } from '@sim/data/registry';
import type { PoiState } from '@sim/state';

type P = Pick<PoiState, 'kind' | 'tier' | 'level'>;
const camp = (tier: number, level: number): P => ({ kind: 'bandit_camp', tier, level });
const total = (r: Record<string, number | undefined>): number => Object.values(r).reduce<number>((a, b) => a + (b ?? 0), 0);

describe('loot scaling (user goal 6)', () => {
  it('quantity multiplier is clamped and monotone in the level gap', () => {
    const c = BALANCE.lootScaling;
    expect(lootQtyMult(0)).toBe(1);
    expect(lootQtyMult(-100)).toBe(c.minMult);
    expect(lootQtyMult(100)).toBe(c.maxMult);
    for (let d = -20; d < 20; d++) expect(lootQtyMult(d + 1)).toBeGreaterThanOrEqual(lootQtyMult(d));
  });

  it('is deterministic per seed', () => {
    expect(rollLoot(camp(2, 8), 4, 123)).toEqual(rollLoot(camp(2, 8), 4, 123));
  });

  it('expected loot value never drops as the camp level rises, for every tier and player level', () => {
    for (let tier = 1; tier <= 5; tier++) {
      for (let player = 1; player <= 12; player++) {
        let prev = -1;
        for (let lvl = (tier - 1) * 5 + 1; lvl <= tier * 5; lvl++) {
          const v = expectedLootValue(camp(tier, lvl), player);
          expect(v).toBeGreaterThanOrEqual(prev);
          prev = v;
        }
      }
    }
  });

  it('higher level camp yields more resources on average over many seeds (same player level)', () => {
    let lo = 0;
    let hi = 0;
    for (let seed = 1; seed <= 400; seed++) {
      lo += total(rollLoot(camp(3, 11), 8, seed).resources);
      hi += total(rollLoot(camp(3, 15), 8, seed).resources);
    }
    expect(hi).toBeGreaterThan(lo);
  });

  it('higher level camp gives a rare drop at least as often (statistical, deterministic)', () => {
    const rareCount = (level: number): number => {
      let n = 0;
      for (let seed = 1; seed <= 600; seed++) {
        const r = rollLoot(camp(3, level), 8, seed);
        if (r.items.length > 0 || (r.resources.ember ?? 0) > 0) n++;
      }
      return n;
    };
    expect(rareCount(15)).toBeGreaterThanOrEqual(rareCount(11));
    expect(rareCount(15)).toBeGreaterThan(rareCount(6));
  });

  it('rare chance grows with the level gap for every tier', () => {
    for (let tier = 1; tier <= 5; tier++) {
      let prev = -1;
      for (let delta = -10; delta <= 10; delta++) {
        const c = rareChance(tier, delta);
        expect(c).toBeGreaterThanOrEqual(prev);
        prev = c;
      }
    }
  });

  it('dropped items exist in items.json; bosses always drop an item; lairs pay more than camps', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const r = rollLoot({ kind: 'boss', tier: 4, level: 20 }, 10, seed);
      expect(r.items.length).toBeGreaterThanOrEqual(1);
      for (const i of r.items) expect(ITEMS[i]).toBeDefined();
    }
    expect(expectedLootValue({ kind: 'lair', tier: 3, level: 15 }, 10)).toBeGreaterThan(expectedLootValue(camp(3, 15), 10));
  });

  it('reward label reflects the player being under- or over-levelled', () => {
    expect(rewardLabel(camp(3, 12), 3)).toBe('rich');
    expect(rewardLabel(camp(1, 1), 12)).toBe('poor');
    expect(rewardLabel(camp(2, 8), 8)).toBe('fair');
  });
});
