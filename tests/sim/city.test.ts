import { describe, expect, it } from 'vitest';
import { adjacencyBonus } from '@sim/city/adjacency';
import { baseGrid, cellDistance } from '@sim/city/grid';
import { proximityBonus, proximityInfo } from '@sim/city/proximity';
import { computeProduction } from '@sim/city/production';
import { getBuilders, inTerritory, placementError, territoryRadius } from '@sim/city/territory';
import { validateCommand } from '@sim/commands';
import { BALANCE, BUILDING_LIST, buildingCost, buildingTicks } from '@sim/data/registry';
import type { GameState } from '@sim/state';
import { advance } from '@sim/tick';
import { makeState } from '../helpers/makeState';

const rich = (s: GameState): void => { for (const k of ['food', 'wood', 'stone', 'gold'] as const) s.resources[k] = 5000; };

/** n-th free grass cell at hex distance [lo, hi] from the town hall (deterministic scan order). */
function freeCell(s: GameState, lo: number, hi: number, nth = 0): number {
  const th = s.city.buildings[s.city.townHall]!;
  const taken = new Set(Object.values(s.city.buildings).map((b) => b.cell));
  const g = baseGrid(s.city.radius);
  let k = 0;
  for (let c = 0; c < g.count; c++) {
    const d = cellDistance(s.city.radius, th.cell, c);
    if (d < lo || d > hi || s.city.terrain[c] !== 0 || taken.has(c)) continue;
    if (k++ === nth) return c;
  }
  throw new Error('no cell');
}
function put(s: GameState, type: string, level: number, cell: number): string {
  const id = String(s.nextId++);
  s.city.buildings[id] = { id, type, cell, level, damaged: false };
  return id;
}
function run(s: GameState, ticks: number, cmds: Parameters<typeof advance>[1] = []) {
  const ev = advance(s, cmds);
  for (let i = 1; i < ticks; i++) ev.push(...advance(s));
  return ev;
}

describe('building data', () => {
  it('costs and times are monotone in level', () => {
    for (const def of BUILDING_LIST) {
      let prev = buildingCost(def.id, 1);
      let pt = buildingTicks(def.id, 1);
      for (let l = 2; l <= def.maxLevel; l++) {
        const c = buildingCost(def.id, l);
        for (const k of Object.keys(c) as (keyof typeof c)[]) expect(c[k]).toBeGreaterThanOrEqual(prev[k] ?? 0);
        expect(buildingTicks(def.id, l)).toBeGreaterThanOrEqual(pt);
        prev = c;
        pt = buildingTicks(def.id, l);
      }
    }
  });
});

