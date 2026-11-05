// Research/talent/clan effects reach their consumers, capped once (D30).
import { describe, expect, it } from 'vitest';
import { cityBonus } from '@sim/bonuses';
import { applyCommand, validateCommand } from '@sim/commands';
import type { Command } from '@sim/commands';
import { resolveBattle } from '@sim/combat/resolver';
import { HEROES, RESEARCH } from '@sim/data/registry';
import { playerSideMods } from '@sim/heroes/mods';
import { marchVision } from '@sim/nav/fog';
import { gatherPerTick, marchSpeedMult } from '@sim/nav/marchCore';
import { marchSlots } from '@sim/nav/modifiers';
import { cityDefence } from '@sim/raids';
import type { GameState, MarchState } from '@sim/state';
import { tickAllies } from '@sim/systems/allies';
import { buildSpeedPct } from '@sim/city/modifiers';
import { healPerMinute, trainDuration, woundedShare } from '@sim/systems/military';
import { researchError } from '@sim/systems/research';
import { advance } from '@sim/tick';
import { makeState } from '../helpers/makeState';

const ctx = () => ({ events: [], safeMode: false });
const run = (s: GameState, c: Command): string | null => {
  const e = validateCommand(s, c);
  if (!e) applyCommand(s, c, ctx());
  return e;
};
const march = (s: GameState, kind: MarchState['kind'] = 'gather'): MarchState =>
  ({ id: 'm1', hero: 'aldric', troops: { militia: 10 }, kind, target: {}, path: [s.world.capitalCell], step: 0, progress: 0, state: 'moving', carried: {}, supply: 0, startedAt: 0 }) as MarchState;

describe('marches', () => {
  it('research adds a march slot (capped at +1) and speed / gather / vision bonuses', () => {
    const s = makeState();
    const slots = marchSlots(s);
    s.research.done = ['exp_slots_1', 'exp_slots_1'];
    expect(marchSlots(s)).toBe(slots + 1);
    s.research.done = [];
    const sp = marchSpeedMult(s, 'aldric');
    s.research.done = ['exp_march_1'];
    expect(marchSpeedMult(s, 'aldric')).toBeGreaterThan(sp);
    s.research.done = [];
    const m = march(s);
    const g = gatherPerTick(s, m);
    s.research.done = ['eco_gather_1'];
    expect(gatherPerTick(s, m)).toBeCloseTo(g * 1.1, 8);
    s.research.done = [];
    const sc = march(s, 'scout');
    const v = marchVision(s, sc);
    s.research.done = ['exp_fog_1', 'exp_vision_1'];
    expect(marchVision(s, sc)).toBe(v + 2);
    expect(marchVision(s, march(s, 'gather'))).toBe(marchVision(s, march(s, 'attack')));
  });

  it('supplyMult shrinks the food reserved for a march', () => {
    const mk = (done: string[]): number => {
      const s = makeState();
      s.troops.militia!.healthy = 50;
      s.research.done = done;
      const node = Object.values(s.world.nodes)[0]!;
      const c: Command = { t: 'march', hero: 'aldric', troops: { militia: 50 }, target: { node: node.id }, kind: 'gather' };
      expect(run(s, c)).toBeNull();
      return Object.values(s.marches)[0]!.supply;
    };
    expect(mk(['exp_supply_1'])).toBeLessThan(mk([]));
  });
});

describe('military', () => {
  it('trainSpeed, healMult and the wounded share use capped research', () => {
    const s = makeState();
    s.city.buildings['b1'] = { id: 'b1', type: 'barracks', cell: 40, level: 3, damaged: false };
    s.city.buildings['i1'] = { id: 'i1', type: 'infirmary', cell: 41, level: 1, damaged: false };
    const t0 = trainDuration(s, 'b1', 'militia', 10);
    const h0 = healPerMinute(s);
    const w0 = woundedShare(s);
    s.research.done = ['tier3_infantry', 'mil_field_hospital'];
    expect(trainDuration(s, 'b1', 'militia', 10)).toBeLessThan(t0);
    expect(healPerMinute(s)).toBeCloseTo(h0 * 1.25, 8);
    expect(woundedShare(s)).toBeGreaterThan(w0);
    expect(woundedShare(s, 10)).toBeGreaterThan(woundedShare(s));
  });
});

