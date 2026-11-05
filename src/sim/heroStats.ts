// Derived hero stats (docs/systems/heroes.md): base + growth*(level-1), equipped item pct, talent and global effects.
// The heroes agent may extend this (item upgrades, skill ranks); marches and combat read it.
import { HEROES, ITEMS, TALENTS } from './data/registry';
import { itemUpgradeMult } from './heroes/constants';
import type { EffectData } from './data/schema';
import { globalEffects } from './nav/modifiers';
import type { GameState } from './state';
import { sortedKeys } from './util';

export interface HeroStats {
  atk: number; def: number; hp: number; lead: number;
  /** gather bonus as a fraction: the gather rate is multiplied by (1 + gather) */
  gather: number;
  /** hero-specific march speed multiplier (1 = none); global research/clan bonuses are added by marches */
  speed: number;
  /** extra vision radius from talents */
  vision: number;
}

const ZERO: HeroStats = { atk: 0, def: 0, hp: 0, lead: 0, gather: 0, speed: 1, vision: 0 };

export function heroStats(state: GameState, heroId: string): HeroStats {
  const hs = state.heroes[heroId];
  const def = HEROES[heroId];
  if (!hs || !def) return { ...ZERO };
  const L = hs.level - 1;
  const pct = { atk: 0, def: 0, hp: 0, lead: 0, gather: 0 };
  let speedPct = 0;
  let vision = 0;
  const addEffect = (e: EffectData, rank: number): void => {
    if (e.kind === 'heroStat') pct[e.stat] += e.pct * rank;
    else if (e.kind === 'marchSpeed') speedPct += e.pct * rank;
    else if (e.kind === 'visionRadius') vision += e.amount * rank;
  };
  for (const id of sortedKeys(hs.equipment)) {
    const slot = id as keyof typeof hs.equipment;
    const ref = hs.equipment[slot];
    if (!ref) continue;
    const inst = state.inventory[ref];
    const item = ITEMS[inst?.def ?? ref];
    if (!item) continue;
    const up = itemUpgradeMult(inst?.upgrade ?? 0); // +10% of base stats per upgrade
    for (const k of ['atk', 'def', 'hp', 'lead', 'gather'] as const) pct[k] += (item.stats[k] ?? 0) * up;
  }
  for (const tid of sortedKeys(hs.talents)) {
    const t = TALENTS[tid];
    const rank = hs.talents[tid] ?? 0;
    if (t && rank > 0) for (const e of t.node.effects) addEffect(e, rank);
  }
  for (const e of globalEffects(state)) if (e.kind === 'heroStat') pct[e.stat] += e.pct;
  const st = (k: 'atk' | 'def' | 'hp' | 'lead'): number =>
    Math.floor((def.baseStats[k] + def.growth[k] * L) * (1 + pct[k] / 100));
  return {
    atk: st('atk'), def: st('def'), hp: st('hp'), lead: st('lead'),
    gather: def.baseStats.gather + def.growth.gather * L + pct.gather / 100,
    speed: 1 + speedPct / 100, vision,
  };
}