describe('build command', () => {
  it('places a scaffold at level 0, pays the cost and completes with events', () => {
    const s = makeState({}, rich);
    const cell = freeCell(s, 2, 3);
    const wood = s.resources.wood;
    const ev = advance(s, [{ t: 'build', building: 'farm', cell }]);
    expect(s.resources.wood).toBe(wood - 80);
    const inst = Object.values(s.city.buildings).find((b) => b.type === 'farm')!;
    expect(inst.level).toBe(0);
    expect(ev.some((e) => e.t === 'BuildingStarted')).toBe(true);
    const evs = run(s, buildingTicks('farm', 1));
    expect(inst.level).toBe(1);
    expect(evs.some((e) => e.t === 'BuildingCompleted' && e.type === 'farm' && e.cell === cell)).toBe(true);
    expect(s.city.queue).toHaveLength(0);
  });

  it('validates unlock, max count, terrain, occupancy, territory and cost', () => {
    const s = makeState({}, rich);
    const cell = freeCell(s, 2, 3);
    expect(placementError(s, 'quarry', cell)).toBe('locked');
    expect(placementError(s, 'nope', cell)).toBe('unknown_building');
    const th = s.city.buildings[s.city.townHall]!;
    expect(placementError(s, 'farm', th.cell)).toBe('occupied');
    const water = s.city.terrain.findIndex((t, i) => t !== 0 && cellDistance(s.city.radius, th.cell, i) <= 4);
    if (water >= 0) expect(placementError(s, 'farm', water)).toBe('terrain');
    expect(placementError(s, 'farm', -1)).toBe('bad_cell');
    const far = freeCell(s, 8, 16);
    expect(placementError(s, 'farm', far)).toBe('territory');
    put(s, 'farm', 1, freeCell(s, 2, 3, 1));
    put(s, 'farm', 1, freeCell(s, 2, 3, 2));
    expect(placementError(s, 'farm', cell)).toBe('max_count');
    const poor = makeState();
    poor.resources.wood = 10;
    expect(validateCommand(poor, { t: 'build', building: 'farm', cell: freeCell(poor, 2, 3) })).toBe('cost');
  });

  it('territory radius follows the town hall level', () => {
    const s = makeState({}, rich);
    expect(territoryRadius(s)).toBe(4);
    const c5 = freeCell(s, 5, 5);
    expect(inTerritory(s, c5)).toBe(false);
    s.city.buildings[s.city.townHall]!.level = 3;
    expect(territoryRadius(s)).toBe(5);
    expect(inTerritory(s, c5)).toBe(true);
  });

  it('queue length is limited to buildQueueMax (10)', () => {
    const s = makeState({}, rich);
    s.city.buildings[s.city.townHall]!.level = 9;
    expect(BALANCE.buildQueueMax).toBe(10);
    for (let i = 0; i < BALANCE.buildQueueMax - 1; i++) s.city.queue.push({ id: `x${i}`, building: 'none', targetLevel: 2, startTick: null, endTick: null, ticks: 100, cost: {} });
    expect(validateCommand(s, { t: 'build', building: 'house', cell: freeCell(s, 1, 4, 0) })).toBeNull();
    s.city.queue.push({ id: 'x9', building: 'none', targetLevel: 2, startTick: null, endTick: null, ticks: 100, cost: {} });
    expect(validateCommand(s, { t: 'build', building: 'house', cell: freeCell(s, 1, 4, 1) })).toBe('queue_full');
  });
});

describe('builders and queue', () => {
  it('one builder runs jobs strictly FIFO', () => {
    const s = makeState({}, rich);
    const a = freeCell(s, 2, 4, 0);
    const b = freeCell(s, 2, 4, 1);
    advance(s, [{ t: 'build', building: 'house', cell: a }, { t: 'build', building: 'house', cell: b }]);
    const [j1, j2] = s.city.queue;
    expect(j1!.startTick).not.toBeNull();
    expect(j2!.startTick).toBeNull();
    run(s, j1!.ticks);
    expect(s.city.queue).toHaveLength(1);
    expect(s.city.queue[0]!.startTick).not.toBeNull();
    expect(s.city.queue[0]!.endTick).toBe(s.city.queue[0]!.startTick! + buildingTicks('house', 1));
  });

  it('builder huts add parallel builders (completed huts only)', () => {
    const s = makeState({}, rich);
    s.city.buildings[s.city.townHall]!.level = 3;
    expect(getBuilders(s)).toBe(1);
    put(s, 'builders_hut', 0, freeCell(s, 1, 3, 5));
    expect(getBuilders(s)).toBe(1);
    put(s, 'builders_hut', 1, freeCell(s, 1, 3, 6));
    expect(getBuilders(s)).toBe(2);
    advance(s, [{ t: 'build', building: 'house', cell: freeCell(s, 1, 3, 0) }, { t: 'build', building: 'house', cell: freeCell(s, 1, 3, 1) }, { t: 'build', building: 'house', cell: freeCell(s, 1, 3, 2) }]);
    expect(s.city.queue.filter((j) => j.startTick !== null)).toHaveLength(2);
  });
});

