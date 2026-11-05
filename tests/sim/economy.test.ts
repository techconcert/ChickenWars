import { describe, expect, it } from 'vitest';
import { baseGrid } from '@sim/city/grid';
import { getCaps } from '@sim/city/caps';
import { getPopulation } from '@sim/city/pop';
import { validateCommand } from '@sim/commands';
import { DAY_TICKS } from '@sim/constants';
import type { GameState } from '@sim/state';
import { advance } from '@sim/tick';
import { getRates, tradeCooldownLeft, tradeLimitFor } from '@sim/systems/economy';
import { makeState } from '../helpers/makeState';

let nextCell = 100; // cells far from the hall, only used to give instances distinct positions
function put(s: GameState, type: string, level: number, cell?: number): string {
  const id = String(s.nextId++);
  s.city.buildings[id] = { id, type, cell: cell ?? nextCell++, level, damaged: false };
  return id;
}
function run(s: GameState, ticks: number) {
  const ev = [];
  for (let i = 0; i < ticks; i++) ev.push(...advance(s));
  return ev;
}
/** Isolated terrain so adjacency does not interfere with rate assertions. */
const flat = (s: GameState): void => { s.city.terrain = s.city.terrain.map(() => 0); };

describe('caps', () => {
  it('base + town hall + storehouses, ember only its base, research capMult', () => {
    const s = makeState();
    let c = getCaps(s);
    expect(c.food).toBe(1000 + 200);
    expect(c.wood).toBe(1000);
    expect(c.ember).toBe(100);
    put(s, 'storehouse', 1);
    put(s, 'storehouse', 0); // under construction: no effect
    c = getCaps(s);
    expect(c.wood).toBe(1500);
    expect(c.food).toBe(1700);
    expect(c.ember).toBe(100);
    s.research.done.push('eco_storage_1');
    expect(getCaps(s).wood).toBe(Math.floor(1500 * 1.15));
  });

  it('production never exceeds the cap and overflow is reported once', () => {
    const s = makeState({ options: { clan: 'ironvale' } }, flat);
    for (let i = 0; i < 2; i++) put(s, 'farm', 10);
    s.resources.food = getCaps(s).food - 1;
    const ev = run(s, 1200);
    expect(s.resources.food).toBe(getCaps(s).food);
    expect(ev.filter((e) => e.t === 'ResourceOverflow')).toHaveLength(1);
  });

  it('stock above the cap (refunds) is not reduced', () => {
    const s = makeState();
    s.resources.wood = 5000;
    run(s, 5);
    expect(s.resources.wood).toBe(5000);
  });
});

describe('production', () => {
  it('a level 1 farm makes 30 food per minute in winter-free ironvale spring (+10%)', () => {
    const s = makeState({ options: { clan: 'ironvale' } }, flat);
    put(s, 'farm', 1);
    run(s, 600);
    expect(s.resources.food).toBe(600 + 33);
  });

  it('applies clan and research multipliers additively with adjacency, then season', () => {
    const s = makeState({ options: { clan: 'riverfolk' } }, flat); // food +15%
    put(s, 'farm', 1);
    s.research.done.push('eco_farming_1'); // +10%
    const r = getRates(s).food;
    expect(r.gross).toBeCloseTo(30 * (1 + 0.15 + 0.1) * 1.1, 1);
    expect(r.parts.base).toBe(30);
    expect(r.parts.research).toBeCloseTo(3, 5);
    expect(r.parts.clan).toBeCloseTo(4.5, 5);
  });

  it('season modifies output and the floor keeps at least 25%', () => {
    const s = makeState({ options: { clan: 'ironvale' } }, flat);
    s.season.index = 3; // winter: food x0.5
    const farm = put(s, 'farm', 1);
    expect(getRates(s).food.gross).toBeCloseTo(15, 1);
    s.city.buildings[farm]!.damaged = true; // x0.5 again = floor exactly
    expect(getRates(s).food.gross).toBeCloseTo(7.5, 1);
    s.buffs.push({ stat: 'prod_food', pct: -50, until: 1e9 });
    const r = getRates(s).food;
    expect(r.gross).toBeCloseTo(7.5, 1); // raw 0.125 floored to 0.25
    expect(r.parts.floor).toBeGreaterThan(0);
  });

  it('adjacency raises output of adjacent farms', () => {
    const s = makeState({ options: { clan: 'ironvale' } }, flat);
    const g = baseGrid(s.city.radius);
    const c = 200;
    put(s, 'farm', 1, c);
    const alone = getRates(s).food.gross;
    put(s, 'farm', 1, g.nb[c * 6]!);
    const pair = getRates(s).food;
    expect(pair.gross).toBeCloseTo(alone * 2 * 1.05, 5);
    expect(pair.parts.adjacency).toBeCloseTo(3, 5);
  });

  it('fixed-point accumulation is deterministic across a minute', () => {
    const s1 = makeState({ options: { clan: 'ironvale' } }, flat);
    const s2 = makeState({ options: { clan: 'ironvale' } }, flat);
    put(s1, 'lumber_camp', 3);
    put(s2, 'lumber_camp', 3);
    run(s1, 1777);
    run(s2, 1777);
    expect(s1.resources).toEqual(s2.resources);
    expect(s1.accum).toEqual(s2.accum);
  });
});

