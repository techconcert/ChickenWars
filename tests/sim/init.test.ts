import { describe, expect, it } from 'vitest';
import { RESOURCE_LIST, TROOP_LIST } from '@sim/data/registry';
import { centreCellIndex, hexCellCount } from '@sim/util';
import { makeTestWorldLogic } from '@sim/worldgen/testLogic';
import { makeState } from '../helpers/makeState';

describe('createInitialState', () => {
  it('places the Town Hall at the base centre, gives start resources and the start hero', () => {
    const s = makeState();
    const th = s.city.buildings[s.city.townHall];
    expect(th).toMatchObject({ type: 'town_hall', level: 1, cell: centreCellIndex(16) });
    expect(s.city.terrain.length).toBe(hexCellCount(16));
    expect(s.city.terrain[th?.cell ?? 0]).toBe(0);
    expect(s.resources).toEqual({ food: 600, wood: 600, stone: 300, gold: 150, ember: 0 });
    expect(Object.keys(s.heroes)).toEqual(['aldric']);
    expect(s.quests.active).toBe('tutorial_build_farm');
    expect(Object.keys(s.troops).length).toBe(TROOP_LIST.length);
    expect(Object.keys(s.accum).length).toBe(RESOURCE_LIST.length);
  });
  it('start type overrides resources; clan adds hero level', () => {
    const s = makeState({ options: { startType: 'frozen_north', clan: 'ironvale' } });
    expect(s.resources.stone).toBe(450);
    expect(s.heroes['aldric']?.level).toBe(2);
  });
  it('test world logic is consistent', () => {
    const w = makeTestWorldLogic(20);
    const n = hexCellCount(20);
    for (const a of [w.regionOf, w.level, w.biome, w.flags, w.navCost]) expect(a.length).toBe(n);
    expect(w.regions.reduce((a, r) => a + r.cells, 0)).toBeGreaterThan(100);
    expect(w.flags[w.capitalCell]! & 1).toBe(1);
  });
});