describe('upgrade, cancel, demolish, repair', () => {
  it('upgrade is capped by town hall level and keeps producing at the old level', () => {
    const s = makeState({}, rich);
    const farm = put(s, 'farm', 1, freeCell(s, 2, 3));
    expect(validateCommand(s, { t: 'upgrade', building: farm })).toBe('th_level');
    s.city.buildings[s.city.townHall]!.level = 2;
    advance(s, [{ t: 'upgrade', building: farm }]);
    expect(s.city.buildings[farm]!.level).toBe(1);
    expect(validateCommand(s, { t: 'upgrade', building: farm })).toBe('busy');
    const ev = run(s, buildingTicks('farm', 2));
    expect(s.city.buildings[farm]!.level).toBe(2);
    expect(ev.some((e) => e.t === 'BuildingUpgraded' && e.level === 2)).toBe(true);
    // town hall may exceed its own level
    const th = s.city.townHall;
    expect(validateCommand(s, { t: 'upgrade', building: th })).toBeNull();
  });

  it('cancel refunds 100% under 10% progress, 50% after, and removes new buildings', () => {
    const s = makeState({}, rich);
    const cell = freeCell(s, 2, 3);
    advance(s, [{ t: 'build', building: 'farm', cell }]);
    const id = s.city.queue[0]!.building;
    const before = s.resources.wood;
    advance(s, [{ t: 'cancelBuild', building: id }]);
    expect(s.resources.wood).toBe(before + 80);
    expect(s.city.buildings[id]).toBeUndefined();
    advance(s, [{ t: 'build', building: 'farm', cell }]);
    const id2 = s.city.queue[0]!.building;
    const job = s.city.queue[0]!;
    run(s, Math.ceil(job.ticks * 0.5));
    const w = s.resources.wood;
    advance(s, [{ t: 'cancelBuild', building: id2 }]);
    expect(s.resources.wood).toBe(w + 40);
    expect(s.city.queue).toHaveLength(0);
  });

  it('cancelling an upgrade keeps the building and refunds', () => {
    const s = makeState({}, rich);
    s.city.buildings[s.city.townHall]!.level = 2;
    const farm = put(s, 'farm', 1, freeCell(s, 2, 3));
    advance(s, [{ t: 'upgrade', building: farm }]);
    const w = s.resources.wood;
    advance(s, [{ t: 'cancelBuild', building: farm }]);
    expect(s.resources.wood).toBe(w + buildingCost('farm', 2).wood!);
    expect(s.city.buildings[farm]!.level).toBe(1);
  });

  it('demolish refunds 30% of cumulative cost and protects the town hall', () => {
    const s = makeState({}, rich);
    const farm = put(s, 'farm', 2, freeCell(s, 2, 3));
    const w = s.resources.wood;
    advance(s, [{ t: 'demolish', building: farm }]);
    expect(s.city.buildings[farm]).toBeUndefined();
    expect(s.resources.wood).toBe(w + Math.floor((80 + 120) * 0.3));
    expect(validateCommand(s, { t: 'demolish', building: s.city.townHall })).toBe('protected');
  });

  it('repair costs 25% of the current level cost and clears the flag', () => {
    const s = makeState({}, rich);
    const farm = put(s, 'farm', 1, freeCell(s, 2, 3));
    expect(validateCommand(s, { t: 'repair', building: farm })).toBe('not_damaged');
    s.city.buildings[farm]!.damaged = true;
    const w = s.resources.wood;
    advance(s, [{ t: 'repair', building: farm }]);
    expect(s.city.buildings[farm]!.damaged).toBe(false);
    expect(s.resources.wood).toBe(w - 20);
  });
});

