// Loot rolls with level scaling (user goal 6, D22, contract section 6). Deterministic via hash32/hashRand.
import { BALANCE, ITEM_LIST, WORLD } from '../data/registry';
import type { RareEntryData } from '../data/schema';
import { hash32, hashRand } from '../rng';
import type { PoiState, Res, ResourceId } from '../state';
import { clamp } from '../util';

/** Resource multiplier by POI kind (lairs and bosses pay more than camps). */
const KIND_RES_MULT: Record<string, number> = { bandit_camp: 1, lair: 2, boss: 3 };
/** Number of rare-table rolls by POI kind. */
const KIND_RARE_ROLLS: Record<string, number> = { bandit_camp: 1, lair: 2, boss: 2 };
/** Item source filter by POI kind. */
const KIND_SOURCE: Record<string, 'camp' | 'lair' | 'boss'> = { bandit_camp: 'camp', lair: 'lair', boss: 'boss' };
/** Rough value of one unit of each resource and of each item rarity, only for the UI preview and tests. */
const RES_VALUE: Record<ResourceId, number> = { food: 1, wood: 1, stone: 1.5, gold: 3, ember: 150 };
const RARITY_VALUE: Record<string, number> = { common: 300, uncommon: 1000, rare: 3000, epic: 8000 };

export interface LootResult { resources: Res; items: string[] }

/** Level difference used for scaling: positive when the bandits outlevel the player. */
export function lootDelta(poi: Pick<PoiState, 'level'>, playerLevel: number): number {
  return poi.level - playerLevel;
}

/** Quantity multiplier clamp(1 + delta*qtyPerLevel, minMult, maxMult). */
export function lootQtyMult(delta: number): number {
  const c = BALANCE.lootScaling;
  return clamp(1 + delta * c.qtyPerLevel, c.minMult, c.maxMult);
}

/** Effective weight of a rare entry at `delta`: weight * (1 + bias*delta*rarePerLevel), floored at 0 (D25 g). */
export function rareWeight(e: RareEntryData, delta: number): number {
  if (e.kind === 'none') return e.weight;
  return Math.max(0, e.weight * (1 + e.bias * delta * BALANCE.lootScaling.rarePerLevel));
}

function tableFor(tier: number): (typeof WORLD.lootTables)[number] {
  const t = clamp(tier, 1, 5);
  const found = WORLD.lootTables.find((x) => x.tier === t) ?? WORLD.lootTables[0];
  if (!found) throw new Error('world.json has no lootTables');
  return found;
}

function pickItem(rarity: string, kind: string, seed: number, k: number): string | null {
  const src = KIND_SOURCE[kind] ?? 'camp';
  let pool = ITEM_LIST.filter((i) => i.rarity === rarity && i.source.includes(src));
  if (!pool.length) pool = ITEM_LIST.filter((i) => i.rarity === rarity);
  if (!pool.length) return null;
  return pool[hash32(seed, 'item', k) % pool.length]!.id;
}

function span(range: readonly number[], seed: number, tag: string): number {
  const lo = range[0] ?? 0;
  const hi = range[1] ?? lo;
  return lo + (hash32(seed, tag) % (hi - lo + 1));
}

/** Roll the loot of a cleared POI for a player at `playerLevel` (Town Hall level). */
export function rollLoot(poi: Pick<PoiState, 'kind' | 'tier' | 'level'>, playerLevel: number, seed: number): LootResult {
  const delta = lootDelta(poi, playerLevel);
  const qty = lootQtyMult(delta) * (KIND_RES_MULT[poi.kind] ?? 1);
  const table = tableFor(poi.tier);
  const resources: Res = {};
  const items: string[] = [];
  const add = (r: ResourceId, n: number): void => { if (n > 0) resources[r] = (resources[r] ?? 0) + n; };
  for (const r of Object.keys(table.resources).sort() as ResourceId[]) {
    const range = table.resources[r];
    if (range) add(r, Math.floor(span(range, seed, 'res' + r) * qty));
  }
  const rolls = KIND_RARE_ROLLS[poi.kind] ?? 1;
  for (let k = 0; k < rolls; k++) {
    let total = 0;
    for (const e of table.rare) total += rareWeight(e, delta);
    let x = hashRand(seed, 'rare', k, poi.tier) * total;
    for (const e of table.rare) {
      const w = rareWeight(e, delta);
      if (x < w) {
        if (e.kind === 'resource') add(e.res, Math.floor(span(e.amount, seed, 'rr' + k) * qty));
        else if (e.kind === 'item') { const id = pickItem(e.rarity, poi.kind, seed, k); if (id) items.push(id); }
        break;
      }
      x -= w;
    }
  }
  if (poi.kind === 'boss') {
    const id = pickItem(poi.tier >= 4 ? 'epic' : 'rare', 'boss', seed, 99);
    if (id) items.push(id);
  }
  return { resources, items };
}

/** Probability (0..1) that one rare roll yields something (not 'none') at this level gap. */
export function rareChance(tier: number, delta: number): number {
  const table = tableFor(tier);
  let total = 0;
  let non = 0;
  for (const e of table.rare) {
    const w = rareWeight(e, delta);
    total += w;
    if (e.kind !== 'none') non += w;
  }
  return total > 0 ? non / total : 0;
}

/** Expected value of the loot in abstract "value" units (UI "Reward: rich/poor", tests). Monotone in poi.level. */
export function expectedLootValue(poi: Pick<PoiState, 'kind' | 'tier' | 'level'>, playerLevel: number): number {
  const delta = lootDelta(poi, playerLevel);
  const qty = lootQtyMult(delta) * (KIND_RES_MULT[poi.kind] ?? 1);
  const table = tableFor(poi.tier);
  let v = 0;
  for (const r of Object.keys(table.resources).sort() as ResourceId[]) {
    const range = table.resources[r];
    if (range) v += ((range[0]! + range[1]!) / 2) * qty * RES_VALUE[r];
  }
  let total = 0;
  for (const e of table.rare) total += rareWeight(e, delta);
  let rare = 0;
  if (total > 0) {
    for (const e of table.rare) {
      const p = rareWeight(e, delta) / total;
      if (e.kind === 'resource') rare += p * ((e.amount[0]! + e.amount[1]!) / 2) * qty * RES_VALUE[e.res];
      else if (e.kind === 'item') rare += p * (RARITY_VALUE[e.rarity] ?? 0);
    }
  }
  return v + rare * (KIND_RARE_ROLLS[poi.kind] ?? 1);
}

/** Coarse label for the UI: 'poor' | 'fair' | 'rich' based on the loot value relative to a level-matched camp of the tier. */
export function rewardLabel(poi: Pick<PoiState, 'kind' | 'tier' | 'level'>, playerLevel: number): 'poor' | 'fair' | 'rich' {
  const here = expectedLootValue(poi, playerLevel);
  const even = expectedLootValue(poi, poi.level);
  return here < even * 0.85 ? 'poor' : here > even * 1.15 ? 'rich' : 'fair';
}