describe('upkeep and starvation', () => {
  it('troops eat food: wounded half, season and clan multipliers', () => {
    const s = makeState({ options: { clan: 'ironvale' } }); // +5% upkeep
    s.troops.militia = { healthy: 80, wounded: 40 };
    const r = getRates(s).food;
    expect(r.upkeep).toBeCloseTo((80 + 20) * 0.5 * 1.05, 5);
    s.season.index = 3;
    expect(getRates(s).food.upkeep).toBeCloseTo((80 + 20) * 0.5 * 1.05 * 1.3, 5);
    s.season.index = 0;
    run(s, 600);
    expect(s.resources.food).toBeGreaterThanOrEqual(547);
    expect(s.resources.food).toBeLessThanOrEqual(548);
  });

  it('marching troops also eat from the stock', () => {
    const s = makeState();
    s.marches['m1'] = { id: 'm1', hero: 'aldric', troops: { militia: 100 }, kind: 'gather', target: {}, path: [], step: 0, progress: 0, state: 'moving', carried: {}, supply: 0, startedAt: 0 };
    expect(getRates(s).food.upkeep).toBeCloseTo(50 * 1.0, 5);
  });

  it('warns at 20% of cap and at zero, then deserts 2% (min 1 per pool) every 600 ticks', () => {
    const s = makeState({ options: { clan: 'ironvale' } });
    s.troops.militia = { healthy: 100, wounded: 0 };
    s.troops.bowman = { healthy: 10, wounded: 0 };
    s.resources.food = 241; // cap 1200: 20% = 240
    const ev = run(s, 60);
    expect(ev.filter((e) => e.t === 'Starvation' && e.level === 'warning')).toHaveLength(1);
    s.resources.food = 2;
    const ev2 = run(s, DAY_TICKS * 2);
    expect(s.resources.food).toBe(0);
    expect(ev2.filter((e) => e.t === 'Starvation' && e.level === 'empty')).toHaveLength(1);
    const des = ev2.filter((e) => e.t === 'Starvation' && e.level === 'desertion');
    expect(des.length).toBeGreaterThanOrEqual(1);
    // 100 -> 98 -> 96 ..., bowman 10 -> 9 -> 8 (min 1)
    expect(s.troops.militia!.healthy).toBeLessThan(100);
    expect(s.troops.bowman!.healthy).toBeLessThan(10);
    expect(s.troops.militia!.healthy).toBeLessThanOrEqual(98);
  });
});