describe('adjacency', () => {
  it('farms get +5% per adjacent farm (max 20), lumber +10% per forest cell, quarry per rock or cliff', () => {
    const s = makeState({ options: { clan: 'ironvale' } }, rich);
    const g = baseGrid(s.city.radius);
    const c = freeCell(s, 3, 3);
    const nbs = Array.from({ length: 6 }, (_, k) => g.nb[c * 6 + k]!);
    expect(adjacencyBonus(s, 'farm', c)).toBe(0);
    let placed = 0;
    for (const n of nbs) if (n >= 0 && s.city.terrain[n] === 0 && placed < 5) { put(s, 'farm', 1, n); placed++; }
    expect(adjacencyBonus(s, 'farm', c)).toBe(Math.min(20, placed * 5));
    // terrain based
    s.city.terrain = s.city.terrain.map(() => 0);
    const base = freeCell(s, 3, 3, 4);
    const nb = Array.from({ length: 6 }, (_, k) => g.nb[base * 6 + k]!).filter((x) => x >= 0);
    s.city.terrain[nb[0]!] = 1;
    s.city.terrain[nb[1]!] = 1;
    s.city.terrain[nb[2]!] = 2;
    s.city.terrain[nb[3]!] = 4;
    expect(adjacencyBonus(s, 'lumber_camp', base)).toBe(20);
    expect(adjacencyBonus(s, 'quarry', base)).toBe(20);
    expect(adjacencyBonus(s, 'house', base)).toBe(0);
  });

  it('clan adjacency bonus scales the result (oakwarden lumber)', () => {
    const s = makeState({ options: { clan: 'oakwarden' } });
    s.city.terrain = s.city.terrain.map(() => 0);
    const g = baseGrid(s.city.radius);
    const c = freeCell(s, 3, 3);
    s.city.terrain[g.nb[c * 6]!] = 1;
    expect(adjacencyBonus(s, 'lumber_camp', c)).toBeCloseTo(11, 5);
  });
});

describe('proximity bonus (balance.json proximity)', () => {
  it('counts matching cells at distance 2..radius only, per cell, up to the max', () => {
    const s = makeState({ options: { clan: 'ironvale' } });
    s.city.terrain = s.city.terrain.map(() => 0);
    const g = baseGrid(s.city.radius);
    const c = freeCell(s, 3, 3);
    const rule = BALANCE.proximity['lumber_camp']!;
    expect(proximityBonus(s, 'lumber_camp', c)).toBe(0);
    expect(proximityBonus(s, 'house', c)).toBe(0);
    // ring 1 is adjacency, not proximity
    s.city.terrain[g.nb[c * 6]!] = 1;
    expect(proximityBonus(s, 'lumber_camp', c)).toBe(0);
    // fill every cell within the radius: capped at max
    for (let i = 0; i < g.count; i++) if (cellDistance(s.city.radius, c, i) <= rule.radius) s.city.terrain[i] = 1;
    const info = proximityInfo(s, 'lumber_camp', c)!;
    expect(info.pct).toBe(rule.max);
    expect(info.cells).toBeGreaterThan(rule.max / rule.perCell);
    // one forest cell at distance 3 adds exactly perCell
    s.city.terrain = s.city.terrain.map(() => 0);
    const far = Array.from({ length: g.count }, (_, i) => i).find((i) => cellDistance(s.city.radius, c, i) === rule.radius)!;
    s.city.terrain[far] = 1;
    expect(proximityBonus(s, 'lumber_camp', c)).toBe(rule.perCell);
    // outside the radius does not count
    s.city.terrain[far] = 0;
    const out = Array.from({ length: g.count }, (_, i) => i).find((i) => cellDistance(s.city.radius, c, i) === rule.radius + 1)!;
    s.city.terrain[out] = 1;
    expect(proximityBonus(s, 'lumber_camp', c)).toBe(0);
  });

  it('raises the building production and is reported per building', () => {
    const s = makeState({ options: { clan: 'ironvale' } });
    s.city.terrain = s.city.terrain.map(() => 0);
    const g = baseGrid(s.city.radius);
    const c = freeCell(s, 4, 6);
    const id = put(s, 'quarry', 1, c);
    const before = computeProduction(s);
    for (let i = 0; i < g.count; i++) if (cellDistance(s.city.radius, c, i) === 2) s.city.terrain[i] = 2;
    const after = computeProduction(s);
    const rule = BALANCE.proximity['quarry']!;
    expect(after.byBuilding[id]![0]!.perMinute).toBeGreaterThan(before.byBuilding[id]![0]!.perMinute);
    expect(after.parts.stone.proximity).toBeCloseTo((before.parts.stone.base * rule.max) / 100, 5);
  });
});

