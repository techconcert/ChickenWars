// Balance bot: ties the planners together. `Bot.decide(state)` returns the commands for this moment.
import { DAY_TICKS } from '../../src/sim/constants';
import { validateCommand } from '../../src/sim/commands';
import type { Command } from '../../src/sim/commands';
import { RESEARCH_LIST, HERO_LIST, LORD_LIST, LORDS, WORLD } from '../../src/sim/data/registry';
import { getPopulation } from '../../src/sim/city/pop';
import { getRates } from '../../src/sim/city/production';
import { getCaps } from '../../src/sim/city/caps';
import { lordStage } from '../../src/sim/allies';
import type { GameState, Res, ResourceId } from '../../src/sim/state';
import { GOALS, planBuild } from './build';
import type { Goal } from './build';
import { planMarches, planTraining } from './army';
import type { MarchPolicy } from './army';

export interface BotOptions {
  /** Town Hall level the bot stops at. */
  targetTH: number;
  goals?: readonly Goal[];
  /** Start training/attacking only from this Town Hall level. */
  militaryFromTH?: number;
  attack?: boolean;
  /** Fraction of fighters kept home once raids can start. */
  homeGuard?: number;
  maxLoss?: number;
  maxArmy?: number;
  research?: boolean;
  heroes?: boolean;
  allies?: boolean;
  decideEvery?: number;
}

const RESEARCH_FIRST = [
  'eco_farming_1', 'tier2_infantry', 'tier2_archer', 'eco_lumber_1', 'mil_heal_1', 'tier2_cavalry', 'def_walls_1', 'def_towers_1', 'eco_storage_1', 'exp_march_1', 'eco_gather_1', 'def_warning_1',
  'eco_mining_1', 'exp_supply_1', 'eco_farming_2', 'eco_gold_1', 'def_garrison_1', 'exp_slots_1',
  'def_walls_2', 'def_towers_2', 'eco_storage_2', 'def_warning_2', 'exp_vision_1', 'tier3_infantry', 'tier3_archer', 'exp_gather_2', 'def_siegecraft',
];
const TALENT_ORDER: Record<string, string[]> = {
  warrior: ['w_vigor', 'w_strike', 'w_bulwark', 'w_rank2', 'w_lancers', 'w_ironwill', 'w_warlord', 'w_rank3'],
  ranger: ['r_aim', 'r_forage', 'r_pathfind', 'r_rank2', 'r_eagle', 'r_fleet', 'r_hunter', 'r_rank3'],
  strategist: ['s_tactics', 's_logistics', 's_architect', 's_drill', 's_rank2', 's_medic', 's_steward', 's_quartermaster', 's_rank3'],
};

function sub(avail: Res, cost: Res): void {
  for (const k of Object.keys(cost) as ResourceId[]) avail[k] = (avail[k] ?? 0) - (cost[k] ?? 0);
}
function fits(avail: Res, cost: Res, reserve: Res | null): boolean {
  for (const k of Object.keys(cost) as ResourceId[]) if ((cost[k] ?? 0) + (reserve?.[k] ?? 0) > (avail[k] ?? 0)) return false;
  return true;
}

export class Bot {
  readonly opts: Required<BotOptions>;
  constructor(opts: BotOptions) {
    this.opts = {
      goals: GOALS, militaryFromTH: 2, attack: true, homeGuard: 0.1, maxLoss: 0.45, maxArmy: 1e9, research: true, heroes: true, allies: true,
      decideEvery: 40, ...opts,
    };
  }

