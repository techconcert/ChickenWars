import { describe, expect, it } from 'vitest';
import { BALANCE } from '@sim/data/registry';
import type { TickCtx } from '@sim/ctx';
import { hashState } from '@sim/save/hash';
import { advance } from '@sim/tick';
import type { GameEvent } from '@sim/events';
import type { GameState, RaidState } from '@sim/state';
import { cityDefence, protectedFraction, raidConditions, raidThreshold, resolveRaid, warningTicks } from '@sim/raids';
import { makeState } from '../helpers/makeState';
import { RIPE_TICK, addCamp, ripeState } from './raidsSetup';

function runUntil(s: GameState, pred: (e: GameEvent) => boolean, max = 6000): GameEvent | null {
  for (let i = 0; i < max; i++) {
    for (const e of advance(s, [])) if (pred(e)) return e;
  }
  return null;
}

function raidOf(s: GameState, camp = 'camp1', strengthTroops = 1.0): RaidState {
  const id = `raid_t${Object.keys(s.raids).length}_${s.nextId++}`;
  const c = s.world.pois[camp]!;
  const troops = c.troops.map((t) => ({ troop: t.troop, count: Math.floor(t.count * strengthTroops) }));
  const r: RaidState = { id, camp, path: [c.cell, s.world.capitalCell], arriveAt: s.tick, strength: c.strength, troops, warned: true };
  s.raids[id] = r;
  return r;
}
const ctxOf = (s: GameState, safeMode = false): TickCtx => ({ events: [], safeMode: safeMode || s.flags.safeMode });

describe('raid trigger conditions', () => {
  it('launches only when strength, range, cooldown, grace and weakness all hold', () => {
    const { s, camp } = ripeState();
    expect(raidConditions(s, camp)).toEqual({ ok: true, reason: 'ok' });
    camp.strength = 300;
    expect(raidConditions(s, camp).reason).toBe('threshold');
    camp.strength = 500;
    camp.raidReadyAt = s.tick + 10;
    expect(raidConditions(s, camp).reason).toBe('cooldown');
    camp.raidReadyAt = 0;
    s.tick = 600;
    expect(raidConditions(s, camp).reason).toBe('grace');
    s.tick = RIPE_TICK;
    s.troops.footman!.healthy = 400;
    expect(raidConditions(s, camp).reason).toBe('strong');
  });

  it('no raids until the Town Hall is past level 5', () => {
    const { s, camp } = ripeState();
    s.city.buildings[s.city.townHall]!.level = 5;
    expect(raidConditions(s, camp).reason).toBe('early');
    s.city.buildings[s.city.townHall]!.level = 6;
    expect(raidConditions(s, camp).ok).toBe(true);
  });

  it('out-of-range camps never raid', () => {
    const s = makeState({ worldRadius: 30 });
    for (const id of Object.keys(s.world.pois)) if (s.world.pois[id]!.kind === 'bandit_camp') delete s.world.pois[id];
    s.tick = RIPE_TICK;
    s.city.buildings[s.city.townHall]!.level = 6;
    const camp = addCamp(s, 'far', 2, 500, 19);
    expect(raidConditions(s, camp).reason).toBe('range');
  });

  it('hard difficulty lowers the threshold by 10% and a hostile lord region by 10% more', () => {
    const n = ripeState();
    const h = ripeState({ options: { difficulty: 'hard' } });
    expect(raidThreshold(h.s, h.camp)).toBeCloseTo(raidThreshold(n.s, n.camp) * 0.9, 6);
    const lord = Object.keys(n.s.lords)[0]!;
    n.s.world.regions[n.camp.region]!.lord = lord;
    n.s.lords[lord]!.rep = -50;
    expect(raidThreshold(n.s, n.camp)).toBeCloseTo(360 * 0.9, 6);
  });

  it('a ripe weak town gets raided eventually and a safe-mode town never does', () => {
    const a = ripeState();
    const ev = runUntil(a.s, (e) => e.t === 'RaidLaunched');
    expect(ev).not.toBeNull();
    expect(a.camp.raidReadyAt).toBeGreaterThan(a.s.tick);
    const b = ripeState();
    b.s.flags.safeMode = true;
    expect(runUntil(b.s, (e) => e.t === 'RaidLaunched', 4000)).toBeNull();
    expect(Object.keys(b.s.raids)).toHaveLength(0);
  });
});

describe('warning lead time', () => {
  it('RaidWarning fires warningTicks before arrival (difficulty and research)', () => {
    for (const [difficulty, expected] of [['normal', 1200], ['easy', 1800], ['hard', 900]] as const) {
      const { s } = ripeState({ options: { difficulty } });
      expect(warningTicks(s)).toBe(expected);
      // the warning may fire in the same tick as the launch, so look for it directly
      const warn = runUntil(s, (e) => e.t === 'RaidWarning', 10000) as Extract<GameEvent, { t: 'RaidWarning' }>;
      expect(warn).not.toBeNull();
      expect(warn.arriveAt - warn.tick).toBe(expected);
    }
    const { s } = ripeState();
    s.research.done.push('def_warning_1');
    expect(warningTicks(s)).toBe(1500);
  });

  it('the raid resolves at arriveAt', () => {
    const { s } = ripeState();
    const launched = runUntil(s, (e) => e.t === 'RaidLaunched') as Extract<GameEvent, { t: 'RaidLaunched' }>;
    const res = runUntil(s, (e) => e.t === 'RaidResolved') as Extract<GameEvent, { t: 'RaidResolved' }>;
    expect(res.tick).toBe(launched.arriveAt);
    expect(Object.keys(s.raids)).toHaveLength(0);
  });
});

