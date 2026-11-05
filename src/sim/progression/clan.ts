// Clan effect lookup. Systems that already apply clan effects keep their own helpers (city/modifiers.ts, nav/modifiers.ts);
// this is the single read API for the rest (UI summaries, tests, future consumers).
import { CLANS } from '../data/registry';
import type { EffectData } from '../data/schema';
import type { GameState } from '../state';

export type ClanEffectKind = Extract<EffectData['kind'], 'prodMult' | 'adjacency' | 'classDef' | 'classAtk' | 'buildingHp' | 'costMult' | 'marchSpeed' | 'tradeStep' | 'trainTime' | 'heroStartLevel' | 'upkeepMult'>;

/** Optional equality filter on the effect's other fields: { res: 'wood' }, { building: 'lumber_camp' }, { class: 'infantry' }, { category: 'defence' }, { troopClass: 'siege' }. */
export type ClanFilter = Partial<Record<'res' | 'building' | 'class' | 'category' | 'troopClass', string>>;

/** Sum of the chosen clan's effects of `kind` (pct, amount or steps field, whichever the effect has). 0 when none. */
export function clanBonus(state: GameState, kind: ClanEffectKind, filter: ClanFilter = {}): number {
  const clan = CLANS[state.options.clan];
  if (!clan) return 0;
  let total = 0;
  for (const e of clan.effects) {
    if (e.kind !== kind) continue;
    const rec = e as unknown as Record<string, unknown>;
    let ok = true;
    for (const k of Object.keys(filter) as (keyof ClanFilter)[]) if (rec[k] !== filter[k]) ok = false;
    if (!ok) continue;
    total += (rec.pct as number | undefined) ?? (rec.amount as number | undefined) ?? (rec.steps as number | undefined) ?? 0;
  }
  return total;
}

export function clanBanner(state: GameState): string {
  return CLANS[state.options.clan]?.banner ?? '#888888';
}

/** Where each clan effect kind is applied today. `null` means no consumer yet (cosmetic until wired). */
export const CLAN_EFFECT_CONSUMERS: Readonly<Record<string, string | null>> = {
  prodMult: 'city/modifiers.clanProdPct -> city/production',
  adjacency: 'city/modifiers.adjacencyExtraPct -> city/adjacency',
  costMult: 'city/modifiers.troopCostPct -> systems/military.trainCost',
  trainTime: 'city/modifiers.trainTimePct -> systems/military',
  upkeepMult: 'city/modifiers.upkeepPct -> city/production',
  tradeStep: 'city/modifiers.tradeSteps -> systems/economy',
  marchSpeed: 'nav/modifiers.sumPct -> nav/marchCore',
  heroStartLevel: 'init.createInitialState (once at new game)',
  classDef: 'heroes/mods.playerSideMods -> systems/combat, raids/raids, raids/ambush',
  classAtk: 'heroes/mods.playerSideMods -> systems/combat, raids/raids, raids/ambush',
  buildingHp: 'raids/defence.defenceHpPct -> cityDefence',
};
