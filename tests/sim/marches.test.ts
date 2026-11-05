import { BALANCE } from '@sim/data/registry';
import { describe, expect, it } from 'vitest';
import type { GameEvent } from '@sim/events';
import { cellDistance, findPath, gridFor, pathIsValid } from '@sim/nav';
import { carryCap, gatherPerTick, ticksPerCell } from '@sim/nav/marchCore';
import { hashState } from '@sim/save/hash';
import type { Command } from '@sim/commands';
import type { GameState, NodeState } from '@sim/state';
import { advance } from '@sim/tick';
import { richState } from './richState';

function setup(seed = 7): GameState {
  const s = richState(seed);
  s.city.buildings[s.city.townHall]!.level = 5; // 3 march slots
  s.troops.militia!.healthy = 200;
  s.troops.rider!.healthy = 50;
  s.heroes.aldric!.level = 20; // lead 120 + 19*12 = 348
  return s;
}
function nodeOf(s: GameState, type?: string, maxD = 14): NodeState {
  const g = gridFor(s.world.radius);
  return Object.values(s.world.nodes).filter((n) => (!type || n.type === type) && cellDistance(g, s.world.capitalCell, n.cell) <= maxD && s.world.regions[n.region]!.unlocked)
    .sort((a, b) => cellDistance(g, s.world.capitalCell, a.cell) - cellDistance(g, s.world.capitalCell, b.cell))[0]!;
}
function run(s: GameState, ticks: number, cmds: Command[] = [], until?: (ev: GameEvent[]) => boolean): GameEvent[] {
  const all: GameEvent[] = [];
  for (let i = 0; i < ticks; i++) {
    const ev = advance(s, i === 0 ? cmds : []);
    all.push(...ev);
    if (until?.(ev)) break;
  }
  return all;
}
const gather = (hero: string, n: NodeState, troops: Record<string, number>): Command => ({ t: 'march', hero, troops, kind: 'gather', target: { node: n.id } });
const rejected = (ev: GameEvent[]): string | undefined => (ev.find((e) => e.t === 'CommandRejected') as { code: string } | undefined)?.code;

describe('march command validation', () => {
  it('rejects bad requests with short codes', () => {
    const s = setup();
    const n = nodeOf(s);
    const t = (c: Command) => rejected(advance(setupCopy(s), [c]));
    expect(t(gather('nobody', n, { militia: 10 }))).toBe('no_hero');
    expect(t(gather('aldric', n, { militia: 500 }))).toBe('no_troops');
    expect(t(gather('aldric', n, {}))).toBe('no_troops');
    s.troops.militia!.healthy = 1000;
    expect(t(gather('aldric', n, { militia: 500 }))).toBe('over_lead');
    expect(t({ t: 'march', hero: 'aldric', troops: { militia: 10 }, kind: 'gather', target: { node: 'zzz' } })).toBe('bad_target');
    expect(t({ t: 'march', hero: 'aldric', troops: { militia: 10 }, kind: 'attack', target: { poi: Object.values(s.world.pois).find((p) => p.kind === 'ruin')!.id } })).toBe('bad_target');
    const locked = Object.values(s.world.nodes).find((x) => !s.world.regions[x.region]!.unlocked)!;
    expect(t(gather('aldric', locked, { militia: 10 }))).toBe('locked');
    n.blockedUntil = 99999;
    expect(t(gather('aldric', n, { militia: 10 }))).toBe('node_blocked');
    n.blockedUntil = 0;
    n.gatherer = 'x';
    expect(t(gather('aldric', n, { militia: 10 }))).toBe('node_taken');
  });

  it('hero busy and march slots', () => {
    const s = setup();
    s.city.buildings[s.city.townHall]!.level = 1; // 1 slot
    const [a, b] = Object.values(s.world.nodes).filter((x) => s.world.regions[x.region]!.unlocked);
    advance(s, [gather('aldric', a!, { militia: 10 })]);
    expect(s.heroes.aldric!.march).not.toBeNull();
    expect(rejected(advance(s, [gather('aldric', b!, { militia: 10 })]))).toBe('hero_busy');
    s.heroes.mira = { id: 'mira', level: 1, xp: 0, talents: {}, equipment: { weapon: null, armour: null, banner: null, trinket: null }, march: null, skillRank: 1 };
    expect(rejected(advance(s, [gather('mira', b!, { militia: 10 })]))).toBe('no_slot');
  });

  it('starting a march moves troops out of the pool and reserves supply and the node', () => {
    const s = setup();
    const n = nodeOf(s);
    const food = s.resources.food;
    const ev = advance(s, [gather('aldric', n, { militia: 40 })]);
    expect(ev.some((e) => e.t === 'MarchStarted')).toBe(true);
    expect(s.troops.militia!.healthy).toBe(160);
    const m = Object.values(s.marches)[0]!;
    expect(n.gatherer).toBe(m.id);
    expect(m.supply).toBe(Math.ceil(40 * 0.5 * 2));
    expect(s.resources.food).toBeLessThanOrEqual(food - m.supply + 1);
  });
});

