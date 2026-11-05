import { describe, expect, it } from 'vitest';
import { ambushChance, ambushStacks, safeAttackFavourable } from '@sim/raids';
import { advance } from '@sim/tick';
import type { GameState, MarchState, PoiState } from '@sim/state';
import { makeState } from '../helpers/makeState';
import { richState } from './richState';
import { addCamp } from './raidsSetup';

function gatherSetup(seed: number, troops: Record<string, number>, safe = false): { s: GameState; m: MarchState } {
  const s = makeState({ seed }, (st) => {
    st.world.regions[1]!.dangerTier = 5;
  });
  s.flags.safeMode = safe;
  const cell = s.world.regionOf.findIndex((r, i) => r === 1 && (s.world.navCost[i] ?? 0) > 0);
  s.world.nodes.n1 = { id: 'n1', type: 'forest', resource: 'wood', cell, region: 1, tier: 5, amount: 500, maxAmount: 500, respawnAt: null, gatherer: '88', blockedUntil: 0 };
  const m: MarchState = {
    id: '88', hero: 'aldric', troops: { ...troops }, kind: 'gather', target: { node: 'n1' }, path: [s.world.capitalCell, cell], step: 1, progress: 0,
    state: 'gathering', carried: {}, supply: 0, startedAt: 0, gatherEndsAt: 9999,
  };
  s.marches['88'] = m;
  s.heroes.aldric!.march = '88';
  return { s, m };
}

describe('ambush', () => {
  it('chance is 0 in tier-1 and cleared regions, positive and capped elsewhere', () => {
    const s = makeState();
    expect(ambushChance(s, 0)).toBe(0);
    expect(ambushChance(s, 1)).toBeGreaterThan(0);
    s.world.regions[1]!.dangerTier = 5;
    expect(ambushChance(s, 1)).toBeLessThanOrEqual(0.6);
    s.quests.counters.regionCleared_1 = 1;
    expect(ambushChance(s, 1)).toBe(0);
    expect(ambushStacks(s, 2).length).toBeGreaterThan(0);
  });

  it('clearing a camp marks the region guarded', () => {
    const s = makeState();
    const c = addCamp(s, 'cc', 2, 300, 8);
    c.region = 1;
    c.active = false;
    advance(s, []);
    expect(s.quests.counters.regionCleared_1).toBe(1);
  });

  it('ambushes happen, are deterministic, and a beaten march turns home; strong marches keep gathering', () => {
    let weakHome = 0;
    let strongStay = 0;
    let ambushes = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const a = gatherSetup(seed, { militia: 3 });
      const evs = advance(a.s, []);
      const hit = evs.find((e) => e.t === 'AmbushResolved');
      if (!hit) { expect(a.m.ambushChecked).toBe(true); continue; }
      ambushes++;
      expect(a.s.reports[a.s.reports.length - 1]!.kind).toBe('ambush');
      if (hit.t === 'AmbushResolved' && !hit.won) { expect(a.m.state).toBe('returning'); expect(a.s.world.nodes.n1!.gatherer).toBeNull(); weakHome++; }
      const again = gatherSetup(seed, { militia: 3 });
      advance(again.s, []);
      expect(again.m).toEqual(a.m);
      const b = gatherSetup(seed, { footman: 300, bowman: 200 });
      const evs2 = advance(b.s, []);
      const h2 = evs2.find((e) => e.t === 'AmbushResolved');
      expect(h2).toBeDefined();
      if (h2 && h2.t === 'AmbushResolved' && h2.won) { expect(b.m.state).toBe('gathering'); strongStay++; }
    }
    expect(ambushes).toBeGreaterThan(3);
    expect(weakHome).toBeGreaterThan(0);
    expect(strongStay).toBeGreaterThan(0);
  });

  it('no ambushes in safe mode', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const a = gatherSetup(seed, { militia: 3 }, true);
      expect(advance(a.s, []).some((e) => e.t === 'AmbushResolved')).toBe(false);
    }
  });
});

