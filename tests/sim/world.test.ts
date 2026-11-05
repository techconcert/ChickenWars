import { describe, expect, it } from 'vitest';
import { DAY_TICKS } from '@sim/constants';
import { BALANCE, WORLD } from '@sim/data/registry';
import { cellDistance, gridFor, reachableFrom } from '@sim/nav';
import { hashState } from '@sim/save/hash';
import type { GameState } from '@sim/state';
import { advance } from '@sim/tick';
import { pickEvent } from '@sim/systems/world';
import { spawnCampNear } from '@sim/worldgen/spawn';
import { richState } from './richState';

const post = (s: GameState, id: string): void => { s.pendingEvent = { id, expiresAt: s.tick + 5000 }; };
const choose = (s: GameState, option: number): string | undefined => {
  const ev = advance(s, [{ t: 'eventChoice', option }]);
  return (ev.find((e) => e.t === 'CommandRejected') as { code: string } | undefined)?.code;
};

describe('fog of war', () => {
  it('has three states; explored persists after a march moves away; counter tracks new cells', () => {
    const s = richState();
    const g = gridFor(s.world.radius);
    const vis0 = s.world.fog.filter((f) => f === 2).length;
    expect(vis0).toBeGreaterThan(100);
    expect(s.world.fog.filter((f) => f === 1).length).toBe(0);
    s.city.buildings[s.city.townHall]!.level = 3;
    s.troops.rider!.healthy = 20;
    const node = Object.values(s.world.nodes).filter((n) => cellDistance(g, s.world.capitalCell, n.cell) > 10 && s.world.regions[n.region]!.unlocked)[0]!;
    advance(s, [{ t: 'march', hero: 'aldric', troops: { rider: 20 }, kind: 'scout', target: { cell: node.cell } }]);
    for (let i = 0; i < 3000; i++) advance(s);
    const explored = s.world.fog.filter((f) => f > 0).length;
    expect(explored).toBeGreaterThan(vis0);
    expect(s.world.fog[node.cell]).toBe(1);
    expect(s.quests.counters.cellsExplored).toBe(explored);
    expect(s.world.fog.filter((f) => f === 2).length).toBeLessThanOrEqual(vis0 + 1);
  });

  it('scout radius 7 (cavalry) exceeds march radius 4', () => {
    const a = richState();
    const b = richState();
    const g = gridFor(a.world.radius);
    for (const s of [a, b]) { s.city.buildings[s.city.townHall]!.level = 3; s.troops.rider!.healthy = 10; s.troops.militia!.healthy = 10; }
    const far = Object.values(a.world.nodes).filter((n) => cellDistance(g, a.world.capitalCell, n.cell) > 14 && a.world.regions[n.region]!.unlocked)[0]!;
    advance(a, [{ t: 'march', hero: 'aldric', troops: { rider: 10 }, kind: 'scout', target: { cell: far.cell } }]);
    advance(b, [{ t: 'march', hero: 'aldric', troops: { militia: 10 }, kind: 'scout', target: { cell: far.cell } }]);
    for (let i = 0; i < 500; i++) { advance(a); advance(b); }
    expect(a.world.fog.filter((f) => f === 2).length).toBeGreaterThan(b.world.fog.filter((f) => f === 2).length);
  });
});