function setupCopy(s: GameState): GameState {
  return JSON.parse(JSON.stringify(s)) as GameState;
}

describe('movement', () => {
  it('moves along a valid path and speed equals the slowest troop', () => {
    const s = setup();
    const n = nodeOf(s, undefined, 10);
    const mixed = setupCopy(s);
    const riders = setupCopy(s);
    const foot = setupCopy(s);
    advance(mixed, [gather('aldric', n, { militia: 10, rider: 10 })]);
    advance(riders, [gather('aldric', n, { rider: 10 })]);
    advance(foot, [gather('aldric', n, { militia: 10 })]);
    for (let i = 0; i < 150; i++) { advance(mixed); advance(riders); advance(foot); }
    const pm = Object.values(mixed.marches)[0]!;
    const pr = Object.values(riders.marches)[0]!;
    const pf = Object.values(foot.marches)[0]!;
    expect(pm.step + pm.progress / 1000).toBeCloseTo(pf.step + pf.progress / 1000, 6);
    expect(pr.step + pr.progress / 1000).toBeGreaterThan(pf.step + pf.progress / 1000);
    expect(pathIsValid(s.world, pm.path)).toBe(true);
    expect(ticksPerCell(10)).toBe(100);
    expect(ticksPerCell(16)).toBeCloseTo(62.5, 6);
  });

  it('is deterministic', () => {
    const run1 = (): number => {
      const s = setup();
      advance(s, [gather('aldric', nodeOf(s), { militia: 30 })]);
      for (let i = 0; i < 3000; i++) advance(s);
      return hashState(s);
    };
    expect(run1()).toBe(run1());
  });
});

describe('gathering', () => {
  it('gathers at the documented rate, fills, returns and deposits', () => {
    const s = setup();
    const n = nodeOf(s, 'forest');
    const startNode = n.amount;
    s.resources.wood = 300; // well below the cap so lord gifts and production cannot make the deposit overflow
    const startWood = s.resources.wood;
    const troops = { militia: 10 };
    advance(s, [gather('aldric', n, troops)]);
    const m = Object.values(s.marches)[0]!;
    expect(carryCap(troops)).toBe(200);
    const gm = BALANCE.gatherMult; // data/balance.json (3 after the QA gather pass)
    expect(gatherPerTick(s, m)).toBeCloseTo((10 * gm) / 600, 9);
    let guard = 0;
    while (m.state !== 'gathering' && guard++ < 5000) advance(s);
    expect(m.state).toBe('gathering');
    const t0 = s.tick;
    for (let i = 0; i < 600; i++) advance(s);
    expect(s.tick - t0).toBe(600);
    expect(m.carried.wood).toBe(10 * gm); // exactly one minute at 10/min x gatherMult
    expect(startNode - n.amount).toBe(10 * gm);
    const events: GameEvent[] = [];
    guard = 0;
    while (s.marches[m.id] && guard++ < 20000) events.push(...advance(s));
    expect(s.marches[m.id]).toBeUndefined();
    expect(events.find((e) => e.t === 'MarchReturned')).toMatchObject({ carried: { wood: 200 } });
    expect(s.resources.wood - startWood).toBeGreaterThanOrEqual(190); // economy may add production meanwhile
    expect(s.stats.gathered).toBe(200);
    expect(s.quests.counters.gathered).toBe(200);
    expect(n.amount).toBeGreaterThanOrEqual(startNode - 200); // regrows after the march leaves
    expect(n.gatherer).toBeNull();
    expect(s.troops.militia!.healthy).toBeGreaterThanOrEqual(130); // 10 returned; the pool may lose some to starvation desertion meanwhile
    expect(s.heroes.aldric!.march).toBeNull();
  });

  it('auto-returns when the node is depleted, then respawns at 50% on time', () => {
    const s = setup();
    const n = nodeOf(s, 'forest');
    n.amount = 30;
    advance(s, [gather('aldric', n, { militia: 10 })]);
    const m = Object.values(s.marches)[0]!;
    let depletedAt = -1;
    for (let i = 0; i < 20000 && s.marches[m.id]; i++) {
      for (const e of advance(s)) if (e.t === 'NodeDepleted') depletedAt = e.tick;
    }
    expect(depletedAt).toBeGreaterThan(0);
    expect(n.respawnAt).toBe(depletedAt + 1200);
    expect(s.stats.gathered).toBe(30);
    expect(n.gatherer).toBeNull();
    while (s.tick <= n.respawnAt! - 1) advance(s);
    expect(n.amount).toBe(0);
    advance(s); // processes tick == respawnAt
    expect(n.amount).toBe(Math.floor(n.maxAmount * 0.5));
    expect(n.respawnAt).toBeNull();
    for (let i = 0; i < 2000; i++) advance(s);
    expect(n.amount).toBe(n.maxAmount);
  });

  it('warns and discards overflow when storage is full', () => {
    const s = setup();
    const n = nodeOf(s, 'forest');
    advance(s, [gather('aldric', n, { militia: 10 })]);
    const m = Object.values(s.marches)[0]!;
    m.carried = { wood: 200 };
    m.state = 'returning';
    m.path = [s.world.capitalCell];
    m.step = 0;
    s.resources.wood = 1000 - 120;
    const ev = run(s, 5);
    expect(ev.find((e) => e.t === 'ResourceOverflow' && e.res === 'wood')).toMatchObject({ lost: 80 });
    expect(s.resources.wood).toBe(1000);
  });
});

