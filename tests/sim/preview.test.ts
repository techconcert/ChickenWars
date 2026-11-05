import { describe, expect, it } from 'vitest';
import { battlePreview } from '@sim/combat/preview';
import { resolveBattle } from '@sim/combat/resolver';
import type { Stack } from '@sim/state';
import { richState } from './richState';

describe('battle preview (brief)', () => {
  const s = richState();
  const boss = Object.values(s.world.pois).find((p) => p.kind === 'boss')!;
  const camp = Object.values(s.world.pois).find((p) => p.kind === 'bandit_camp' && p.tier === 1)!;
  const hero = Object.keys(s.heroes)[0]!;

  it('lists enemy composition, counters and phase 2 for a boss', () => {
    const b = battlePreview(s, null, boss.id)!;
    expect(b.kind).toBe('boss');
    expect(b.phase2).toBe(true);
    expect(b.enemyStacks.length).toBeGreaterThan(0);
    expect(Object.values(b.enemyByClass).reduce((x, y) => x + y, 0)).toBe(b.enemyStacks.reduce((x, y) => x + y.count, 0));
    expect(b.recommended.length).toBeGreaterThan(0);
    expect(b.outcome).toBeNull();
  });

  it('recommends the counter of the dominant class and siege against palisades', () => {
    const c = battlePreview(s, null, camp.id)!;
    expect(c.palisade).toBe(true);
    expect(c.phase2).toBe(false);
    expect(c.recommended).toContain('siege');
  });

  it('predicts deterministically and a bigger army wins more often', () => {
    const small = battlePreview(s, { hero, troops: { militia: 3 } }, camp.id)!.outcome!;
    const big = battlePreview(s, { hero, troops: { militia: 400, bowman: 200 } }, camp.id)!.outcome!;
    expect(battlePreview(s, { hero, troops: { militia: 3 } }, camp.id)!.outcome).toEqual(small);
    expect(small.winChance).toBeLessThan(big.winChance);
    expect(big.win).toBe(true);
    expect(battlePreview(s, null, 'nope')).toBeNull();
  });
});

describe('boss phase 2 (resolver)', () => {
  const A: Stack[] = [{ troop: 'militia', count: 160 }];
  const D: Stack[] = [{ troop: 'militia', count: 140 }];
  const run = (enrage?: { belowPct: number; atkPm: number }) =>
    resolveBattle({ attacker: { name: 'A', hero: null, stacks: A }, defender: { name: 'B', hero: null, stacks: D, enrage } }, 5);

  it('enrages once when the boss falls to half its troops and then hits harder', () => {
    const plain = run();
    const enr = run({ belowPct: 50, atkPm: 600 });
    expect(plain.phase2Round).toBeNull();
    expect(enr.phase2Round).toBeGreaterThan(1);
    expect(enr.rageEvents.filter((e) => e.skill === 'boss_enrage').length).toBe(1);
    expect(enr.rageEvents.find((e) => e.skill === 'boss_enrage')!.side).toBe('B');
    const lostA = (r: ReturnType<typeof run>): number => Object.values(r.lossesA).reduce((a, b) => a + b, 0);
    expect(lostA(enr)).toBeGreaterThan(lostA(plain));
    expect(run({ belowPct: 50, atkPm: 600 })).toEqual(enr); // deterministic
  });
});