  decide(state: GameState): Command[] {
    const o = this.opts;
    const out: Command[] = [];
    const avail: Res = { ...state.resources };
    // housing first: troops need pop room (houses, then house levels)
    let goals: readonly Goal[] = o.goals;
    if (getPopulation(state).free < 8 && state.tick > 1200) {
      const houses = Object.values(state.city.buildings).filter((b) => b.type === 'house');
      const pending = state.city.queue.some((j) => state.city.buildings[j.building]?.type === 'house');
      if (!pending) goals = [{ k: 'build', type: 'house', n: houses.length + 1 }, ...goals];
    }
    const th = state.city.buildings[state.city.townHall]?.level ?? 1;
    // Until the first camp falls: food, housing and barracks first (the army is the goal), everything else after.
    if (state.stats.campsCleared === 0 && th >= 3) {
      goals = [{ k: 'build', type: 'farm', n: 3 }, { k: 'level', type: 'house', level: 2 }, { k: 'level', type: 'farm', level: 2 }, ...goals];
    }
    // Food is what limits the army: when the net income is thin, farms (count and level) go first.
    if (th >= 4 && getRates(state).food.net < 60 + 2.2 * Object.values(state.troops).reduce((a, p) => a + p.healthy + p.wounded, 0)) {
      goals = [{ k: 'build', type: 'farm', n: 99 }, { k: 'level', type: 'farm', level: th }, ...goals];
    }
    if (th >= o.militaryFromTH) {
      const foodFloor = 80;
      const urgent = planTraining(state, avail, null, { maxArmy: Math.min(o.maxArmy, state.tick > 1800 ? 30 + th * 10 : 0), foodFloor, minTroops: state.tick > 1800 ? 30 + th * 10 : 0 });
      out.push(...urgent);
      for (const c of urgent) if (c.t === 'train') sub(avail, { ...(trainCostOf(state, c.troop, c.count)) });
    }
    // tier-2 troops are the army's backbone: their techs are bought before anything else competes for the gold
    if (o.research) {
      for (const id of ['tier2_infantry', 'tier2_archer', 'tier2_cavalry']) {
        const def = RESEARCH_LIST.find((r) => r.id === id);
        const c: Command = { t: 'research', tech: id };
        if (!def || validateCommand(state, c) || !fits(avail, def.cost, null)) continue;
        out.push(c);
        sub(avail, def.cost);
        break;
      }
    }
    const build = planBuild(state, avail, o.targetTH, goals);
    out.push(...build.cmds);
    for (const c of build.cmds) sub(avail, costOf(state, c));
    if (th >= o.militaryFromTH) {
      const more = planTraining(state, avail, build.reserve, { maxArmy: o.maxArmy, foodFloor: 80, minTroops: 0 });
      out.push(...more);
      for (const c of more) if (c.t === 'train') sub(avail, trainCostOf(state, c.troop, c.count));
    }
    // repair
    for (const id of Object.keys(state.city.buildings).sort()) {
      if (!state.city.buildings[id]!.damaged) continue;
      const c: Command = { t: 'repair', building: id };
      if (!validateCommand(state, c)) out.push(c);
    }
    if (o.research) out.push(...this.planResearch(state, avail, build.reserve));
    if (o.heroes) out.push(...this.planHeroes(state, avail, build.reserve));
    if (o.allies) out.push(...this.planAllies(state, avail, build.reserve));
    const policy: MarchPolicy = { maxLoss: o.maxLoss, allowAttack: o.attack && th >= 2, allowRally: true, homeGuard: o.homeGuard };
    out.push(...planMarches(state, policy));
    if (state.pendingEvent) {
      for (let i = 0; i < 3; i++) { const c: Command = { t: 'eventChoice', option: i }; if (!validateCommand(state, c)) { out.push(c); break; } }
    }
    return out;
  }

  private planResearch(state: GameState, avail: Res, reserve: Res | null): Command[] {
    const out: Command[] = [];
    const has = Object.values(state.city.buildings).some((b) => b.type === 'academy' && b.level >= 1);
    if (!has) return out;
    const acad = Object.values(state.city.buildings).some((b) => b.type === 'academy' && b.level >= 2);
    if (acad && ['tier2_infantry', 'tier2_archer'].some((id) => !state.research.done.includes(id))) return out; // the slot is kept for the tier-2 techs
    const rest = RESEARCH_LIST.map((r) => r.id).filter((id) => !RESEARCH_FIRST.includes(id))
      .sort((a, b) => (RESEARCH_LIST.find((r) => r.id === a)!.tier - RESEARCH_LIST.find((r) => r.id === b)!.tier) || (a < b ? -1 : 1));
    const order = [...RESEARCH_FIRST, ...rest.filter((id) => id.startsWith('ally_')), ...rest.filter((id) => !id.startsWith('ally_'))];
    for (const id of order) {
      const def = RESEARCH_LIST.find((r) => r.id === id);
      if (!def) continue;
      if (def.effects.some((e) => e.kind === 'unlockBridges') && !(state.world.bridges?.length)) continue; // nothing to open on this map
      const c: Command = { t: 'research', tech: id };
      const err = validateCommand(state, c);
      if (err === 'no_slot') break;
      if (err) continue;
      if (!fits(avail, def.cost, reserve)) break;
      out.push(c);
      sub(avail, def.cost);
      break; // one per decision
    }
    return out;
  }

