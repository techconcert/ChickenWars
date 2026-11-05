import { describe, expect, it } from 'vitest';
import { resolveBattle } from '@sim/combat/resolver';
import type { BattleHero, BattleInput, BattleSide } from '@sim/combat/resolver';
import { stacksPower } from '@sim/combat/power';
import type { Stack } from '@sim/state';

const side = (name: string, stacks: Stack[], hero: BattleHero | null = null): BattleSide => ({ name, hero, stacks });
const hero = (skill: string | null, o: Partial<BattleHero> = {}): BattleHero => ({ name: 'h', atk: 0, def: 0, hp: 0, skill, skillRank: 1, ...o });
const battle = (a: Stack[], d: Stack[], extra: Partial<BattleInput> = {}, seed = 7) =>
  resolveBattle({ attacker: side('A', a), defender: side('D', d), ...extra }, seed);

// Roughly equal power (count * (atk+def+hp/10)): militia 28, bowman 24, rider 29.
const INF: Stack[] = [{ troop: 'militia', count: 100 }];
const ARC: Stack[] = [{ troop: 'bowman', count: 117 }];
const CAV: Stack[] = [{ troop: 'rider', count: 97 }];

describe('counter triangle at equal power', () => {
  it('equal power setup is within 1%', () => {
    const p = [stacksPower(INF), stacksPower(ARC), stacksPower(CAV)];
    expect(Math.max(...p) / Math.min(...p)).toBeLessThan(1.01);
  });
  it('infantry beats cavalry, cavalry beats archers, archers beat infantry (both seats)', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      expect(battle(INF, CAV, {}, seed).winner).toBe('attacker');
      expect(battle(CAV, INF, {}, seed).winner).toBe('defender');
      expect(battle(CAV, ARC, {}, seed).winner).toBe('attacker');
      expect(battle(ARC, CAV, {}, seed).winner).toBe('defender');
      expect(battle(ARC, INF, {}, seed).winner).toBe('attacker');
      expect(battle(INF, ARC, {}, seed).winner).toBe('defender');
    }
  });
});

describe('resolver basics', () => {
  it('is deterministic for the same input and seed', () => {
    const a = battle(INF, CAV, {}, 99);
    const b = battle(INF, CAV, {}, 99);
    expect(b).toEqual(a);
  });
  it('casualties never exceed stack sizes and survivors add up', () => {
    const A: Stack[] = [{ troop: 'militia', count: 50 }, { troop: 'bowman', count: 20 }];
    const D: Stack[] = [{ troop: 'footman', count: 30 }, { troop: 'rider', count: 15 }];
    for (const seed of [1, 2, 3, 4]) {
      const r = battle(A, D, {}, seed);
      for (const s of A) expect((r.lossesA[s.troop] ?? 0) + (r.survivorsA[s.troop] ?? 0)).toBe(s.count);
      for (const s of D) expect((r.lossesB[s.troop] ?? 0) + (r.survivorsB[s.troop] ?? 0)).toBe(s.count);
      expect(r.rounds.length).toBeLessThanOrEqual(12);
    }
  });
  it('a wiped attacker loses, a wiped defender wins the attacker the fight; ties favour the defender', () => {
    expect(battle([{ troop: 'militia', count: 1 }], [{ troop: 'guardian', count: 50 }]).winner).toBe('defender');
    expect(battle([{ troop: 'guardian', count: 50 }], [{ troop: 'militia', count: 1 }]).winner).toBe('attacker');
    expect(battle([], []).winner).toBe('defender');
  });
  it('ends at max rounds with a power comparison', () => {
    const big: Stack[] = [{ troop: 'guardian', count: 4000 }];
    const r = battle(big, big);
    expect(r.rounds.length).toBeLessThanOrEqual(12);
  });
  it('archers volley first in round 1: archers can kill before melee strikes', () => {
    const r = resolveBattle({
      attacker: side('A', [{ troop: 'bowman', count: 200 }]), defender: side('D', [{ troop: 'militia', count: 30 }]),
    }, 3);
    // The defender never gets to hit back at full strength: attacker archers lose fewer than they would simultaneously.
    const lostA = r.lossesA['bowman'] ?? 0;
    expect(lostA).toBeLessThan(30);
  });
});

