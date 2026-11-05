import { describe, expect, it } from 'vitest';
import { RESEARCH, RESEARCH_LIST, TROOPS, TROOP_LIST } from '@sim/data/registry';
import { RESEARCH_CAPS, effectValue, researchBonus } from '@sim/research/bonus';
import { advance } from '@sim/tick';
import { applyCommand, validateCommand } from '@sim/commands';
import type { Command } from '@sim/commands';
import type { GameState } from '@sim/state';
import { academyLevel, researchSlots } from '@sim/systems/research';
import { computeProduction } from '@sim/city/production';
import { getCaps } from '@sim/city/caps';
import { makeState } from '../helpers/makeState';

function academy(s: GameState, level = 1): void {
  const id = String(s.nextId++);
  s.city.buildings[id] = { id, type: 'academy', cell: 3 + Object.keys(s.city.buildings).length, level, damaged: false };
}
function rich(s: GameState): void {
  for (const k of ['food', 'wood', 'stone', 'gold', 'ember'] as const) s.resources[k] = 1e6;
}
const cmd = (s: GameState, c: Command): string | null => {
  const e = validateCommand(s, c);
  if (!e) applyCommand(s, c, { events: [], safeMode: false });
  return e;
};

describe('second research slot (D50)', () => {
  it('Second Roost Shift adds one slot, so two techs can run at once', () => {
    const s = makeState();
    academy(s, 5);
    rich(s);
    expect(researchSlots(s)).toBe(1);
    s.research.done.push('eco_farming_1', 'eco_storage_1', 'eco_gather_1');
    expect(cmd(s, { t: 'research', tech: 'eco_second_shift' } as Command)).toBeNull();
    expect(cmd(s, { t: 'research', tech: 'eco_lumber_1' } as Command)).toBe('no_slot');
    for (let i = 0; i < RESEARCH['eco_second_shift']!.ticks + 1; i++) advance(s);
    expect(s.research.done).toContain('eco_second_shift');
    expect(researchSlots(s)).toBe(2);
    expect(cmd(s, { t: 'research', tech: 'eco_lumber_1' } as Command)).toBeNull();
    expect(cmd(s, { t: 'research', tech: 'eco_trade_1' } as Command)).toBeNull();
  });
});

describe('research data', () => {
  it('has about 40 techs, 10 per branch, tiers 1 to 4', () => {
    const base = RESEARCH_LIST.filter((r) => !r.requiresFlag);
    expect(base.length).toBe(42); // 40 + exp_shipwright (Islands bridges, D33) + eco_second_shift (D50)
    expect(RESEARCH_LIST.filter((r) => r.requiresFlag).length).toBe(6); // one ally tech per lord
    for (const b of ['economy', 'military', 'defence', 'exploration'] as const) {
      const list = base.filter((r) => r.branch === b);
      expect(list.length).toBe(b === 'exploration' || b === 'economy' ? 11 : 10);
      for (const t of [1, 2, 3, 4]) expect(list.some((r) => r.tier === t)).toBe(true);
    }
  });
  it('all prerequisites exist, are acyclic and are never in a later tier', () => {
    const visiting = new Set<string>();
    const done = new Set<string>();
    const visit = (id: string): void => {
      if (done.has(id)) return;
      expect(visiting.has(id), `cycle at ${id}`).toBe(false);
      visiting.add(id);
      const t = RESEARCH[id];
      expect(t, `unknown tech ${id}`).toBeDefined();
      for (const q of t!.requires) {
        expect(RESEARCH[q], `${id} requires unknown ${q}`).toBeDefined();
        expect(RESEARCH[q]!.tier).toBeLessThanOrEqual(t!.tier);
        expect(RESEARCH[q]!.academyLevel).toBeLessThanOrEqual(t!.academyLevel);
        visit(q);
      }
      visiting.delete(id);
      done.add(id);
    };
    for (const t of RESEARCH_LIST) visit(t.id);
  });
  it('academy level follows the tier, tier 4 needs ember', () => {
    const al: Record<number, number[]> = { 1: [1], 2: [2, 3, 5], 3: [5, 7], 4: [10] };
    for (const t of RESEARCH_LIST) {
      expect(al[t.tier]).toContain(t.academyLevel);
      if (t.tier === 4) expect(t.cost.ember ?? 0).toBeGreaterThan(0);
    }
  });
  it('every troop with requiresTech is unlocked by that tech', () => {
    for (const tr of TROOP_LIST) {
      if (!tr.requiresTech) continue;
      expect(RESEARCH[tr.requiresTech]!.effects.some((e) => e.kind === 'unlockTroop' && e.troop === tr.id)).toBe(true);
      expect(TROOPS[tr.id]).toBeDefined();
    }
  });
});

