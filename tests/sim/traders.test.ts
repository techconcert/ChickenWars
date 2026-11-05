import { describe, expect, it } from 'vitest';
import { validateCommand } from '@sim/commands';
import { BALANCE } from '@sim/data/registry';
import type { GameState } from '@sim/state';
import { advance } from '@sim/tick';
import { activeTraders, bestPartner, planTrade, traderCap } from '@sim/systems/traders';
import { makeState } from '../helpers/makeState';

function withPost(traders: number, level = 1): GameState {
  const s = makeState();
  const id = String(s.nextId++);
  s.city.buildings[id] = { id, type: 'trading_post', cell: 40, level, damaged: false };
  s.troops.trader = { healthy: traders, wounded: 0 };
  for (const r of ['food', 'wood', 'stone', 'gold'] as const) s.resources[r] = 0;
  return s;
}
const total = (s: GameState): number => s.resources.food + s.resources.wood + s.resources.stone + s.resources.gold;
const runCycle = (s: GameState): void => { s.tick = Math.ceil(s.tick / BALANCE.traders.intervalTicks) * BALANCE.traders.intervalTicks; advance(s); };

describe('traders', () => {
  it('trade a lopsided stock towards an even mix, keeping a commission, using a non-hostile lord', () => {
    const s = withPost(3);
    s.resources.food = 1000;
    expect(bestPartner(s, 'food')).not.toBeNull();
    const before = total(s);
    runCycle(s);
    expect(s.resources.food).toBeLessThan(1000);
    expect(s.resources.wood + s.resources.stone + s.resources.gold).toBeGreaterThan(0);
    expect(total(s)).toBeLessThanOrEqual(before + 3); // production in the tick aside, never more than the commission-free amount
    expect(s.city.trade!.last?.lord).toBeTruthy();
    // one trip moves at most traders x load
    expect(1000 - s.resources.food).toBeLessThanOrEqual(3 * BALANCE.traders.loadPerTrader + 5);
  });

  it('follows the chosen weights, stops when switched off or without traders or partners', () => {
    const s = withPost(10);
    s.resources.food = 600; s.resources.wood = 600;
    advance(s, [{ t: 'setTrade', on: true, weights: { food: 0, wood: 0, stone: 0, gold: 100 } }]);
    const plan = planTrade(s)!;
    expect(plan.get.gold).toBeGreaterThan(0);
    expect(plan.get.food).toBeUndefined();
    advance(s, [{ t: 'setTrade', on: false, weights: { food: 25, wood: 25, stone: 25, gold: 25 } }]);
    expect(planTrade(s)).toBeNull();
    advance(s, [{ t: 'setTrade', on: true, weights: { food: 25, wood: 25, stone: 25, gold: 25 } }]);
    s.troops.trader!.healthy = 0;
    expect(planTrade(s)).toBeNull();
    s.troops.trader!.healthy = 4;
    for (const l of Object.values(s.lords)) l.rep = -80;
    expect(planTrade(s)).toBeNull();
  });

  it('is limited by the post capacity and validates the command', () => {
    const s = withPost(50);
    expect(activeTraders(s)).toBe(traderCap(s));
    expect(validateCommand(s, { t: 'setTrade', on: true, weights: { food: 0, wood: 0, stone: 0, gold: 0 } })).toBe('bad_amount');
    expect(validateCommand(s, { t: 'setTrade', on: true, weights: { food: 50, wood: 50, stone: 0, gold: 0 } })).toBeNull();
    const none = makeState();
    expect(validateCommand(none, { t: 'setTrade', on: true, weights: { food: 25, wood: 25, stone: 25, gold: 25 } })).toBe('locked');
  });

  it('never march or defend', () => {
    const s = withPost(5);
    const hero = Object.keys(s.heroes)[0]!;
    expect(validateCommand(s, { t: 'march', hero, troops: { trader: 3 }, target: { cell: s.world.capitalCell }, kind: 'scout' })).toBe('bad_troops');
  });
});
