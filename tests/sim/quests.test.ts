import { describe, expect, it } from 'vitest';
import { getCaps } from '@sim/city/caps';
import type { TickCtx } from '@sim/ctx';
import { QUEST_LIST } from '@sim/data/registry';
import type { GameEvent } from '@sim/events';
import { activeQuests } from '@sim/quests';
import type { GameState } from '@sim/state';
import { tickQuests } from '@sim/systems/quests';
import { makeState } from '../helpers/makeState';

function tickWith(s: GameState, inEvents: GameEvent[] = []): GameEvent[] {
  const ctx: TickCtx = { events: inEvents.slice(), safeMode: false };
  tickQuests(s, ctx);
  return ctx.events;
}
function put(s: GameState, type: string, level = 1): void {
  const id = String(s.nextId++);
  s.city.buildings[id] = { id, type, cell: 200 + s.nextId, level, damaged: false };
}
function jumpTo(s: GameState, id: string): void {
  const def = QUEST_LIST.find((q) => q.id === id)!;
  s.quests.active = id;
  s.quests.stepProgress = def.steps.map(() => 0);
  delete s.quests.base;
}

describe('quest data', () => {
  it('has a 12-quest tutorial chain through TH5, then region quests, reign and a side quest', () => {
    const tut = QUEST_LIST.filter((q) => q.id.startsWith('tutorial_'));
    expect(tut.length).toBe(12);
    const order: string[] = [];
    for (let q = QUEST_LIST[0]; q; q = q.next ? QUEST_LIST.find((x) => x.id === q!.next) : undefined) order.push(q.id);
    expect(order.slice(0, 12)).toEqual(tut.map((q) => q.id));
    expect(order[11]).toBe('tutorial_th5');
    expect(order[order.length - 1]).toBe('reign');
    expect(QUEST_LIST.find((q) => q.id === 'city_in_peril')?.trigger).toEqual({ counter: 'raidsLost', value: 3 });
  });
});

