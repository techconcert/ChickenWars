// One place that combines the sources of a stat: capped research + chosen clan + hero talents + timed buffs.
// Consumers (marches, military, city, raids) call these instead of summing raw effect lists, so every stat is capped once.
// City-wide talent effects (trainTime, upkeepMult, capMult, buildSpeed...) are summed over ALL owned heroes (D30) and
// capped at CITY_TALENT_CAP percent per stat.
import { CLANS, TALENTS } from './data/registry';
import type { EffectData } from './data/schema';
import { capFor, effectValue, researchBonus } from './research/bonus';
import type { GameState } from './state';
import { sortedKeys } from './util';

/** Cap (in the effect's own unit) on the sum of one city-wide stat coming from hero talents. */
export const CITY_TALENT_CAP = 25;

type Filter = Partial<Record<'res' | 'class' | 'troop' | 'building' | 'category' | 'troopClass', string>>;

function matches(e: EffectData, filter?: Filter): boolean {
  if (!filter) return true;
  const r = e as unknown as Record<string, unknown>;
  for (const k of Object.keys(filter) as (keyof Filter)[]) {
    const want = filter[k];
    if (want === undefined) continue;
    if (r[k] === want || (k === 'res' && r[k] === 'all')) continue;
    return false;
  }
  return true;
}

/** Sum of the chosen clan's effects of `kind` (uncapped; clan values are small by design). */
export function clanSum(state: GameState, kind: EffectData['kind'], filter?: Filter): number {
  const clan = CLANS[state.options.clan];
  let t = 0;
  if (clan) for (const e of clan.effects) if (e.kind === kind && matches(e, filter)) t += effectValue(e);
  return t;
}

/** Talent effects of `kind` summed over all owned heroes, rank-weighted, clamped to +-CITY_TALENT_CAP. */
export function cityTalentSum(state: GameState, kind: EffectData['kind'], filter?: Filter): number {
  let t = 0;
  for (const h of sortedKeys(state.heroes)) {
    const hs = state.heroes[h];
    if (!hs) continue;
    for (const tid of sortedKeys(hs.talents)) {
      const rank = hs.talents[tid] ?? 0;
      const node = TALENTS[tid]?.node;
      if (!node || rank <= 0) continue;
      for (const e of node.effects) if (e.kind === kind && matches(e, filter)) t += effectValue(e) * rank;
    }
  }
  return Math.max(-CITY_TALENT_CAP, Math.min(CITY_TALENT_CAP, t));
}

const clampKind = (kind: EffectData['kind'], v: number): number => {
  const cap = capFor(kind);
  return Math.max(-cap, Math.min(cap, v));
};

/** Research (capped) + clan, capped again as a total. For stats where heroes add their own part (march speed, vision). */
export function researchClanBonus(state: GameState, kind: EffectData['kind'], filter?: Filter): number {
  return clampKind(kind, researchBonus(state, kind, filter) + clanSum(state, kind, filter));
}

/** Research + clan + city-wide hero talents, capped as a total (per RESEARCH_CAPS, e.g. buildSpeed 25). */
export function cityBonus(state: GameState, kind: EffectData['kind'], filter?: Filter): number {
  return clampKind(kind, researchBonus(state, kind, filter) + clanSum(state, kind, filter) + cityTalentSum(state, kind, filter));
}

/** Sum of active timed buffs (state.buffs) for a stat, percent. */
export function buffSum(state: GameState, stat: string): number {
  let s = 0;
  for (const b of state.buffs) if (b.stat === stat && b.until > state.tick) s += b.pct;
  return s;
}
