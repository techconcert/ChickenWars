import { describe, expect, it } from 'vitest';
import { validateAll } from '../../tools/validate-data';
import { BALANCE, BUILDING_LIST, BUILDINGS, HEROES, ITEMS, QUESTS, TALENTS, TROOPS, buildingCost, buildingTicks, effectAt, effectsAt, maxCountAt, xpForLevel } from '@sim/data/registry';
import { BalanceSchema, parseData } from '@sim/data/schema';

describe('data', () => {
  it('validate-data passes', () => expect(validateAll()).toEqual([]));

  it('registries load and are frozen', () => {
    expect(BUILDINGS['town_hall']?.maxLevel).toBe(25);
    expect(TROOPS['militia']?.class).toBe('infantry');
    expect(HEROES['aldric']?.recruit.kind).toBe('start');
    expect(ITEMS['common_sword']).toBeDefined();
    expect(QUESTS['tutorial_camp']?.rewards.item).toBe('common_sword');
    expect(TALENTS['w_rank2']?.tree).toBe('warrior');
    expect(Object.isFrozen(BUILDINGS)).toBe(true);
    expect(Object.isFrozen(BUILDING_LIST[0])).toBe(true);
    expect(Object.isFrozen(BALANCE.combat)).toBe(true);
  });

  it('bad data fails loudly with file and path', () => {
    const bad = { ...BALANCE, territoryMaxRadius: 'x' };
    expect(() => parseData('balance.json', BalanceSchema, bad)).toThrow(/balance\.json: territoryMaxRadius/);
  });

  it('building cost and time are monotone by level and match helper formulas', () => {
    for (const b of BUILDING_LIST) {
      for (let l = 2; l <= b.maxLevel; l++) {
        const a = buildingCost(b.id, l - 1);
        const c = buildingCost(b.id, l);
        for (const k of Object.keys(c) as (keyof typeof c)[]) expect(c[k] ?? 0).toBeGreaterThanOrEqual(a[k] ?? 0);
        expect(buildingTicks(b.id, l)).toBeGreaterThanOrEqual(buildingTicks(b.id, l - 1));
      }
    }
    expect(buildingCost('house', 1)).toEqual({ wood: 60 });
    expect(buildingCost('house', 2)).toEqual({ wood: 90 });
    expect(buildingTicks('house', 2)).toBe(240);
  });

  it('effectAt resolves per-level values', () => {
    expect(effectAt('farm', 'produce', 1)?.perMinute).toBe(30);
    expect(effectAt('farm', 'produce', 3)?.perMinute).toBe(76);
    expect(effectAt('farm', 'produce', 0)).toBeUndefined();
    expect(effectsAt('town_hall', 'cap', 1)[0]?.amount).toBe(200);
    expect(maxCountAt('farm', 1)).toBe(2);
    expect(maxCountAt('town_hall', 5)).toBe(1);
  });

  it('xp curve', () => {
    expect(xpForLevel(1)).toBe(100);
    expect(xpForLevel(2)).toBe(118);
    expect(xpForLevel(5)).toBeGreaterThan(xpForLevel(4));
  });
});
