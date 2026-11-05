import { describe, expect, it } from 'vitest';
import { campLevel } from '@sim/combat/power';
import { WORLD } from '@sim/data/registry';
import { advance } from '@sim/tick';
import type { GameState, PoiState } from '@sim/state';
import { makeState } from '../helpers/makeState';

function camp(s: GameState, id: string, tier: number, over: Partial<PoiState> = {}): PoiState {
  const cell = s.world.regionOf.findIndex((r, i) => r === 2 && (s.world.navCost[i] ?? 0) > 0 && (s.world.flags[i]! & 4) !== 0);
  const d = WORLD.banditCamps.find((c) => c.tier === tier)!;
  const p: PoiState = {
    id, kind: 'bandit_camp', cell, region: 2, tier, level: campLevel(tier, d.baseStrength), active: true,
    troops: d.troops.map((t) => ({ ...t })), strength: d.baseStrength, respawnAt: null, raidReadyAt: 0, ...over,
  };
  s.world.pois[id] = p;
  return p;
}
const runDays = (s: GameState, days: number): void => { for (let i = 0; i < days * 600 + 1; i++) advance(s, []); };

describe('bandit camps', () => {
  it('camp level follows the contract formula', () => {
    const d = WORLD.banditCamps.find((c) => c.tier === 2)!;
    expect(campLevel(2, d.baseStrength)).toBe(6);
    expect(campLevel(2, d.tierCap)).toBe(10);
    expect(campLevel(1, 100)).toBe(1);
    expect(campLevel(5, 9500)).toBe(25);
  });

  it('strength grows daily, level syncs, and growth caps at tierCap', () => {
    const s = makeState();
    const p = camp(s, 'c1', 1);
    runDays(s, 1);
    expect(p.strength).toBeGreaterThan(100);
    expect(p.strength).toBeLessThanOrEqual(100 + 6 * 1.5 + 0.001);
    runDays(s, 60);
    expect(p.strength).toBe(220);
    expect(p.level).toBe(campLevel(1, 220));
    expect(p.level).toBe(5);
    runDays(s, 5);
    expect(p.strength).toBe(220);
  });

  it('hard difficulty grows faster than easy', () => {
    const easy = makeState({ options: { difficulty: 'easy' } });
    const hard = makeState({ options: { difficulty: 'hard' } });
    const a = camp(easy, 'c1', 2);
    const b = camp(hard, 'c1', 2);
    runDays(easy, 3);
    runDays(hard, 3);
    expect(b.strength).toBeGreaterThan(a.strength);
  });

  it('inactive camps do not grow', () => {
    const s = makeState();
    const p = camp(s, 'c1', 1, { active: false, respawnAt: 600 * 100 });
    p.strength = 100;
    runDays(s, 3);
    expect(p.strength).toBe(100);
    expect(p.active).toBe(false);
  });

  it('cleared camps respawn at base strength on a nearby free cell', () => {
    const s = makeState();
    const p = camp(s, 'c1', 2, { active: false, respawnAt: 1200 });
    const old = p.cell;
    p.strength = 300;
    for (let i = 0; i < 1199; i++) advance(s, []);
    expect(p.active).toBe(false);
    advance(s, []);
    advance(s, []);
    expect(p.active).toBe(true);
    expect(p.respawnAt).toBeNull();
    expect(p.strength).toBeGreaterThanOrEqual(300);
    expect(p.strength).toBeLessThan(300 + 14 * 1.6);
    expect(p.troops.length).toBeGreaterThan(0);
    expect(s.world.regionOf[p.cell]).toBe(2);
    expect(p.cell).not.toBe(s.world.capitalCell);
    expect(typeof old).toBe('number');
  });

  it('lairs and bosses never grow or respawn', () => {
    const s = makeState();
    const p = camp(s, 'l1', 3, { kind: 'lair', strength: 500, level: 15, respawnAt: null });
    runDays(s, 5);
    expect(p.strength).toBe(500);
    expect(p.level).toBe(15);
  });
});