describe('quest conditions', () => {
  it('building steps are absolute and the chain advances with rewards and events', () => {
    const s = makeState();
    expect(s.quests.active).toBe('tutorial_build_farm');
    tickWith(s);
    expect(s.quests.active).toBe('tutorial_build_farm');
    put(s, 'farm');
    const wood = s.resources.wood;
    const ev = tickWith(s);
    expect(s.quests.completed).toEqual(['tutorial_build_farm']);
    expect(s.quests.active).toBe('tutorial_build_lumber');
    expect(s.resources.wood).toBe(wood + 100);
    expect(ev.map((e) => e.t)).toEqual(expect.arrayContaining(['QuestAdvanced', 'QuestCompleted', 'QuestStarted']));
    expect(s.chronicle.some((c) => c.text.includes('First Harvest'))).toBe(true);
  });

  it('a level-0 building under construction does not count; one chain pass can finish several quests', () => {
    const s = makeState();
    put(s, 'farm', 0);
    tickWith(s);
    expect(s.quests.active).toBe('tutorial_build_farm');
    put(s, 'farm'); put(s, 'lumber_camp'); put(s, 'house');
    s.city.buildings[s.city.townHall]!.level = 2;
    tickWith(s);
    expect(s.quests.active).toBe('tutorial_train'); // farm, lumber, house, TH2 done in one tick
    expect(s.quests.completed.length).toBe(4);
  });

  it('counter steps count from quest start (delta), not from before', () => {
    const s = makeState();
    s.quests.counters.gathered = 500;
    jumpTo(s, 'tutorial_gather');
    tickWith(s); // records the baseline
    expect(s.quests.stepProgress).toEqual([0]);
    s.quests.counters.gathered = 650;
    tickWith(s);
    expect(s.quests.stepProgress).toEqual([150]);
    expect(s.quests.active).toBe('tutorial_gather');
    s.quests.counters.gathered = 720;
    tickWith(s);
    expect(s.quests.completed).toContain('tutorial_gather');
    expect(s.quests.active).toBe('tutorial_scout');
  });

  it('trained steps read TroopsTrained events', () => {
    const s = makeState();
    put(s, 'barracks');
    jumpTo(s, 'tutorial_train');
    tickWith(s, [{ t: 'TroopsTrained', tick: 0, troop: 'militia', count: 12 }]);
    expect(s.quests.stepProgress).toEqual([1, 12]);
    expect(s.quests.counters.trained_militia).toBe(12);
    tickWith(s, [{ t: 'TroopsTrained', tick: 1, troop: 'footman', count: 50 }]);
    expect(s.quests.active).toBe('tutorial_train');
    tickWith(s, [{ t: 'TroopsTrained', tick: 2, troop: 'militia', count: 8 }]);
    expect(s.quests.completed).toContain('tutorial_train');
  });

  it('research, gift, ruin, camp and boss steps read counters and events', () => {
    const s = makeState();
    jumpTo(s, 'tutorial_research');
    tickWith(s, [{ t: 'ResearchCompleted', tick: 0, tech: 'x' }]);
    expect(s.quests.active).toBe('tutorial_gift');
    tickWith(s, [{ t: 'LordRepChanged', tick: 1, lord: 'lord_hale', rep: 5, delta: 5 }]);
    expect(s.quests.active).toBe('tutorial_th5');
    jumpTo(s, 'region_camp_t2');
    tickWith(s);
    s.quests.counters.campCleared_t1 = 4;
    tickWith(s);
    expect(s.quests.active).toBe('region_camp_t2');
    s.quests.counters.campCleared_t2 = 1;
    tickWith(s);
    expect(s.quests.active).toBe('region_ruin');
    s.quests.counters.ruinExplored = 2;
    tickWith(s);
    expect(s.quests.active).toBe('region_boss_t2');
    s.world.pois['b2'] = { id: 'b2', kind: 'boss', cell: 0, region: 1, tier: 2, level: 10, active: true, troops: [], strength: 0, respawnAt: null, raidReadyAt: 0 };
    tickWith(s, [{ t: 'BossDefeated', tick: 5, poi: 'b2', boss: 'boss_warchief' }]);
    expect(s.quests.counters.bossKilled_t2).toBe(1);
    expect(s.quests.active).toBe('region_camp_t3');
  });

  it('rewards (resources capped, item, hero) are granted exactly once', () => {
    const s = makeState();
    jumpTo(s, 'tutorial_camp');
    s.quests.counters.campCleared_t1 = 0;
    tickWith(s);
    s.quests.counters.campCleared_t1 = 1;
    s.resources.gold = getCaps(s).gold - 50;
    const ev = tickWith(s);
    expect(s.resources.gold).toBe(getCaps(s).gold); // +200 capped
    expect(ev.some((e) => e.t === 'ResourceOverflow')).toBe(true);
    expect(Object.values(s.inventory).filter((i) => i.def === 'common_sword').length).toBe(1);
    expect(s.quests.active).toBe('tutorial_ruins');
    for (let i = 0; i < 5; i++) tickWith(s);
    expect(Object.values(s.inventory).length).toBe(1);

    s.quests.counters.ruinExplored = 1;
    const ev2 = tickWith(s);
    expect(s.heroes['seren']).toBeDefined();
    expect(ev2.filter((e) => e.t === 'HeroRecruited').length).toBe(1);
    for (let i = 0; i < 5; i++) tickWith(s);
    expect(s.quests.completed.filter((q) => q === 'tutorial_ruins').length).toBe(1);
    expect(Object.keys(s.heroes).filter((h) => h === 'seren').length).toBe(1);
  });

  it('city_in_peril is offered at raidsLost >= 3, then pays ally troops once', () => {
    const s = makeState();
    const lost: GameEvent[] = [0, 1, 2].map((i) => ({ t: 'RaidResolved', tick: i, raid: `r${i}`, won: false }));
    const ev = tickWith(s, lost);
    expect(s.quests.counters.raidsLost).toBe(3);
    expect(ev.some((e) => e.t === 'QuestStarted' && e.quest === 'city_in_peril')).toBe(true);
    expect(activeQuests(s).some((q) => q.id === 'city_in_peril' && q.side)).toBe(true);
    expect(s.quests.active).toBe('tutorial_build_farm'); // chain untouched
    const before = s.troops.militia!.healthy;
    tickWith(s, [{ t: 'RaidResolved', tick: 9, raid: 'r9', won: true }]);
    expect(s.troops.militia!.healthy).toBe(before + 40);
    expect(s.quests.completed).toContain('city_in_peril');
    tickWith(s, [{ t: 'RaidResolved', tick: 10, raid: 'r10', won: false }]);
    expect(s.troops.militia!.healthy).toBe(before + 40);
    expect(Object.keys(s.quests.side ?? {})).toEqual([]);
  });

  it('survives a JSON round trip', () => {
    const s = makeState();
    put(s, 'farm');
    tickWith(s);
    const copy = JSON.parse(JSON.stringify(s)) as GameState;
    tickWith(copy);
    expect(copy.quests).toEqual(s.quests);
  });
});