describe('safe-mode attack gate', () => {
  function fight(troops: Record<string, number>, safe: boolean): { s: GameState; m: MarchState; evs: ReturnType<typeof advance> } {
    const p: PoiState = {
      id: 'p1', kind: 'bandit_camp', cell: 0, region: 1, tier: 1, level: 1, active: true,
      troops: [{ troop: 'militia', count: 30 }], strength: 100, respawnAt: null, raidReadyAt: 0,
    };
    const s = makeState({}, (st) => { p.cell = st.world.regionOf.findIndex((r, i) => r === 1 && (st.world.navCost[i] ?? 0) > 0); st.world.pois.p1 = p; });
    s.flags.safeMode = safe;
    const m: MarchState = {
      id: '77', hero: 'aldric', troops, kind: 'attack', target: { poi: 'p1' }, path: [], step: 0, progress: 0, state: 'fighting', carried: {}, supply: 0, startedAt: 0,
    };
    s.marches['77'] = m;
    s.heroes.aldric!.march = '77';
    return { s, m, evs: advance(s, []) };
  }

  it('favourable attacks resolve, marginal ones turn back unfought', () => {
    const strong = fight({ footman: 120, bowman: 60 }, true);
    expect(strong.s.reports).toHaveLength(1);
    const weak = fight({ militia: 30 }, true);
    expect(weak.s.reports).toHaveLength(0);
    expect(weak.m.state).toBe('returning');
    expect(weak.evs.some((e) => e.t === 'AttackAborted')).toBe(true);
    expect(weak.s.world.pois.p1!.active).toBe(true);
    const normal = fight({ militia: 30 }, false);
    expect(normal.s.reports).toHaveLength(1);
  });

  it('ratio helper uses 1.2x', () => {
    const m = { troops: { militia: 12 } } as unknown as MarchState;
    expect(safeAttackFavourable(m, [{ troop: 'militia', count: 10 }])).toBe(true);
    expect(safeAttackFavourable(m, [{ troop: 'militia', count: 11 }])).toBe(false);
  });
});

describe('regions and bosses', () => {
  it('killing a tier-2 boss unlocks neighbouring regions; marches into locked regions are refused before and accepted after', () => {
    const s = richState(7);
    const home = s.world.regions.find((r) => r.unlocked)!;
    const neighbour = s.world.regions[home.neighbours[0]!]!;
    neighbour.unlocked = false;
    neighbour.dangerTier = 3;
    const cellIn = (reg: number): number => s.world.regionOf.findIndex((r, i) => r === reg && (s.world.navCost[i] ?? 0) > 0 && (s.world.flags[i]! & 4) !== 0 && (s.world.flags[i]! & 16) === 0);
    const target = cellIn(neighbour.id);
    s.world.nodes.nlock = { id: 'nlock', type: 'forest', resource: 'wood', cell: target, region: neighbour.id, tier: 2, amount: 100, maxAmount: 100, respawnAt: null, gatherer: null, blockedUntil: 0 };
    s.troops.militia!.healthy = 20;
    const cmd = { t: 'march' as const, hero: 'aldric', troops: { militia: 10 }, target: { node: 'nlock' }, kind: 'gather' as const };
    const evs = advance(s, [cmd]);
    expect(evs.find((e) => e.t === 'CommandRejected')).toMatchObject({ code: 'locked' });
    const boss: PoiState = {
      id: 'boss1', kind: 'boss', cell: cellIn(home.id), region: home.id, tier: 2, level: 10, active: true, bossId: 'boss_warchief',
      troops: [{ troop: 'militia', count: 1 }], strength: 0, respawnAt: null, raidReadyAt: 0,
    };
    s.world.pois.boss1 = boss;
    s.marches['90'] = { id: '90', hero: 'aldric', troops: { footman: 100, bowman: 60 }, kind: 'attack', target: { poi: 'boss1' }, path: [], step: 0, progress: 0, state: 'fighting', carried: {}, supply: 0, startedAt: 0 };
    s.heroes.aldric!.march = '90';
    const evs2 = advance(s, []);
    expect(evs2.some((e) => e.t === 'BossDefeated')).toBe(true);
    expect(evs2.some((e) => e.t === 'RegionUnlocked')).toBe(true);
    for (const n of home.neighbours) if (s.world.regions[n]!.dangerTier <= 3) expect(s.world.regions[n]!.unlocked).toBe(true);
    expect(s.stats.bossesKilled).toBe(1);
    // After the march returns the hero is free and the previously locked region accepts marches.
    for (let i = 0; i < 3000 && s.heroes.aldric!.march; i++) advance(s, []);
    expect(s.heroes.aldric!.march).toBeNull();
    const evs3 = advance(s, [cmd]);
    expect(evs3.some((e) => e.t === 'CommandRejected')).toBe(false);
  });
});
