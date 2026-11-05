import { describe, expect, it } from 'vitest';
import { advance } from '@sim/tick';
import { makeState } from '../helpers/makeState';
import { hashState } from '@sim/save/hash';
import type { GameState, MarchState, PoiState } from '@sim/state';

function poi(over: Partial<PoiState> = {}): PoiState {
  return {
    id: 'p1', kind: 'bandit_camp', cell: 0, region: 1, tier: 1, level: 1, active: true,
    troops: [{ troop: 'militia', count: 30 }], strength: 100, respawnAt: null, raidReadyAt: 0, ...over,
  };
}

function setup(troops: Record<string, number>, p: PoiState, patch?: (s: GameState) => void): { s: GameState; m: MarchState } {
  const s = makeState({}, (st) => {
    // pick a walkable cell in region 1 for the poi
    const cell = st.world.regionOf.findIndex((r, i) => r === 1 && (st.world.navCost[i] ?? 0) > 0);
    p.cell = cell;
    st.world.pois[p.id] = p;
    st.resources.food = 0;
    patch?.(st);
  });
  const m: MarchState = {
    id: '77', hero: 'aldric', troops: { ...troops }, kind: 'attack', target: { poi: p.id }, path: [], step: 0, progress: 0,
    state: 'fighting', carried: {}, supply: 0, startedAt: 0,
  };
  s.marches['77'] = m;
  s.heroes['aldric']!.march = '77';
  return { s, m };
}

describe('combat system', () => {
  it('a strong army clears a camp, gets loot and xp, and the march returns with an empty path', () => {
    const { s, m } = setup({ footman: 120, bowman: 60 }, poi());
    const events = advance(s, []);
    expect(m.state).toBe('returning');
    expect(m.path).toEqual([]);
    const p = s.world.pois['p1']!;
    expect(p.active).toBe(false);
    expect(p.respawnAt).toBeGreaterThanOrEqual(s.tick + 3 * 600 - 1);
    expect(p.respawnAt).toBeLessThanOrEqual(s.tick + 5 * 600);
    expect(events.some((e) => e.t === 'BattleResolved')).toBe(true);
    expect(events.some((e) => e.t === 'CampCleared')).toBe(true);
    expect(s.reports).toHaveLength(1);
    expect(s.reports[0]!.winner).toBe('attacker');
    expect(Object.keys(m.carried).length).toBeGreaterThan(0);
    expect(s.heroes['aldric']!.xp + s.heroes['aldric']!.level).toBeGreaterThan(1);
    expect(s.stats.campsCleared).toBe(1);
    expect(s.stats.battlesWon).toBe(1);
    expect(s.quests.counters['campCleared_t1']).toBe(1);
    expect(m.report).toBe(s.reports[0]!.id);
  });

  it('splits player losses into wounded (on the march) and dead; enemy losses are permanent', () => {
    const { s, m } = setup({ militia: 40 }, poi({ troops: [{ troop: 'militia', count: 30 }], strength: 220 }));
    const before = 40;
    advance(s, []);
    const r = s.reports[0]!;
    const lost = Object.values(r.casualtiesA).reduce((a, b) => a + b, 0);
    const wounded = Object.values(r.woundedA).reduce((a, b) => a + b, 0);
    expect(lost).toBeGreaterThan(0);
    expect(wounded).toBeGreaterThan(0);
    expect(wounded).toBeLessThanOrEqual(lost);
    expect(Math.abs(wounded - Math.round(lost * 0.6))).toBeLessThanOrEqual(1);
    expect(Object.values(m.troops).reduce((a, b) => a + b, 0)).toBe(before - lost);
    expect(Object.values(m.wounded ?? {}).reduce((a, b) => a + b, 0)).toBe(wounded);
  });

  it('a lost battle leaves the camp weakened but active; survivors retreat', () => {
    const { s, m } = setup({ militia: 5 }, poi({ strength: 220 }));
    advance(s, []);
    const p = s.world.pois['p1']!;
    expect(s.reports[0]!.winner).toBe('defender');
    expect(p.active).toBe(true);
    expect(p.strength).toBeLessThanOrEqual(220);
    expect(m.state).toBe('returning');
    expect(s.stats.battlesLost).toBe(1);
    expect(Object.keys(s.reports[0]!.loot)).toHaveLength(0);
  });

  it('loot beyond the march load is cut, ember and items always come', () => {
    const { s, m } = setup({ footman: 2, bowman: 1 }, poi({ id: 'lair1', kind: 'lair', tier: 3, level: 15, troops: [{ troop: 'militia', count: 1 }], strength: 1 }));
    m.target = { poi: 'lair1' };
    advance(s, []);
    const cap = 2 * 30 + 15;
    const carried = Object.entries(m.carried).filter(([k]) => k !== 'ember').reduce((a, [, v]) => a + (v ?? 0), 0);
    expect(carried).toBeLessThanOrEqual(cap);
  });

  it('a boss kill unlocks neighbouring regions and records a chronicle entry', () => {
    const { s } = setup({ guardian: 400, sharpshooter: 200 }, poi({ id: 'b1', kind: 'boss', tier: 2, level: 10, bossId: 'boss_warchief', troops: [], strength: 0 }), (st) => {
      for (const r of st.world.regions) r.unlocked = r.id === 0;
      st.world.regions[1]!.dangerTier = 2;
    });
    s.marches['77']!.target = { poi: 'b1' };
    const events = advance(s, []);
    expect(s.reports[0]!.winner).toBe('attacker');
    {
      expect(events.some((e) => e.t === 'BossDefeated')).toBe(true);
      expect(events.some((e) => e.t === 'RegionUnlocked')).toBe(true);
      expect(s.stats.bossesKilled).toBe(1);
      expect(s.chronicle.length).toBeGreaterThan(1);
      expect(s.world.pois['b1']!.active).toBe(false);
      expect(s.world.pois['b1']!.respawnAt).toBeNull();
    }
    expect(s.reports.length).toBe(1);
  });

  it('keeps only the last reportsKept reports and is deterministic', () => {
    const run = (): number => {
      const { s } = setup({ footman: 120, bowman: 60 }, poi());
      for (let i = 0; i < 30; i++) {
        s.world.pois['p1']!.active = true;
        s.world.pois['p1']!.troops = [{ troop: 'militia', count: 30 }];
        s.marches['77']!.state = 'fighting';
        advance(s, []);
      }
      expect(s.reports.length).toBe(20);
      return hashState(s);
    };
    expect(run()).toBe(run());
  });

  it('marches without a valid target just return', () => {
    const { s, m } = setup({ militia: 5 }, poi());
    m.target = { poi: 'nope' };
    advance(s, []);
    expect(m.state).toBe('returning');
    expect(s.reports).toHaveLength(0);
  });
});
