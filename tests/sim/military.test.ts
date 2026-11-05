import { describe, expect, it } from 'vitest';
import { getPopulation } from '@sim/city/pop';
import { validateCommand } from '@sim/commands';
import { BALANCE } from '@sim/data/registry';
import { DAY_TICKS } from '@sim/constants';
import type { GameState } from '@sim/state';
import { advance } from '@sim/tick';
import { addWounded, woundedCap, woundedShare } from '@sim/systems/military';
import { makeState } from '../helpers/makeState';

let nextCell = 300;
function put(s: GameState, type: string, level: number): string {
  const id = String(s.nextId++);
  s.city.buildings[id] = { id, type, cell: nextCell++, level, damaged: false };
  return id;
}
function run(s: GameState, ticks: number) {
  const ev = [];
  for (let i = 0; i < ticks; i++) ev.push(...advance(s));
  return ev;
}
/** A state with plenty of resources, pop room and a barracks. */
function army(patch?: (s: GameState) => void): { s: GameState; barracks: string } {
  let barracks = '';
  const s = makeState({}, (st) => {
    for (const k of ['food', 'wood', 'stone', 'gold'] as const) st.resources[k] = 900;
    put(st, 'house', 10);
    barracks = put(st, 'barracks', 1);
    patch?.(st);
  });
  return { s, barracks };
}

describe('training', () => {
  it('validates building, level, tech, batch size, cost and pop cap', () => {
    const { s } = army();
    expect(validateCommand(s, { t: 'train', troop: 'bowman', count: 5 })).toBe('no_building');
    expect(validateCommand(s, { t: 'train', troop: 'footman', count: 5 })).toBe('tech');
    expect(validateCommand(s, { t: 'train', troop: 'militia', count: 0 })).toBe('bad_count');
    expect(validateCommand(s, { t: 'train', troop: 'militia', count: BALANCE.trainBatchMax + 1 })).toBe('bad_count');
    expect(validateCommand(s, { t: 'train', troop: 'militia', count: 5 })).toBeNull();
    s.resources.food = 10;
    expect(validateCommand(s, { t: 'train', troop: 'militia', count: 5 })).toBe('cost');
    s.resources.food = 900;
    s.research.done.push('tier2_infantry');
    expect(validateCommand(s, { t: 'train', troop: 'footman', count: 1 })).toBe('no_building'); // needs barracks level 5
    s.city.buildings[Object.keys(s.city.buildings).find((k) => s.city.buildings[k]!.type === 'barracks')!]!.level = 5;
    expect(validateCommand(s, { t: 'train', troop: 'footman', count: 1 })).toBeNull();
  });

  it('pop cap blocks training', () => {
    const { s } = army();
    for (const k of ['food', 'wood', 'stone', 'gold'] as const) s.resources[k] = 99999;
    s.troops.militia!.healthy += Math.max(0, getPopulation(s).free - 20); // leave 20 free so the check is not hidden by the batch limit
    const pop = getPopulation(s);
    expect(validateCommand(s, { t: 'train', troop: 'militia', count: pop.free + 1 })).toBe('pop_cap');
    expect(validateCommand(s, { t: 'train', troop: 'militia', count: pop.free })).toBeNull();
    advance(s, [{ t: 'train', troop: 'militia', count: pop.free }]);
    expect(getPopulation(s).free).toBe(0);
    expect(validateCommand(s, { t: 'train', troop: 'militia', count: 1 })).toBe('pop_cap');
    s.city.buildings[put(s, 'house', 1)]!.level = 1;
    s.city.buildings[put(s, 'house', 1)]!.level = 1;
  });

  it('batches run sequentially per building and finish with TroopsTrained', () => {
    const { s, barracks } = army();
    advance(s, [{ t: 'train', troop: 'militia', count: 10 }, { t: 'train', troop: 'militia', count: 5 }]);
    expect(s.resources.food).toBe(900 - 15 * 30);
    const [a, b] = s.training;
    expect(a!.building).toBe(barracks);
    expect(a!.endTick! - a!.startTick!).toBe(10 * 60);
    expect(b!.startTick).toBeNull();
    const ev = run(s, 600);
    expect(s.troops.militia!.healthy).toBe(10);
    expect(ev.filter((e) => e.t === 'TroopsTrained')).toHaveLength(1);
    expect(s.training).toHaveLength(1);
    expect(s.training[0]!.startTick).not.toBeNull();
    run(s, 300);
    expect(s.troops.militia!.healthy).toBe(15);
    expect(s.training).toHaveLength(0);
  });

  it('queue per building is limited and a second building spreads the load', () => {
    const { s } = army((st) => { put(st, 'barracks', 1); });
    for (let i = 0; i < 2 * BALANCE.trainQueueMax; i++) advance(s, [{ t: 'train', troop: 'militia', count: 1 }]);
    expect(s.training).toHaveLength(2 * BALANCE.trainQueueMax);
    expect(validateCommand(s, { t: 'train', troop: 'militia', count: 1 })).toBe('queue_full');
    const starts = s.training.filter((j) => j.startTick !== null);
    expect(starts).toHaveLength(2);
  });

  it('building level speeds training and ironvale shortens it', () => {
    const { s, barracks } = army();
    s.city.buildings[barracks]!.level = 10; // x1.5
    advance(s, [{ t: 'train', troop: 'militia', count: 15 }]);
    expect(s.training[0]!.endTick! - s.training[0]!.startTick!).toBe(Math.round((15 * 60) / 1.5));
    const iron = army(); iron.s.options.clan = 'ironvale';
    advance(iron.s, [{ t: 'train', troop: 'militia', count: 10 }]);
    expect(iron.s.training[0]!.endTick! - iron.s.training[0]!.startTick!).toBe(540);
  });

  it('cancel refunds 100% before start and 50% after', () => {
    const { s } = army();
    advance(s, [{ t: 'train', troop: 'militia', count: 10 }, { t: 'train', troop: 'militia', count: 10 }]);
    const [a, b] = s.training;
    const f = s.resources.food;
    advance(s, [{ t: 'cancelTrain', job: b!.id }]);
    expect(s.resources.food).toBe(f + 300);
    advance(s, [{ t: 'cancelTrain', job: a!.id }]);
    expect(s.resources.food).toBe(f + 300 + 150);
    expect(s.training).toHaveLength(0);
    expect(validateCommand(s, { t: 'cancelTrain', job: 'zz' })).toBe('no_job');
  });

  it('demolishing a training building is refused', () => {
    const { s, barracks } = army();
    advance(s, [{ t: 'train', troop: 'militia', count: 1 }]);
    expect(validateCommand(s, { t: 'demolish', building: barracks })).toBe('training');
  });
});

