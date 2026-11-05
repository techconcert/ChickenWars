import { describe, expect, it } from 'vitest';
import { resolveBattle } from '@sim/combat/resolver';
import type { BattleHero, BattleResult } from '@sim/combat/resolver';
import { rankScale } from '@sim/combat/modifiers';
import { HERO_LIST, SKILLS } from '@sim/data/registry';
import type { Stack } from '@sim/state';

// Big mixed armies and fat hp so the fight lasts long enough for rage to hit 100 (as in combat.test.ts).
const ARMY: Stack[] = [{ troop: 'footman', count: 300 }, { troop: 'marksman', count: 300 }, { troop: 'knight', count: 300 }];
const SLOW = { hpPm: 30000 };
const hero = (skill: string | null, rank = 1): BattleHero => ({ name: 'h', atk: 20, def: 10, hp: 100, skill, skillRank: rank });

function fight(skill: string | null, rank = 1, seed = 5, asDefender = false): BattleResult {
  const mine = { name: 'A', hero: hero(skill, rank), stacks: ARMY, mods: SLOW };
  const foe = { name: 'D', hero: null, stacks: ARMY, mods: SLOW };
  return asDefender
    ? resolveBattle({ attacker: foe, defender: { ...mine, name: 'D' } }, seed)
    : resolveBattle({ attacker: mine, defender: foe }, seed);
}
const sum = (r: Record<string, number>): number => Object.values(r).reduce((a, b) => a + b, 0);

describe('all six skills exist and are bound to heroes', () => {
  it('every hero skill is defined', () => {
    for (const h of HERO_LIST) expect(SKILLS[h.skill]).toBeDefined();
    expect(Object.keys(SKILLS).sort()).toEqual(['charge', 'cleave', 'mend', 'rally_cry', 'shield_wall', 'volley']);
  });
});

describe('skill effects are deterministic and rank-scaled', () => {
  for (const id of Object.keys(SKILLS).sort()) {
    it(`${id}: same input gives identical results`, () => {
      expect(fight(id, 2)).toEqual(fight(id, 2));
    });
    it(`${id}: fires`, () => {
      const r = fight(id, 1);
      expect(r.rageEvents.some((e) => e.side === 'A' && e.skill === id)).toBe(true);
    });
  }

  it('cleave: burst on the largest stack hurts the enemy more than no skill, and more at higher rank', () => {
    const none = sum(fight(null).lossesB);
    const r1 = sum(fight('cleave', 1).lossesB);
    const r3 = sum(fight('cleave', 3).lossesB);
    expect(r1).toBeGreaterThan(none);
    expect(r3).toBeGreaterThanOrEqual(r1);
  });
  it('volley: only archers take the burst', () => {
    const none = fight(null);
    const v = fight('volley', 1);
    expect(v.lossesB['marksman'] ?? 0).toBeGreaterThan(none.lossesB['marksman'] ?? 0);
    expect(fight('volley', 3).lossesB['marksman'] ?? 0).toBeGreaterThanOrEqual(v.lossesB['marksman'] ?? 0);
  });
  it('rally_cry: attack buff kills more over its rounds, scaled by rank', () => {
    const none = sum(fight(null).lossesB);
    const r1 = sum(fight('rally_cry', 1).lossesB);
    const r3 = sum(fight('rally_cry', 3).lossesB);
    expect(r1).toBeGreaterThan(none);
    expect(r3).toBeGreaterThanOrEqual(r1);
  });
  it('charge: cavalry attack buff kills more cavalry-dealt damage than no skill', () => {
    const none = sum(fight(null).lossesB);
    const c1 = sum(fight('charge', 1).lossesB);
    expect(c1).toBeGreaterThan(none);
    expect(sum(fight('charge', 3).lossesB)).toBeGreaterThanOrEqual(c1);
  });
  it('shield_wall: the holder takes less damage, more at higher rank', () => {
    const none = sum(fight(null).lossesA);
    const s1 = sum(fight('shield_wall', 1).lossesA);
    const s3 = sum(fight('shield_wall', 3).lossesA);
    expect(s1).toBeLessThanOrEqual(none);
    expect(s3).toBeLessThanOrEqual(s1);
    expect(s3).toBeLessThan(none);
  });
  it('mend: wounded bonus is 40% at rank 1; rank 2+ casts twice with rank-scaled strength', () => {
    expect(fight(null).woundedBonusA).toBe(0);
    expect(fight('mend', 1).woundedBonusA).toBeCloseTo(0.4);
    expect(fight('mend', 3).woundedBonusA).toBeCloseTo((2 * rankScale(400, 3)) / 1000);
    expect(fight('mend', 3).woundedBonusA).toBeGreaterThan(fight('mend', 1).woundedBonusA);
  });
  it('works from the defender seat too', () => {
    const none = sum(fight(null, 1, 5, true).lossesA);
    expect(sum(fight('cleave', 1, 5, true).lossesA)).toBeGreaterThan(none);
  });
});