describe('population', () => {
  it('cap from houses and town hall, used by troops, training and workers', () => {
    const s = makeState();
    expect(getPopulation(s)).toMatchObject({ cap: 20, used: 0 });
    put(s, 'house', 1);
    put(s, 'farm', 1);
    put(s, 'farm', 0); // not completed: no workers
    s.troops.militia = { healthy: 3, wounded: 2 };
    s.troops.rider = { healthy: 1, wounded: 0 }; // popCost 1
    s.training.push({ id: 't', building: '1', troop: 'rider', count: 2, startTick: null, endTick: null, cost: {} });
    const p = getPopulation(s);
    expect(p.cap).toBe(20 + 16);
    expect(p.workers).toBe(2);
    expect(p.troops).toBe(5 + 1 + 2);
    expect(p.used).toBe(10);
  });
});

describe('market trade', () => {
  it('needs a built market, trades 3:2 with per-resource cooldown and a level limit', () => {
    const s = makeState();
    s.resources.wood = 900;
    s.resources.food = 900;
    expect(validateCommand(s, { t: 'marketTrade', give: 'wood', get: 'gold', amount: 300 })).toBe('locked');
    s.city.buildings[s.city.townHall]!.level = 5; // Town Hall 5 alone is not enough any more
    expect(validateCommand(s, { t: 'marketTrade', give: 'wood', get: 'gold', amount: 300 })).toBe('locked');
    const id = put(s, 'market', 0); // under construction
    expect(validateCommand(s, { t: 'marketTrade', give: 'wood', get: 'gold', amount: 300 })).toBe('locked');
    s.city.buildings[id]!.level = 1;
    expect(tradeLimitFor(s)).toBe(200);
    expect(validateCommand(s, { t: 'marketTrade', give: 'wood', get: 'gold', amount: 300 })).toBe('over_limit');
    s.city.buildings[id]!.level = 2; // limit 300
    advance(s, [{ t: 'marketTrade', give: 'wood', get: 'gold', amount: 300 }]);
    expect(s.resources.wood).toBeLessThanOrEqual(600 + 5);
    expect(s.resources.gold).toBeGreaterThanOrEqual(150 + 200);
    expect(tradeCooldownLeft(s, 'wood')).toBeGreaterThan(0);
    expect(validateCommand(s, { t: 'marketTrade', give: 'wood', get: 'stone', amount: 30 })).toBe('cooldown');
    expect(validateCommand(s, { t: 'marketTrade', give: 'food', get: 'stone', amount: 30 })).toBeNull();
    expect(validateCommand(s, { t: 'marketTrade', give: 'wood', get: 'ember', amount: 30 })).toBe('bad_trade');
    run(s, 600);
    expect(tradeCooldownLeft(s, 'wood')).toBe(0);
    expect(validateCommand(s, { t: 'marketTrade', give: 'wood', get: 'stone', amount: 30 })).toBeNull();
  });

  it('the market limit rises with level', () => {
    const s = makeState();
    const id = put(s, 'market', 1);
    const a = tradeLimitFor(s);
    s.city.buildings[id]!.level = 10;
    expect(tradeLimitFor(s)).toBeGreaterThan(a);
  });

  it('riverfolk tradeStep improves the ratio to 5:4', () => {
    const s = makeState({ options: { clan: 'riverfolk' } });
    s.city.buildings[s.city.townHall]!.level = 5;
    put(s, 'market', 3);
    s.resources.wood = 900;
    s.resources.gold = 150;
    advance(s, [{ t: 'marketTrade', give: 'wood', get: 'gold', amount: 450 }]);
    expect(s.resources.gold).toBeGreaterThanOrEqual(150 + 360);
    expect(s.resources.gold).toBeLessThan(150 + 450);
  });
});

describe('debug grant', () => {
  it('adds the amount of every resource ignoring caps and marks the game', () => {
    const s = makeState();
    const before = { ...s.resources };
    advance(s, [{ t: 'debugGrant', amount: 1000 }]);
    for (const r of ['food', 'wood', 'stone', 'gold', 'ember'] as const) expect(s.resources[r]).toBeGreaterThanOrEqual(before[r] + 1000);
    expect(s.flags.cheated).toBe(true);
  });
});