describe('research command and completion', () => {
  it('validates academy, level, prerequisites, slots, cost and duplicates', () => {
    const s = makeState();
    rich(s);
    expect(cmd(s, { t: 'research', tech: 'nope' })).toBe('unknown_tech');
    expect(cmd(s, { t: 'research', tech: 'eco_farming_1' })).toBe('no_academy');
    academy(s, 1);
    expect(academyLevel(s)).toBe(1);
    expect(researchSlots(s)).toBe(1);
    expect(cmd(s, { t: 'research', tech: 'eco_mining_1' })).toBe('academy_level');
    expect(cmd(s, { t: 'research', tech: 'eco_farming_1' })).toBeNull();
    expect(cmd(s, { t: 'research', tech: 'eco_farming_1' })).toBe('active');
    expect(cmd(s, { t: 'research', tech: 'eco_lumber_1' })).toBe('no_slot');
    s.city.buildings[Object.keys(s.city.buildings).pop()!]!.level = 3;
    expect(cmd(s, { t: 'research', tech: 'eco_lumber_1' })).toBe('no_slot'); // still busy
    s.research.active = [];
    expect(cmd(s, { t: 'research', tech: 'eco_gather_1' })).toBe('requires');
    s.research.done.push('eco_farming_1');
    expect(cmd(s, { t: 'research', tech: 'eco_farming_1' })).toBe('done');
    s.resources.wood = 0;
    s.resources.food = 0;
    s.resources.gold = 0;
    expect(cmd(s, { t: 'research', tech: 'eco_gather_1' })).toBe('cost');
  });
  it('academy level 10 gives two slots', () => {
    const s = makeState();
    academy(s, 10);
    expect(researchSlots(s)).toBe(2);
  });
  it('charges the cost, completes after its ticks, emits ResearchCompleted and feeds the researchDone quest counter via the event', () => {
    const s = makeState();
    academy(s, 1);
    rich(s);
    s.resources.wood = 1000;
    s.resources.gold = 1000;
    const def = RESEARCH['eco_farming_1']!;
    const t0 = s.tick;
    advance(s, [{ t: 'research', tech: 'eco_farming_1' }]);
    expect(s.research.active).toHaveLength(1);
    expect(s.research.active[0]!.endTick).toBe(t0 + def.ticks);
    expect(s.resources.gold).toBeLessThanOrEqual(1000 - (def.cost.gold ?? 0) + 5);
    let evs = 0;
    while (s.tick < t0 + def.ticks) { evs += advance(s).filter((e) => e.t === 'ResearchCompleted').length; }
    expect(evs).toBe(0);
    evs += advance(s).filter((e) => e.t === 'ResearchCompleted').length;
    expect(evs).toBe(1);
    expect(s.research.done).toEqual(['eco_farming_1']);
    expect(s.research.active).toEqual([]);
    expect(s.quests.counters['researchDone']).toBe(1);
  });
  it('completed research reaches the production consumer', () => {
    const s = makeState();
    s.city.buildings['900'] = { id: '900', type: 'farm', cell: 5, level: 1, damaged: false };
    const base = computeProduction(s).perMinute.food;
    s.research.done.push('eco_farming_1');
    expect(computeProduction(s).perMinute.food).toBeGreaterThan(base);
    const caps = getCaps(s).wood;
    s.research.done.push('eco_storage_1');
    expect(getCaps(s).wood).toBeGreaterThan(caps);
  });
});

describe('researchBonus', () => {
  it('sums by kind and filter, treating res "all" as matching any resource', () => {
    const s = makeState();
    s.research.done.push('eco_farming_1', 'eco_lumber_1', 'eco_storage_1');
    expect(researchBonus(s, 'prodMult', { res: 'food' })).toBe(10);
    expect(researchBonus(s, 'prodMult', { res: 'wood' })).toBe(10);
    expect(researchBonus(s, 'prodMult', { res: 'stone' })).toBe(0);
    expect(researchBonus(s, 'prodMult')).toBe(20);
    expect(researchBonus(s, 'capMult', { res: 'stone' })).toBe(15);
    expect(researchBonus(s, 'marchSpeed')).toBe(0);
  });
  it('enforces caps: +100% by default and the documented overrides', () => {
    const s = makeState();
    s.research.done.push('eco_farming_1');
    // Fake a huge stack by repeating a done entry (done is a list of ids; duplicates are summed as data corruption guard test).
    for (let i = 0; i < 40; i++) s.research.done.push('eco_farming_1');
    expect(researchBonus(s, 'prodMult', { res: 'food' })).toBe(100);
    s.research.done = [];
    for (let i = 0; i < 5; i++) s.research.done.push('exp_slots_1');
    expect(researchBonus(s, 'marchSlots')).toBe(RESEARCH_CAPS.marchSlots);
    s.research.done = ['exp_pathfinders', 'exp_pathfinders', 'exp_pathfinders', 'exp_pathfinders', 'exp_pathfinders'];
    expect(researchBonus(s, 'visionRadius')).toBe(RESEARCH_CAPS.visionRadius);
  });
  it('the full tree stays within caps and no single stat exceeds +100 percent', () => {
    const s = makeState();
    s.research.done = RESEARCH_LIST.map((r) => r.id);
    for (const kind of new Set(RESEARCH_LIST.flatMap((r) => r.effects.map((e) => e.kind)))) {
      if (kind === 'unlockTroop') continue;
      const v = researchBonus(s, kind);
      expect(Math.abs(v)).toBeLessThanOrEqual(RESEARCH_CAPS[kind] ?? 100);
    }
    expect(effectValue({ kind: 'marchSlots', amount: 1 })).toBe(1);
  });
});