describe('city', () => {
  it('buildSpeed combines research and hero talents, max 25%, and shortens jobs', () => {
    const s = makeState();
    s.research.done = ['eco_grand_hearth', 'ally_lord_hale']; // 10 + 10
    expect(buildSpeedPct(s)).toBe(20);
    s.heroes.aldric!.talents = { s_architect: 2 }; // +6 talents -> 26 -> capped
    expect(cityBonus(s, 'buildSpeed')).toBe(25);
    s.research.done = [];
    s.heroes.aldric!.talents = {};
    s.resources.wood = 1e5; s.resources.stone = 1e5; s.resources.food = 1e5; s.resources.gold = 1e5;
    expect(run(s, { t: 'build', building: 'farm', cell: s.city.buildings[s.city.townHall]!.cell + 3 })).toBeNull();
    advance(s);
    const base = Object.values(s.city.queue)[0]!;
    const baseTicks = base.ticks;
    const s2 = makeState();
    s2.research.done = ['eco_grand_hearth', 'ally_lord_hale'];
    s2.resources.wood = 1e5; s2.resources.stone = 1e5; s2.resources.food = 1e5; s2.resources.gold = 1e5;
    expect(run(s2, { t: 'build', building: 'farm', cell: s2.city.buildings[s2.city.townHall]!.cell + 3 })).toBeNull();
    advance(s2);
    expect(Object.values(s2.city.queue)[0]!.ticks).toBe(Math.round(baseTicks / 1.2));
  });

  it('talents of all owned heroes act city-wide (capped)', () => {
    const s = makeState();
    const base = cityBonus(s, 'trainTime');
    s.heroes.aldric!.talents = { s_drill: 2 };
    expect(cityBonus(s, 'trainTime')).toBe(base - 8);
  });

  it('research wallHp and towerAtk strengthen the city defence', () => {
    const s = makeState();
    s.city.buildings['w1'] = { id: 'w1', type: 'wall', cell: 50, level: 1, damaged: false };
    s.city.buildings['t1'] = { id: 't1', type: 'watchtower', cell: 51, level: 1, damaged: false };
    const d0 = cityDefence(s);
    s.research.done = ['def_walls_1', 'def_towers_1'];
    const d1 = cityDefence(s);
    expect(d1.wallHp).toBeGreaterThan(d0.wallHp);
    expect(d1.towerAtk).toBeGreaterThan(d0.towerAtk);
  });
});

describe('combat side mods (single source)', () => {
  it('clan classDef counts once; research and talents add on top', () => {
    const s = makeState(); // oakwarden: infantry def +5%
    const inf = [{ troop: 'militia', count: 100 }];
    expect(playerSideMods(s, 'aldric', inf).defPm).toBe(50);
    s.research.done = ['def_garrison_1']; // infantry +5
    expect(playerSideMods(s, 'aldric', inf).defPm).toBe(100);
    s.heroes.aldric!.talents = { w_bulwark: 2 }; // +8
    expect(playerSideMods(s, 'aldric', inf).defPm).toBe(180);
    expect(playerSideMods(s, null, inf).defPm).toBe(100);
    // archers only: the infantry bonuses do not apply
    expect(playerSideMods(s, 'aldric', [{ troop: 'bowman', count: 50 }]).defPm).toBe(50); // def_garrison_1 gives archers +5
  });

  it('rage gain talents make the skill fire earlier', () => {
    const big = [{ troop: 'militia', count: 3000 }];
    const hero = { name: 'h', atk: 0, def: 0, hp: 0, skill: 'cleave', skillRank: 1 };
    const fire = (rageGainPct: number): number => {
      const r = resolveBattle({ attacker: { name: 'A', hero, stacks: big, mods: { rageGainPct } }, defender: { name: 'D', hero: null, stacks: [{ troop: 'militia', count: 3000 }] } }, 5);
      return r.rageEvents.find((e) => e.side === 'A')?.round ?? 99;
    };
    expect(fire(100)).toBeLessThan(fire(0));
    void HEROES;
  });
});

describe('ally unlocks', () => {
  it('becoming allied opens the ally tech and the hero offer; accepting grants the hero once', () => {
    const s = makeState();
    const lord = 'lord_hale';
    expect(s.lords[lord]).toBeDefined();
    s.research.done = [];
    s.city.buildings['a1'] = { id: 'a1', type: 'academy', cell: 60, level: 10, damaged: false };
    for (const k of ['food', 'wood', 'stone', 'gold', 'ember'] as const) s.resources[k] = 1e5;
    expect(researchError(s, `ally_${lord}`)).toBe('flag');
    expect(run(s, { t: 'acceptHeroOffer', lord })).toBe('no_offer');
    s.lords[lord]!.rep = 70;
    tickAllies(s, ctx());
    expect(s.quests.counters[`allyTech_${lord}`]).toBe(1);
    expect(researchError(s, `ally_${lord}`)).toBeNull();
    expect(RESEARCH[`ally_${lord}`]!.requiresFlag).toBe(`allyTech_${lord}`);
    expect(run(s, { t: 'acceptHeroOffer', lord })).toBeNull();
    expect(s.heroes.edda).toBeDefined();
    expect(s.quests.counters[`heroOffer_${lord}`]).toBe(2);
    expect(run(s, { t: 'acceptHeroOffer', lord })).toBe('no_offer');
  });
});