describe('raid resolution', () => {
  it('is deterministic', () => {
    const run = (): number => {
      const { s } = ripeState();
      runUntil(s, (e) => e.t === 'RaidResolved');
      return hashState(s);
    };
    expect(run()).toBe(run());
  });

  it('a lost raid loots at most 20% of unprotected stock, damages 1-2 buildings and destroys none', () => {
    const { s } = ripeState();
    for (const t of ['house', 'farm', 'quarry']) {
      const id = String(s.nextId++);
      s.city.buildings[id] = { id, type: t, cell: 3 + s.nextId, level: 1, damaged: false };
    }
    s.resources.food = 800; s.resources.wood = 800; s.resources.stone = 800; s.resources.gold = 800;
    const before = { ...s.resources };
    const buildings = Object.keys(s.city.buildings).length;
    const r = raidOf(s);
    const ctx = ctxOf(s);
    resolveRaid(s, ctx, r);
    const ev = ctx.events.find((e) => e.t === 'RaidResolved') as Extract<GameEvent, { t: 'RaidResolved' }>;
    expect(ev.won).toBe(false);
    for (const k of ['food', 'wood', 'stone', 'gold'] as const) {
      expect(s.resources[k]).toBeGreaterThanOrEqual(Math.floor(before[k] * 0.8));
      expect(s.resources[k]).toBeLessThan(before[k]);
    }
    expect(s.resources.ember).toBe(before.ember);
    expect(Object.keys(s.city.buildings)).toHaveLength(buildings);
    const dmg = Object.values(s.city.buildings).filter((b) => b.damaged);
    expect(dmg.length).toBeGreaterThanOrEqual(1);
    expect(dmg.length).toBeLessThanOrEqual(2);
    expect(s.city.buildings[s.city.townHall]!.damaged).toBe(false);
    expect(s.reports[s.reports.length - 1]!.kind).toBe('raid');
    expect(s.stats.battlesLost).toBe(1);
  });

  it('storehouses protect up to 50% of the stock', () => {
    const { s } = ripeState();
    expect(protectedFraction(s)).toBe(0);
    const id = String(s.nextId++);
    s.city.buildings[id] = { id, type: 'storehouse', cell: 5, level: 10, damaged: false };
    expect(protectedFraction(s)).toBe(0.5);
    s.resources.wood = 1000;
    resolveRaid(s, ctxOf(s), raidOf(s));
    expect(s.resources.wood).toBeGreaterThanOrEqual(1000 - Math.floor(500 * 0.2));
  });

  it('a strong garrison with walls and towers beats the raiders; the camp loses strength; wounded are recorded', () => {
    const { s, camp } = ripeState();
    s.troops.footman!.healthy = 300;
    s.troops.bowman!.healthy = 150;
    for (const [i, t] of ['watchtower', 'watchtower', 'wall'].entries()) {
      const id = String(s.nextId++);
      s.city.buildings[id] = { id, type: t, cell: 7 + i, level: 3, damaged: false };
    }
    const ctx = ctxOf(s);
    resolveRaid(s, ctx, raidOf(s));
    const ev = ctx.events.find((e) => e.t === 'RaidResolved') as Extract<GameEvent, { t: 'RaidResolved' }>;
    expect(ev.won).toBe(true);
    expect(camp.strength).toBeLessThan(500);
    expect(camp.strength).toBeGreaterThanOrEqual(300);
    expect(s.stats.battlesWon).toBe(1);
    expect(Object.values(s.city.buildings).some((b) => b.damaged)).toBe(false);
  });

  it('towers, walls, troops and idle heroes raise the defence power; damaged ones count half', () => {
    const { s } = ripeState();
    const base = cityDefence(s).power;
    const id = String(s.nextId++);
    s.city.buildings[id] = { id, type: 'watchtower', cell: 9, level: 5, damaged: false };
    const withTower = cityDefence(s).power;
    expect(withTower).toBeGreaterThan(base);
    s.city.buildings[id]!.damaged = true;
    expect(cityDefence(s).power).toBeLessThan(withTower);
    s.troops.footman!.healthy = 50;
    expect(cityDefence(s).power).toBeGreaterThan(cityDefence({ ...s, troops: { ...s.troops, footman: { healthy: 0, wounded: 0 } } }).power);
  });

  it('three lost raids set the city-in-peril counter without touching raidsLost', () => {
    const { s } = ripeState();
    for (let i = 0; i < 3; i++) resolveRaid(s, ctxOf(s), raidOf(s));
    expect(s.quests.counters.cityInPeril).toBe(1);
    expect(s.quests.counters.raidsLost).toBeUndefined();
  });

  it('a camp cleared while its raiders travel disbands them', () => {
    const { s, camp } = ripeState();
    camp.active = false;
    const ctx = ctxOf(s);
    resolveRaid(s, ctx, raidOf(s));
    expect(ctx.events.some((e) => e.t === 'RaidResolved' && e.won)).toBe(true);
    expect(s.reports).toHaveLength(0);
  });

  it('winter makes camps grow faster (banditGrowth season mod)', () => {
    expect(BALANCE.seasonMods.winter.banditGrowth).toBeGreaterThan(BALANCE.seasonMods.summer.banditGrowth);
  });
});