describe('build queue (10 jobs, reorderable)', () => {
  it('holds up to buildQueueMax jobs and lets waiting jobs be reordered, never the running ones', () => {
    const s = makeState();
    rich(s);
    s.city.buildings[s.city.townHall]!.level = 6;
    const ids: string[] = [];
    for (let i = 0; ids.length < BALANCE.buildQueueMax; i++) {
      const cell = freeCell(s, 2, 6, i);
      const r = advance(s, [{ t: 'build', building: 'house', cell }]);
      if (r.some((e) => e.t === 'CommandRejected')) { if (i > 40) break; continue; }
      ids.push(Object.keys(s.city.buildings).find((id) => s.city.buildings[id]!.cell === cell)!);
    }
    expect(s.city.queue.length).toBeGreaterThanOrEqual(5);
    expect(s.city.queue.length).toBeLessThanOrEqual(BALANCE.buildQueueMax);
    const running = s.city.queue.filter((j) => j.startTick !== null);
    const waiting = s.city.queue.filter((j) => j.startTick === null);
    expect(waiting.length).toBeGreaterThan(2);
    expect(validateCommand(s, { t: 'reorderBuild', job: running[0]!.id, to: 0 })).toBe('busy');
    expect(validateCommand(s, { t: 'reorderBuild', job: waiting[0]!.id, to: waiting.length })).toBe('bad_amount');
    const last = waiting[waiting.length - 1]!;
    advance(s, [{ t: 'reorderBuild', job: last.id, to: 0 }]);
    const after = s.city.queue.filter((j) => j.startTick === null);
    expect(after[0]!.id).toBe(last.id);
    expect(s.city.queue.slice(0, running.length).every((j) => j.startTick !== null)).toBe(true);
  });
});

describe('moving buildings', () => {
  it('moves a finished building to a free tile for free, but not the Town Hall, busy or occupied/invalid tiles', () => {
    const s = makeState();
    rich(s);
    const from = freeCell(s, 2, 4, 0);
    const id = put(s, 'house', 1, from);
    const to = freeCell(s, 2, 4, 3);
    const other = put(s, 'farm', 1, freeCell(s, 2, 4, 5));
    const res = { ...s.resources };
    expect(validateCommand(s, { t: 'moveBuilding', building: s.city.townHall, cell: to })).toBe('protected');
    expect(validateCommand(s, { t: 'moveBuilding', building: id, cell: s.city.buildings[other]!.cell })).toBe('occupied');
    expect(validateCommand(s, { t: 'moveBuilding', building: id, cell: -1 })).toBe('bad_cell');
    expect(validateCommand(s, { t: 'moveBuilding', building: 'nope', cell: to })).toBe('no_building');
    const ev = advance(s, [{ t: 'moveBuilding', building: id, cell: to }]);
    expect(s.city.buildings[id]!.cell).toBe(to);
    expect(ev.some((e) => e.t === 'BuildingMoved')).toBe(true);
    expect(s.resources.wood).toBeGreaterThanOrEqual(res.wood);
    // a building with a running job cannot move
    s.city.queue.push({ id: 'jx', building: id, targetLevel: 2, startTick: null, endTick: null, ticks: 100, cost: {} });
    expect(validateCommand(s, { t: 'moveBuilding', building: id, cell: from })).toBe('busy');
  });
});
