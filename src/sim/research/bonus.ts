// Research bonus aggregation (docs/systems/research.md): effects of completed techs summed per kind and capped.
import { RESEARCH } from '../data/registry';
import type { EffectData } from '../data/schema';
import type { GameState } from '../state';

/** Default cap on the summed value of one stat from research (+100%). */
export const DEFAULT_RESEARCH_CAP = 100;
/** Per-kind overrides ("+100% per stat except where stated"). Values are in the effect's own unit. */
export const RESEARCH_CAPS: Readonly<Partial<Record<EffectData['kind'], number>>> = {
  buildSpeed: 25, // together with heroes the total build speed bonus is max 25%
  marchSlots: 1,
  researchSlots: 1,
  visionRadius: 4,
  fogReveal: 3,
  tradeStep: 2,
  raidWarning: 1800, // ticks
  woundedRatio: 30,
  trainTime: 50,
  trainSpeed: 100,
  supplyMult: 50,
};

type Filter = Partial<Record<'res' | 'class' | 'troop' | 'building' | 'category' | 'troopClass', string>>;

/** The numeric magnitude of an effect (pct, amount, steps or ticks). */
export function effectValue(e: EffectData): number {
  const r = e as unknown as Record<string, unknown>;
  for (const k of ['pct', 'amount', 'steps', 'ticks']) if (typeof r[k] === 'number') return r[k] as number;
  return 0;
}

/** Effects of completed research in tech-list order of `research.done`. */
export function researchEffects(state: GameState): EffectData[] {
  const out: EffectData[] = [];
  for (const id of state.research.done) {
    const t = RESEARCH[id];
    if (t) out.push(...(t.effects as EffectData[]));
  }
  return out;
}

export function capFor(kind: EffectData['kind']): number {
  return RESEARCH_CAPS[kind] ?? DEFAULT_RESEARCH_CAP;
}

/**
 * Sum of research effects of `kind` (pct / amount / steps / ticks), optionally restricted to effects whose fields
 * equal `filter` (a `capMult` for res 'all' matches any res filter). Clamped to +-cap (see RESEARCH_CAPS).
 */
export function researchBonus(state: GameState, kind: EffectData['kind'], filter?: Filter): number {
  let sum = 0;
  // same order as researchEffects(state), without building the intermediate array (hot: called many times per tick)
  for (const id of state.research.done) {
    const t = RESEARCH[id];
    if (t) for (const e of t.effects as readonly EffectData[]) {
      if (e.kind !== kind) continue;
      if (filter) {
        const r = e as unknown as Record<string, unknown>;
        let ok = true;
        for (const k of Object.keys(filter) as (keyof Filter)[]) {
          const want = filter[k];
          if (want === undefined) continue;
          if (r[k] === want || (k === 'res' && r[k] === 'all')) continue;
          ok = false;
          break;
        }
        if (!ok) continue;
      }
      sum += effectValue(e);
    }
  }
  const cap = capFor(kind);
  return Math.max(-cap, Math.min(cap, sum));
}