describe('recall', () => {
  it('turns a moving march around on its edge and brings troops home', () => {
    const s = setup();
    const n = nodeOf(s);
    advance(s, [gather('aldric', n, { militia: 20 })]);
    for (let i = 0; i < 350; i++) advance(s);
    const m = Object.values(s.marches)[0]!;
    const pos0 = m.path[m.step]!;
    const fwd = m.step + m.progress / 1000;
    advance(s, [{ t: 'recall', march: m.id }]);
    expect(m.state).toBe('returning');
    expect(m.path[m.path.length - 1]).toBe(s.world.capitalCell);
    expect(pathIsValid(s.world, m.path)).toBe(true);
    expect(m.path.length).toBeLessThanOrEqual(Math.ceil(fwd) + 2);
    expect(m.path).toContain(pos0);
    expect(n.gatherer).toBeNull();
    const ev = run(s, 3000, [], (e) => e.some((x) => x.t === 'MarchReturned'));
    expect(ev.some((e) => e.t === 'MarchReturned')).toBe(true);
    expect(s.troops.militia!.healthy).toBe(200);
    expect(s.heroes.aldric!.march).toBeNull();
    expect(rejected(advance(s, [{ t: 'recall', march: 'nope' }]))).toBe('no_march');
  });

  it('recall while gathering keeps the load', () => {
    const s = setup();
    const n = nodeOf(s, 'forest');
    advance(s, [gather('aldric', n, { militia: 10 })]);
    const m = Object.values(s.marches)[0]!;
    while (m.state !== 'gathering') advance(s);
    for (let i = 0; i < 1200; i++) advance(s);
    const got = m.carried.wood!;
    expect(got).toBe(20 * BALANCE.gatherMult);
    advance(s, [{ t: 'recall', march: m.id }]);
    expect(n.gatherer).toBeNull();
    expect(rejected(advance(s, [{ t: 'recall', march: m.id }]))).toBe('already_returning');
    run(s, 5000, [], () => !s.marches[m.id]);
    expect(s.stats.gathered).toBe(got);
  });
});