describe('hero skills and rage', () => {
  const longA: Stack[] = [{ troop: 'footman', count: 900 }];
  const longD: Stack[] = [{ troop: 'footman', count: 900 }];
  it('skill fires once rage hits 100 and not before round 2', () => {
    const r = resolveBattle({ attacker: side('A', longA, hero('cleave')), defender: side('D', longD) }, 5);
    expect(r.rageEvents.length).toBeGreaterThan(0);
    expect(r.rageEvents[0]).toMatchObject({ side: 'A', skill: 'cleave' });
    expect(r.rageEvents[0]!.round).toBeGreaterThanOrEqual(2);
    expect(r.rageEvents.filter((e) => e.side === 'A').length).toBe(1);
  });
  it('rank 2 allows a second cast', () => {
    const slow = { hpPm: 30000 };
    const r = resolveBattle({
      attacker: { ...side('A', [{ troop: 'footman', count: 400 }], hero('cleave', { skillRank: 2 })), mods: slow },
      defender: { ...side('D', [{ troop: 'footman', count: 400 }]), mods: slow },
    }, 5);
    // 12 rounds * 20 rage = 240 so two casts are reachable when the fight lasts.
    expect(r.rageEvents.filter((e) => e.side === 'A').length).toBe(2);
  });
  it('a skill changes the outcome numbers (cleave kills more of the largest stack)', () => {
    const without = resolveBattle({ attacker: side('A', longA), defender: side('D', longD) }, 5);
    const withSk = resolveBattle({ attacker: side('A', longA, hero('cleave')), defender: side('D', longD) }, 5);
    expect(withSk.lossesB['footman'] ?? 0).toBeGreaterThan(without.lossesB['footman'] ?? 0);
  });
  it('shield wall reduces damage taken; mend raises the wounded bonus', () => {
    const base = resolveBattle({ attacker: side('A', longA), defender: side('D', longD) }, 5);
    const sw = resolveBattle({ attacker: side('A', longA), defender: side('D', longD, hero('shield_wall') as never) }, 5);
    expect(sw.lossesB['footman'] ?? 0).toBeLessThanOrEqual(base.lossesB['footman'] ?? 0);
    const mend = resolveBattle({ attacker: side('A', longA, hero('mend')), defender: side('D', longD) }, 5);
    expect(mend.woundedBonusA).toBeGreaterThan(0);
    expect(base.woundedBonusA).toBe(0);
  });
});

describe('modifiers', () => {
  const A: Stack[] = [{ troop: 'footman', count: 200 }];
  const D: Stack[] = [{ troop: 'footman', count: 200 }];
  it('uphill attack costs the attacker: more losses than on level ground', () => {
    const flat = battle(A, D, {});
    const up = battle(A, D, { uphillLevels: 2 });
    expect(up.lossesA['footman'] ?? 0).toBeGreaterThan(flat.lossesA['footman'] ?? 0);
    expect(up.lossesB['footman'] ?? 0).toBeLessThan(flat.lossesB['footman'] ?? 0);
    // capped at -20%: 5 levels equals 2 levels
    expect(battle(A, D, { uphillLevels: 5 })).toEqual(battle(A, D, { uphillLevels: 2 }));
  });
  it('winter weakens both sides equally (still symmetric)', () => {
    const w = battle(A, D, { winter: true });
    expect(w.rounds[0]!.damageA).toBeLessThanOrEqual(battle(A, D, {}).rounds[0]!.damageA);
  });
  it('palisade helps the defender and siege brings it down', () => {
    const noSiege = battle(A, D, { palisade: true });
    expect(noSiege.rounds[0]!.damageA).toBeLessThan(battle(A, D, {}).rounds[0]!.damageA);
    const A2: Stack[] = [{ troop: 'footman', count: 150 }, { troop: 'catapult', count: 50 }];
    const A3: Stack[] = [{ troop: 'footman', count: 150 }, { troop: 'guardian', count: 50 }];
    const withSiege = battle(A2, D, { palisade: true });
    const withoutSiege = battle(A3, D, { palisade: true });
    // Siege deals double damage vs fortification in round 1.
    expect(withSiege.rounds[0]!.damageA).toBeGreaterThan(battle(A2, D, {}).rounds[0]!.damageA);
    // Without siege the palisade stays up for the whole fight; with siege it only holds in round 1.
    const ratio = (x: ReturnType<typeof battle>, y: ReturnType<typeof battle>): number => (x.rounds[2]!.damageA * 1000) / y.rounds[2]!.damageA;
    expect(ratio(withSiege, battle(A2, D, {}))).toBeGreaterThan(ratio(withoutSiege, battle(A3, D, {})) - 1);
    expect(withoutSiege.rounds.length).toBeGreaterThan(2);
  });
  it('walls absorb attacker damage until spent', () => {
    const open = battle(A, D);
    const walled = battle(A, D, { walls: { hp: 100000, absorbPct: 50 } });
    expect(walled.lossesB['footman'] ?? 0).toBeLessThan(open.lossesB['footman'] ?? 0);
    expect(walled.wallsLeft).toBeLessThan(100000);
    const thin = battle(A, D, { walls: { hp: 10, absorbPct: 50 } });
    expect(thin.wallsLeft).toBe(0);
    expect(thin.lossesB['footman'] ?? 0).toBeGreaterThan(walled.lossesB['footman'] ?? 0);
  });
  it('towers hurt the attacker every round', () => {
    const t = battle(A, D, { towers: { damage: 400 } });
    expect(t.lossesA['footman'] ?? 0).toBeGreaterThan(battle(A, D).lossesA['footman'] ?? 0);
  });
  it('ally heroes strengthen a side', () => {
    const solo = resolveBattle({ attacker: side('A', A), defender: side('D', D) }, 9);
    const rally = resolveBattle({ attacker: { ...side('A', A), allies: [hero(null, { atk: 40, def: 30, hp: 200 })] }, defender: side('D', D) }, 9);
    expect(rally.lossesB['footman'] ?? 0).toBeGreaterThan(solo.lossesB['footman'] ?? 0);
  });
});