describe('world events', () => {
  it('posts a seeded event every eventIntervalDays (10), deterministically', () => {
    const run = (): { id: string | undefined; hash: number } => {
      const s = richState(11);
      for (let i = 0; i < BALANCE.eventIntervalDays * DAY_TICKS + 2; i++) advance(s);
      return { id: s.pendingEvent?.id, hash: hashState(s.pendingEvent) };
    };
    const a = run();
    expect(a.id).toBeDefined();
    expect(run()).toEqual(a);
    const s = richState(11);
    for (let i = 0; i < 5 * DAY_TICKS + 2; i++) advance(s);
    expect(s.pendingEvent).toBeNull();
  });

  it('season filter: seasonal events (harvest, plague and generated ones) only show in their season', () => {
    const s = richState();
    const names = ['spring', 'summer', 'autumn', 'winter'] as const;
    for (const idx of [0, 1, 2, 3] as const) {
      s.season.index = idx;
      for (let d = 1; d < 200; d++) {
        const ev = pickEvent(s, d)!;
        expect(ev.season === undefined || ev.season === names[idx]).toBe(true);
      }
    }
  });

  it('merchant trade pays gold and gives wood+stone; rejects when poor', () => {
    const s = richState();
    s.resources.gold = 50;
    post(s, 'merchant');
    expect(choose(s, 0)).toBe('cost');
    s.resources.gold = 300;
    const w = s.resources.wood;
    expect(choose(s, 0)).toBeUndefined();
    expect(s.resources.gold).toBeLessThanOrEqual(200);
    expect(s.resources.wood).toBeGreaterThanOrEqual(w + 300 - 10);
    expect(s.pendingEvent).toBeNull();
    expect(choose(s, 0)).toBe('no_event');
  });

  it('wolves: patrol spawns a tier-1 camp; waiting blocks a forest node', () => {
    const a = richState();
    const camps = Object.values(a.world.pois).filter((p) => p.kind === 'bandit_camp').length;
    post(a, 'wolves');
    choose(a, 0);
    const now = Object.values(a.world.pois).filter((p) => p.kind === 'bandit_camp');
    expect(now.length).toBe(camps + 1);
    const fresh = now[now.length - 1]!;
    expect(fresh.tier).toBe(1);
    expect(reachableFrom(a.world, a.world.capitalCell)[fresh.cell]).toBe(1);
    const b = richState();
    post(b, 'wolves');
    choose(b, 1);
    const blocked = Object.values(b.world.nodes).filter((n) => n.blockedUntil > b.tick);
    expect(blocked.length).toBe(1);
    expect(blocked[0]!.type).toBe('forest');
  });

  it('harvest buff and plague costs', () => {
    const s = richState();
    s.season.index = 2;
    post(s, 'harvest');
    choose(s, 0);
    expect(s.buffs).toMatchObject([{ stat: 'gatherMult', pct: 25 }]);
    s.season.index = 3;
    s.resources.gold = 50;
    post(s, 'plague');
    expect(choose(s, 0)).toBe('cost');
    expect(choose(s, 1)).toBeUndefined();
    expect(s.buffs.some((b) => b.stat === 'healMult' && b.pct === -50)).toBe(true);
    expect(WORLD.events.length).toBe(5);
    expect(choose(s, 5)).toBe('no_event');
  });

  it('caravan: guaranteed escort pays out, the risky option is a seeded roll with both outcomes', () => {
    const s = richState();
    s.resources.gold = 30;
    post(s, 'caravan');
    expect(choose(s, 0)).toBe('cost'); // escort costs 60 gold + 100 food
    s.resources.gold = 300;
    s.resources.food = 500;
    const g = s.resources.gold;
    expect(choose(s, 0)).toBeUndefined();
    expect(s.resources.gold).toBeGreaterThan(g - 60 + 200);
    expect(s.pendingEvent).toBeNull();

    // gamble: deterministic per (seed, tick); across ticks both outcomes occur, and a run repeats exactly
    const outcome = (tick: number): 'win' | 'lose' => {
      const a = richState();
      a.tick = tick;
      a.resources.gold = 200;
      post(a, 'caravan');
      choose(a, 1);
      return a.chronicle[a.chronicle.length - 2]!.text.includes('paid off') ? 'win' : 'lose';
    };
    const seen = new Set<string>();
    for (let tk = 1000; tk < 1040; tk++) { const o = outcome(tk); expect(outcome(tk)).toBe(o); seen.add(o); }
    expect(seen.size).toBe(2);
    const w = richState();
    w.resources.gold = 200;
    post(w, 'caravan');
    expect(choose(w, 2)).toBeUndefined(); // let them pass
    expect(w.resources.gold).toBeGreaterThanOrEqual(200);
  });

  it('spawnCampNear picks a valid spaced cell near the target', () => {
    const s = richState();
    const g = gridFor(s.world.radius);
    const target = s.world.regions[1]!.centroidCell;
    const p = spawnCampNear(s, target, 1)!;
    expect(p).not.toBeNull();
    expect(cellDistance(g, p.cell, target)).toBeLessThanOrEqual(14);
    for (const o of Object.values(s.world.pois)) if (o.id !== p.id) expect(cellDistance(g, o.cell, p.cell)).toBeGreaterThanOrEqual(3);
  });
});

describe('regions open with the Town Hall', () => {
  it('opens a neighbouring region once the Town Hall reaches its unlockCityLevel, and not before', async () => {
    const { makeState } = await import('../helpers/makeState');
    const { advance } = await import('@sim/tick');
    const { WORLD } = await import('@sim/data/registry');
    const s = makeState();
    const target = s.world.regions.find((r) => !r.unlocked && r.dangerTier === 3 && r.neighbours.some((n) => s.world.regions[n]!.unlocked));
    if (!target) return; // map without a tier-3 region next to an open one
    const need = WORLD.regionTiers.find((t) => t.tier === 3)!.unlockCityLevel;
    s.city.buildings[s.city.townHall]!.level = need - 1;
    s.tick = 10;
    advance(s);
    expect(s.world.regions[target.id]!.unlocked).toBe(false);
    s.city.buildings[s.city.townHall]!.level = need;
    s.tick = 20;
    const ev = advance(s);
    expect(s.world.regions[target.id]!.unlocked).toBe(true);
    expect(ev.some((e) => e.t === 'RegionUnlocked' && e.region === target.id)).toBe(true);
  });
});