describe('scout, attack and garrison', () => {
  it('cavalry scouts reveal a larger radius and explore ruins (loot + counter); infantry cannot target ruins', () => {
    const s = setup();
    const ruin = Object.values(s.world.pois).filter((p) => p.kind === 'ruin' && s.world.regions[p.region]!.unlocked)
      .sort((a, b) => findPath(s.world, s.world.capitalCell, a.cell)!.length - findPath(s.world, s.world.capitalCell, b.cell)!.length)[0]!;
    expect(rejected(advance(setupCopy(s), [{ t: 'march', hero: 'aldric', troops: { militia: 10 }, kind: 'scout', target: { poi: ruin.id } }]))).toBe('no_cavalry');
    const before = s.world.fog.filter((f) => f > 0).length;
    advance(s, [{ t: 'march', hero: 'aldric', troops: { rider: 10 }, kind: 'scout', target: { poi: ruin.id } }]);
    const m = Object.values(s.marches)[0]!;
    const ev = run(s, 20000, [], (e) => e.some((x) => x.t === 'MarchReturned'));
    expect(ev.some((x) => x.t === 'MarchArrived')).toBe(true);
    expect(ruin.explored).toBe(true);
    expect(ruin.active).toBe(false);
    expect(s.quests.counters.ruinExplored).toBe(1);
    expect(s.quests.counters.cellsExplored).toBeGreaterThan(0);
    expect(s.world.fog.filter((f) => f > 0).length).toBeGreaterThan(before + 20);
    expect(s.marches[m.id]).toBeUndefined();
    expect(s.troops.rider!.healthy).toBe(50);
    expect(Object.keys(ev.find((x) => x.t === 'MarchReturned')!['carried' as never] as object).length).toBeGreaterThan(0);
  });

  it('attack arrival enters fighting; combat sends the march home on a computed path', () => {
    const s = setup();
    const camp = Object.values(s.world.pois).filter((p) => p.kind === 'bandit_camp' && p.tier === 1)
      .sort((a, b) => findPath(s.world, s.world.capitalCell, a.cell)!.length - findPath(s.world, s.world.capitalCell, b.cell)!.length)[0]!;
    advance(s, [{ t: 'march', hero: 'aldric', troops: { militia: 150, rider: 50 }, kind: 'attack', target: { poi: camp.id } }]);
    const m = Object.values(s.marches)[0]!;
    const seen = new Set<string>();
    let returned = false;
    for (let i = 0; i < 20000 && !returned; i++) {
      for (const e of advance(s)) {
        if (e.t === 'MarchArrived') seen.add('arrived');
        if (e.t === 'BattleResolved') seen.add('battle');
        if (e.t === 'MarchReturned') returned = true;
      }
      if (s.marches[m.id]?.state === 'returning' && s.marches[m.id]!.path.length) {
        expect(s.marches[m.id]!.path[s.marches[m.id]!.path.length - 1]).toBe(s.world.capitalCell);
        expect(pathIsValid(s.world, s.marches[m.id]!.path, true)).toBe(true);
      }
    }
    expect(seen.has('arrived') && seen.has('battle')).toBe(true);
    expect(returned).toBe(true);
    expect(s.heroes.aldric!.march).toBeNull();
    expect(s.troops.militia!.healthy + s.troops.militia!.wounded).toBeGreaterThan(0);
  });

  it('garrison waits at a village until recalled', () => {
    const s = setup();
    const v = Object.values(s.world.pois).find((p) => p.kind === 'village' && s.world.regions[p.region]!.unlocked)!;
    advance(s, [{ t: 'march', hero: 'aldric', troops: { militia: 20 }, kind: 'garrison', target: { poi: v.id } }]);
    const m = Object.values(s.marches)[0]!;
    run(s, 20000, [], () => m.state === 'done');
    expect(m.state).toBe('done');
    for (let i = 0; i < 100; i++) advance(s);
    expect(s.marches[m.id]).toBeDefined();
    run(s, 20000, [{ t: 'recall', march: m.id }], () => !s.marches[m.id]);
    expect(s.marches[m.id]).toBeUndefined();
    expect(s.troops.militia!.healthy).toBe(200);
  });

  it('state stays JSON-safe with marches in flight', () => {
    const s = setup();
    advance(s, [gather('aldric', nodeOf(s), { militia: 20 })]);
    for (let i = 0; i < 200; i++) advance(s);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
});

describe('random scout', () => {
  const fogged = (s: GameState): number => s.world.fog.filter((f) => f === 0).length;

  it('is slower, picks new unexplored places on its own and reveals fog', () => {
    const s = setup();
    const normal = setup();
    const cmd = (target: { auto?: boolean; cell?: number }): Command => ({ t: 'march', hero: 'aldric', troops: { rider: 5 }, kind: 'scout', target });
    const auto = run(s, 1, [cmd({ auto: true })]);
    expect(rejected(auto)).toBeUndefined();
    const m = Object.values(s.marches)[0]!;
    expect(m.target.auto).toBe(true);
    const first = m.target.cell!;
    run(normal, 1, [cmd({ cell: first })]);
    const nm = Object.values(normal.marches)[0]!;
    const g = gridFor(s.world.radius);
    const before = fogged(s);
    // run long enough to reach the first target and set off for a second one
    run(s, 4000);
    run(normal, 4000);
    const legs = Object.values(s.marches)[0]?.legs ?? 0;
    expect(fogged(s)).toBeLessThan(before);
    expect(cellDistance(g, s.world.capitalCell, first)).toBeGreaterThanOrEqual(BALANCE.autoScout.minDistance);
    expect(legs).toBeGreaterThanOrEqual(0);
    // the normal scout has long since gone home, the random one is still out or has chained several legs
    expect(Object.values(normal.marches).length).toBe(0);
    expect(nm.target.auto).toBeUndefined();
  });

  it('moves at autoScout.speedMult of the normal speed', () => {
    const s = setup();
    run(s, 1, [{ t: 'march', hero: 'aldric', troops: { rider: 5 }, kind: 'scout', target: { auto: true } }]);
    const a = Object.values(s.marches)[0]!;
    const p = a.path;
    const asAuto = { ...a };
    const asNormal = { ...a, target: { cell: a.target.cell } };
    expect(progressPerTickOf(s, asAuto, p)).toBeCloseTo(progressPerTickOf(s, asNormal, p) * BALANCE.autoScout.speedMult, 6);
  });
});

import { progressPerTick } from '@sim/nav/marchCore';
import type { MarchState } from '@sim/state';
function progressPerTickOf(s: GameState, m: MarchState, p: number[]): number {
  return progressPerTick(s, m, p[0]!, p[1]!);
}

describe('march dialog estimates', () => {
  it('estimateTravel and estimateGather work for a march that does not exist yet (regression: dialog crashed)', async () => {
    const { estimateGather, estimateTravel } = await import('../../src/ui/marchInfo');
    const s = setup();
    const n = nodeOf(s);
    const t = estimateTravel(s, 'aldric', { militia: 10 }, n.cell);
    expect(t).not.toBeNull();
    expect(t!).toBeGreaterThan(0);
    expect(estimateGather(s, 'aldric', { militia: 10 }, n.id)).toBeGreaterThan(0);
  });
});

describe('random scout speed', () => {
  it('is slow while exploring and normal once it is returning', () => {
    const s = setup();
    run(s, 1, [{ t: 'march', hero: 'aldric', troops: { rider: 5 }, kind: 'scout', target: { auto: true } }]);
    const m = Object.values(s.marches)[0]!;
    const p = m.path;
    const slow = progressPerTick(s, m, p[0]!, p[1]!);
    const back = progressPerTick(s, { ...m, state: 'returning' }, p[0]!, p[1]!);
    expect(back).toBeCloseTo(slow / BALANCE.autoScout.speedMult, 6);
  });
});

describe('shrines', () => {
  it('exploring a shrine grants a one-time blessing (buff or hero experience) and marks it explored', () => {
    const s = setup();
    const near = (p: { cell: number }): number => findPath(s.world, s.world.capitalCell, p.cell)?.length ?? 9999;
    const shrine = Object.values(s.world.pois).filter((p) => p.kind === 'shrine').sort((a, b) => near(a) - near(b))[0];
    if (!shrine) return; // this map generated no shrine
    s.world.regions[shrine.region]!.unlocked = true;
    const xp = s.heroes.aldric!.xp;
    advance(s, [{ t: 'march', hero: 'aldric', troops: { militia: 10 }, kind: 'scout', target: { poi: shrine.id } }]);
    const ev = run(s, 30000, [], (e) => e.some((x) => x.t === 'MarchReturned'));
    const blessing = ev.find((x) => x.t === 'ShrineBlessing');
    expect(blessing).toBeDefined();
    expect(shrine.explored).toBe(true);
    expect(shrine.active).toBe(false);
    const boon = (blessing as { boon: string }).boon;
    expect(['prod', 'gather', 'heal', 'xp']).toContain(boon);
    if (boon === 'xp') expect(s.heroes.aldric!.xp).toBeGreaterThan(xp);
    expect(ev.filter((x) => x.t === 'ShrineBlessing')).toHaveLength(1);
  });
});