  private planHeroes(state: GameState, avail: Res, reserve: Res | null): Command[] {
    const out: Command[] = [];
    for (const id of Object.keys(state.heroes).sort()) {
      const hs = state.heroes[id]!;
      const cls = HERO_LIST.find((h) => h.id === id)?.class ?? 'warrior';
      for (const t of TALENT_ORDER[cls] ?? []) {
        const c: Command = { t: 'heroTalent', hero: id, talent: t };
        if (!validateCommand(state, c)) { out.push(c); break; }
      }
      // equip free items
      if (!hs.march) {
        for (const slot of ['weapon', 'armour', 'banner', 'trinket'] as const) {
          if (hs.equipment[slot]) continue;
          const item = Object.keys(state.inventory).sort().find((i) => {
            const c: Command = { t: 'equip', hero: id, slot, item: i };
            return !validateCommand(state, c);
          });
          if (item) { out.push({ t: 'equip', hero: id, slot, item }); break; }
        }
      }
    }
    // recruit a tavern hero when rich and under 3 heroes (a second/third hero is a second/third march)
    if (Object.keys(state.heroes).length < 3) {
      for (const cand of state.tavern.candidates) {
        const cost = HERO_LIST.find((h) => h.id === cand)?.recruit;
        if (!cost || cost.kind !== 'tavern' || !fits(avail, cost.cost, reserve)) continue;
        const c: Command = { t: 'recruitHero', hero: cand };
        if (!validateCommand(state, c)) { out.push(c); sub(avail, cost.cost); break; }
      }
    }
    return out;
  }

  private planAllies(state: GameState, avail: Res, reserve: Res | null): Command[] {
    const out: Command[] = [];
    for (const l of LORD_LIST) {
      if ((state.quests.counters[`heroOffer_${l.id}`] ?? 0) === 1) {
        const c: Command = { t: 'acceptHeroOffer', lord: l.id };
        if (!validateCommand(state, c)) out.push(c);
      }
    }
    const th = state.city.buildings[state.city.townHall]?.level ?? 1;
    if (th < 3 && !(state.quests.active ?? '').includes('gift')) return out;
    const caps = getCaps(state);
    // one gift per decision to the lord with the lowest stage that is reachable (region unlocked and fog-revealed village)
    const lords = Object.keys(state.lords).sort((a, b) => LORDS[a]!.regionTier - LORDS[b]!.regionTier);
    for (const id of lords) {
      const lord = state.lords[id]!;
      if (lordStage(lord.rep) === 'allied' || lord.giftDay === state.season.day && lord.giftsToday >= 2) continue;
      const village = state.world.pois[lord.poi];
      if (!village || (state.world.regions[village.region]?.dangerTier ?? 9) > 2 + (state.stats.bossesKilled > 0 ? 2 : 0)) continue;
      const likes = LORDS[id]!.likes;
      const res = likes.filter((r) => r !== 'ember').sort((a, b) => state.resources[b] / caps[b] - state.resources[a] / caps[a])[0];
      if (!res || state.resources[res] < Math.min(caps[res] * 0.5, 400) || state.resources[res] < 150) continue;
      const amount = Math.min(150, Math.floor(avail[res] ?? 0));
      const gift: Res = { [res]: amount };
      if (reserve && !fits(avail, gift, reserve)) continue;
      const c: Command = { t: 'allyGift', lord: id, gift };
      if (!validateCommand(state, c)) { out.push(c); sub(avail, gift); break; }
    }
    void DAY_TICKS; void WORLD;
    return out;
  }
}

import { buildingCost } from '../../src/sim/data/registry';
import { trainCost } from '../../src/sim/systems/military';
function costOf(state: GameState, c: Command): Res {
  if (c.t === 'build') return buildingCost(c.building, 1);
  if (c.t === 'upgrade') { const b = state.city.buildings[c.building]; return b ? buildingCost(b.type, b.level + 1) : {}; }
  return {};
}
function trainCostOf(state: GameState, troop: string, count: number): Res {
  return trainCost(state, troop, count);
}
