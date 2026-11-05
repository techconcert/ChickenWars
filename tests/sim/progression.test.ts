import { describe, expect, it } from 'vitest';
import { validateCommand } from '@sim/commands';
import { DAY_TICKS } from '@sim/constants';
import { clanBonus, computeScore, dailySeed, emptyProfile, finalBossTier, recordRun, reignProgress } from '@sim/progression';
import type { GameState } from '@sim/state';
import { advance } from '@sim/tick';
import { makeState } from '../helpers/makeState';

function addBoss(s: GameState, tier: number): void {
  s.world.pois[`boss${tier}`] = { id: `boss${tier}`, kind: 'boss', cell: 0, region: 1, tier, level: tier * 5, active: true, troops: [], strength: 0, respawnAt: null, raidReadyAt: 0 };
}

describe('win: Reign', () => {
  it('needs the final-tier boss AND Town Hall 25; triggers once; reign quest completes', () => {
    const s = makeState();
    addBoss(s, 2); addBoss(s, 3);
    expect(finalBossTier(s)).toBe(3);
    s.quests.active = 'reign'; s.quests.stepProgress = [0];
    s.city.buildings[s.city.townHall]!.level = 25;
    advance(s); // hall ready, no boss yet
    expect(s.flags.won).toBe(false);
    expect(reignProgress(s)).toMatchObject({ bossTier: 3, bossDefeated: false, thLevel: 25, met: false });
    s.quests.counters.bossKilled_t2 = 1; // not the final tier
    advance(s);
    expect(s.flags.won).toBe(false);
    s.quests.counters.bossKilled_t3 = 1;
    const ev = advance(s);
    expect(s.flags.won).toBe(true);
    expect(ev.filter((e) => e.t === 'Won').length).toBe(1);
    expect(s.quests.completed).toContain('reign');
    expect(s.chronicle.some((c) => c.text.includes('You rule the roost'))).toBe(true);
    const more = [...advance(s), ...advance(s)];
    expect(more.some((e) => e.t === 'Won')).toBe(false);
    expect(s.chronicle.filter((c) => c.text.includes('You rule the roost')).length).toBe(1);
  });

  it('a lower Town Hall blocks the win even with the boss down', () => {
    const s = makeState();
    addBoss(s, 6);
    s.quests.counters.bossKilled_t6 = 1;
    s.city.buildings[s.city.townHall]!.level = 24;
    advance(s);
    expect(s.flags.won).toBe(false);
  });

  it('BossDefeated events feed the win check; continueSandbox only after winning, once', () => {
    const s = makeState();
    addBoss(s, 6);
    s.city.buildings[s.city.townHall]!.level = 25;
    expect(validateCommand(s, { t: 'continueSandbox' })).toBe('not_won');
    s.log.length = 0;
    const ctx = { events: [{ t: 'BossDefeated' as const, tick: 0, poi: 'boss6', boss: 'boss_crownking' }], safeMode: false };
    // run through the system directly with the event in the context
    return import('@sim/systems/quests').then(({ tickQuests }) => {
      tickQuests(s, ctx);
      expect(s.flags.won).toBe(true);
      expect(validateCommand(s, { t: 'continueSandbox' })).toBeNull();
      advance(s, [{ t: 'continueSandbox' }]);
      expect(s.flags.sandbox).toBe(true);
      expect(validateCommand(s, { t: 'continueSandbox' })).toBe('already');
    });
  });
});

describe('score, daily seed, profile', () => {
  it('score is deterministic, grows with progress and scales with difficulty', () => {
    const a = makeState();
    const b = makeState();
    expect(computeScore(a)).toBe(computeScore(b));
    const base = computeScore(a);
    a.stats.bossesKilled = 2; a.stats.campsCleared = 10;
    expect(computeScore(a)).toBeGreaterThan(base);
    const hard = makeState({ options: { difficulty: 'hard' } });
    const easy = makeState({ options: { difficulty: 'easy' } });
    expect(computeScore(hard)).toBeGreaterThan(computeScore(easy));
    a.flags.won = true;
    const early = computeScore(a);
    a.tick = 100 * DAY_TICKS;
    expect(computeScore(a)).toBeLessThan(early);
  });
  it('dailySeed is pure and date-sensitive', () => {
    expect(dailySeed(2026, 10, 18)).toBe(dailySeed(2026, 10, 18));
    expect(dailySeed(2026, 10, 18)).not.toBe(dailySeed(2026, 10, 19));
    expect(dailySeed(2026, 1, 12)).not.toBe(dailySeed(2026, 11, 2));
  });
  it('profile: only won runs unlock cosmetics; hard win unlocks a banner; idempotent', () => {
    const s = makeState({ options: { difficulty: 'hard' } });
    const p0 = emptyProfile();
    expect(recordRun(p0, s)).toBe(p0);
    s.flags.won = true;
    const p1 = recordRun(p0, s);
    expect(p1.unlockedBanners).toEqual(['banner_ember_gold']);
    const p2 = recordRun(p1, s);
    expect(p2.unlockedBanners).toEqual(['banner_ember_gold']);
    expect(p2.runsWon).toBe(2);
    const n = makeState();
    n.flags.won = true;
    expect(recordRun(p0, n).unlockedBanners).toEqual([]);
  });
});

describe('clanBonus', () => {
  it('reads the chosen clan effects with optional filters', () => {
    const oak = makeState({ options: { clan: 'oakwarden' } });
    expect(clanBonus(oak, 'prodMult', { res: 'wood' })).toBe(15);
    expect(clanBonus(oak, 'prodMult', { res: 'stone' })).toBe(0);
    expect(clanBonus(oak, 'adjacency', { building: 'lumber_camp' })).toBe(10);
    expect(clanBonus(oak, 'classDef', { class: 'infantry' })).toBe(5);
    const stone = makeState({ options: { clan: 'stonekin' } });
    expect(clanBonus(stone, 'buildingHp', { category: 'defence' })).toBe(20);
    expect(clanBonus(stone, 'costMult', { troopClass: 'siege' })).toBe(-10);
    const river = makeState({ options: { clan: 'riverfolk' } });
    expect(clanBonus(river, 'marchSpeed')).toBe(10);
    expect(clanBonus(river, 'tradeStep')).toBe(1);
    const iron = makeState({ options: { clan: 'ironvale' } });
    expect(clanBonus(iron, 'trainTime')).toBe(-10);
    expect(clanBonus(iron, 'heroStartLevel')).toBe(1);
    expect(clanBonus(iron, 'upkeepMult')).toBe(5);
  });
});
