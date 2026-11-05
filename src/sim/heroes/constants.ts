// Documented hero/equipment constants (docs/systems/heroes.md). Balance numbers that have a data file live in balance.json.
import type { Res } from '../state';

/** Items can be upgraded this many times (+5 max). */
export const ITEM_MAX_UPGRADE = 5;
/** Each upgrade adds this many percent of the item's base stats. */
export const ITEM_UPGRADE_PCT = 10;
/** Upgrade cost to reach +n: gold GOLD_BASE * n * rarityIndex, ember n * rarityIndex. */
export const ITEM_UPGRADE_GOLD_BASE = 100;
export const RARITY_INDEX: Readonly<Record<string, number>> = { common: 1, uncommon: 2, rare: 3, epic: 4 };
/** Skill ranks run 1..SKILL_RANK_MAX. */
export const SKILL_RANK_MAX = 3;
/** Building that hosts item upgrades and research. */
export const ACADEMY_BUILDING = 'academy';
export const TAVERN_BUILDING = 'tavern';

/** Cost to upgrade an item of `rarity` from +(n-1) to +n. */
export function itemUpgradeCost(rarity: string, n: number): Res {
  const r = RARITY_INDEX[rarity] ?? 1;
  return { gold: ITEM_UPGRADE_GOLD_BASE * n * r, ember: n * r };
}

/** Multiplier applied to an item's base stats at upgrade level `up`. */
export function itemUpgradeMult(up: number): number {
  return 1 + (ITEM_UPGRADE_PCT * Math.max(0, up)) / 100;
}
