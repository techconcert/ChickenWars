// Aggregation of percent modifiers from the clan, completed research and active buffs.
import { BALANCE, CLANS, RESEARCH } from '../data/registry';
import type { EffectData } from '../data/schema';
import { cityBonus, researchClanBonus } from '../bonuses';
import { researchBonus } from '../research/bonus';
import type { GameState, ResourceId } from '../state';

/** All clan and completed-research effects in a stable order. */
export function modEffects(state: GameState): readonly EffectData[] {
  const out: EffectData[] = [];
  const clan = CLANS[state.options.clan];
  if (clan) out.push(...clan.effects);
  for (const id of state.research.done) {
    const r = RESEARCH[id];
    if (r) out.push(...r.effects);
  }
  return out;
}

function sum(state: GameState, f: (e: EffectData) => number): number {
  let t = 0;
  for (const e of modEffects(state)) t += f(e);
  return t;
}

export const clanProdPct = (state: GameState, res: ResourceId): number => {
  const clan = CLANS[state.options.clan];
  let t = 0;
  if (clan) for (const e of clan.effects) if (e.kind === 'prodMult' && e.res === res) t += e.pct;
  return t;
};
/** Research production bonus in percent, capped (+100%) by researchBonus. */
export const researchProdPct = (state: GameState, res: ResourceId): number => researchBonus(state, 'prodMult', { res });
/** City-wide stats combine capped research + clan + hero talents of all owned heroes (bonuses.cityBonus). */
export const capMultPct = (state: GameState, res: ResourceId): number => cityBonus(state, 'capMult', { res });
export const upkeepPct = (state: GameState): number => cityBonus(state, 'upkeepMult');
export const trainTimePct = (state: GameState): number => cityBonus(state, 'trainTime');
/** Build time speed bonus in percent: research + hero talents, total max 25% (city.md). */
export const buildSpeedPct = (state: GameState): number => cityBonus(state, 'buildSpeed');
export const tradeSteps = (state: GameState): number => sum(state, (e) => (e.kind === 'tradeStep' ? e.steps : 0));
/** Clan + research wounded share bonus (capped at 30); the leading hero's talents are added by the caller. */
export const woundedRatioPct = (state: GameState): number => researchClanBonus(state, 'woundedRatio');
export const troopCostPct = (state: GameState, cls: string): number =>
  sum(state, (e) => (e.kind === 'costMult' && e.troopClass === cls ? e.pct : 0));
/** Extra adjacency percent a clan or tech grants to a building type (added to each adjacency source). */
export const adjacencyExtraPct = (state: GameState, building: string): number =>
  sum(state, (e) => (e.kind === 'adjacency' && e.building === building ? e.pct : 0));

/** Active timed production buffs (stat 'prod_all', 'prod_<res>' or '<res>'), percent. */
export function buffProdPct(state: GameState, res: ResourceId): number {
  let t = 0;
  for (const b of state.buffs) {
    if (b.until <= state.tick) continue;
    if (b.stat === 'prod_all' || b.stat === `prod_${res}` || b.stat === res) t += b.pct;
  }
  return t;
}

export function seasonProdMult(state: GameState, res: ResourceId): number {
  const key = (['spring', 'summer', 'autumn', 'winter'] as const)[state.season.index] ?? 'spring';
  const m = BALANCE.seasonMods[key];
  return res === 'ember' ? 1 : m[res];
}
