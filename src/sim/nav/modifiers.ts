// Global modifiers read by marches / world: clan + research effects, Town Hall level, resource caps, buffs.
import { CLANS, RESEARCH, effectAt } from '../data/registry';
import type { EffectData } from '../data/schema';
import { buffSum, researchClanBonus } from '../bonuses';
import { researchBonus } from '../research/bonus';
import type { GameState } from '../state';

/** Effects from the chosen clan and finished research. */
export function globalEffects(state: GameState): EffectData[] {
  const out: EffectData[] = [];
  const clan = CLANS[state.options.clan];
  if (clan) out.push(...clan.effects);
  for (const id of state.research.done) {
    const t = RESEARCH[id];
    if (t) out.push(...(t.effects as EffectData[]));
  }
  return out;
}

export function sumPct(effects: readonly EffectData[], kind: 'marchSpeed'): number {
  let s = 0;
  for (const e of effects) if (e.kind === kind) s += e.pct;
  return s;
}
export function sumAmount(effects: readonly EffectData[], kind: 'visionRadius'): number {
  let s = 0;
  for (const e of effects) if (e.kind === kind) s += e.amount;
  return s;
}

export function townHallLevel(state: GameState): number {
  return state.city.buildings[state.city.townHall]?.level ?? 1;
}

/** March slots: the Town Hall `marchSlots` effect plus research (+1 max). Callers clamp to balance.marchSlotsMax. */
export function marchSlots(state: GameState): number {
  const th = state.city.buildings[state.city.townHall];
  const e = th ? effectAt('town_hall', 'marchSlots', th.level) : undefined;
  return (e?.count ?? 1) + researchBonus(state, 'marchSlots');
}

/** Clan + research march speed percent (capped; the hero's own talent speed is added by marches). */
export function marchSpeedPct(state: GameState): number {
  return researchClanBonus(state, 'marchSpeed');
}
/** Extra vision radius from research (capped at 4); the hero's talent vision is added by fog. */
export function visionBonus(state: GameState): number {
  return researchBonus(state, 'visionRadius');
}
/** Extra scout reveal radius from research (capped at 3). */
export function fogRevealBonus(state: GameState): number {
  return researchBonus(state, 'fogReveal');
}

/** Sum of active buff percentages for a stat (state.buffs). */
export const buffPct = buffSum;