describe('wounded and infirmary', () => {
  it('woundedShare is 0.6 base, rises with the infirmary and research, max 0.85', () => {
    const s = makeState();
    expect(woundedShare(s)).toBeCloseTo(0.6, 5);
    put(s, 'infirmary', 10);
    expect(woundedShare(s)).toBeCloseTo(0.75, 5);
    s.research.done.push('mil_heal_1');
    expect(woundedShare(s)).toBeCloseTo(0.8, 5);
    s.research.done.length = 0;
    for (let i = 0; i < 20; i++) s.research.done.push('mil_heal_1');
    expect(woundedShare(s)).toBe(0.85);
  });

  it('addWounded adds to the wounded pool', () => {
    const s = makeState();
    addWounded(s, 'militia', 7);
    addWounded(s, 'militia', 0);
    expect(s.troops.militia).toEqual({ healthy: 0, wounded: 7 });
  });

  it('heals highest tier first at the infirmary rate', () => {
    const s = makeState();
    put(s, 'infirmary', 1); // 10 per minute
    s.troops.militia = { healthy: 0, wounded: 20 };
    s.troops.footman = { healthy: 0, wounded: 5 };
    run(s, 600);
    expect(s.troops.footman).toEqual({ healthy: 5, wounded: 0 });
    expect(s.troops.militia!.healthy).toBe(5);
    expect(s.troops.militia!.wounded).toBe(15);
  });

  it('wounded beyond capacity die at day end (lowest tier first) with a warning event', () => {
    const s = makeState();
    put(s, 'infirmary', 1); // cap 50
    s.troops.militia = { healthy: 0, wounded: 60 };
    s.troops.footman = { healthy: 0, wounded: 10 };
    expect(woundedCap(s)).toBe(50);
    const ev = run(s, DAY_TICKS + 1);
    const died = ev.find((e) => e.t === 'WoundedDied');
    expect(died).toBeDefined();
    expect(s.troops.footman!.wounded + s.troops.footman!.healthy).toBe(10);
    const total = s.troops.militia!.wounded + s.troops.militia!.healthy + s.troops.footman!.wounded + s.troops.footman!.healthy;
    expect(total).toBe(70 - (died as { count: number }).count);
  });
});
