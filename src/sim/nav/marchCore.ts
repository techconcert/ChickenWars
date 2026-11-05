// March math and helpers shared by the marches system and tests.
import { BALANCE, TROOPS, WORLD } from '../data/registry';
import { heroStats } from '../heroStats';
import { hashRand } from '../rng';
import { seasonMods } from '../systems/seasons';
import type { GameState, MarchState, PoiState, Res, ResourceId } from '../state';
import { TICKS_PER_MINUTE } from '../constants';
import { sortedKeys } from '../util';
import {
  GATHER_PER_TROOP_PER_MINUTE, MARCH_TICKS_PER_CELL_AT_SPEED10, PROGRESS_PER_STEP,
} from './constants';
import { findPath, stepSlow } from './index';
import { getCaps } from '../city/caps';
import { researchBonus } from '../research/bonus';
import { buffPct, marchSpeedPct } from './modifiers';

export function troopTotal(troops: Record<string, number>): number {
  let n = 0;
  for (const t of Object.keys(troops)) n += troops[t] ?? 0;
  return n;
}

/** Speed of the slowest troop type in the march (troop.speed 10 = 1 cell per 100 ticks). */
export function slowestSpeed(troops: Record<string, number>): number {
  let m = Infinity;
  for (const t of Object.keys(troops)) if ((troops[t] ?? 0) > 0) m = Math.min(m, TROOPS[t]?.speed ?? 10);
  return m === Infinity ? 10 : m;
}

/** Multiplier on march speed: (1 + clan/research/hero pct) x season. */
export function marchSpeedMult(state: GameState, hero: string): number {
  const pct = marchSpeedPct(state) / 100;
  const h = heroStats(state, hero).speed - 1;
  return Math.max(0.1, (1 + pct + h) * seasonMods(state).marchSpeed);
}

/** Ticks to cross one cell at baseline terrain for the given troop speed and multiplier. */
export function ticksPerCell(speed: number, mult = 1): number {
  return (MARCH_TICKS_PER_CELL_AT_SPEED10 * 10) / (speed * mult);
}

/** Progress added per tick while moving onto `next` from `cur`. */
export function progressPerTick(state: GameState, m: MarchState, cur: number, next: number): number {
  const slow = stepSlow(state.world, cur, next);
  // random scouts explore slowly, but walk home (or after a recall) at normal speed
  const auto = m.target.auto && m.state !== 'returning' && m.kind !== 'return' ? BALANCE.autoScout.speedMult : 1;
  return ((PROGRESS_PER_STEP / ticksPerCell(slowestSpeed(m.troops), marchSpeedMult(state, m.hero))) / slow) * auto;
}

export function carryCap(troops: Record<string, number>): number {
  let c = 0;
  for (const t of Object.keys(troops)) c += (troops[t] ?? 0) * (TROOPS[t]?.load ?? 0);
  return c;
}

export function carriedTotal(carried: Res): number {
  let n = 0;
  for (const k of Object.keys(carried) as ResourceId[]) n += carried[k] ?? 0;
  return n;
}

/** Resources gathered per tick by this march (fractional). */
export function gatherPerTick(state: GameState, m: MarchState): number {
  let base = 0;
  for (const t of Object.keys(m.troops)) base += (m.troops[t] ?? 0) * (TROOPS[t]?.gatherRate ?? 0) * GATHER_PER_TROOP_PER_MINUTE;
  const hero = 1 + heroStats(state, m.hero).gather;
  let mult = seasonMods(state).gather * BALANCE.difficulty[state.options.difficulty].gather * BALANCE.gatherMult * (1 + (researchBonus(state, 'gatherMult') + buffPct(state, 'gatherMult')) / 100);
  mult = Math.max(BALANCE.productionFloor, mult);
  return (base * hero * mult) / TICKS_PER_MINUTE;
}

export function upkeepPerMinute(state: GameState, troops: Record<string, number>): number {
  let u = 0;
  for (const t of Object.keys(troops)) u += (troops[t] ?? 0) * (TROOPS[t]?.upkeepFoodPerMinute ?? 0);
  return u * BALANCE.upkeepMult * seasonMods(state).upkeep;
}

export function nodeRespawnTicks(type: string): number {
  return WORLD.nodeTypes.find((t) => t.id === type)?.respawnTicks ?? 1200;
}

/** Adds `amounts` to the city stock capped by storage. Returns what was stored and the overflow per resource. */
export function depositResources(state: GameState, amounts: Res): { stored: Res; lost: Res } {
  const stored: Res = {};
  const lost: Res = {};
  const caps = getCaps(state);
  for (const k of sortedKeys(amounts as Record<string, number>) as ResourceId[]) {
    const amt = Math.floor(amounts[k] ?? 0);
    if (amt <= 0) continue;
    const space = Math.max(0, caps[k] - state.resources[k]);
    const add = Math.min(amt, space);
    state.resources[k] += add;
    if (add > 0) stored[k] = add;
    if (amt > add) lost[k] = amt - add;
  }
  return { stored, lost };
}

/** Position of a march's target when its path was cleared (combat returns with path []). */
export function targetCell(state: GameState, m: MarchState): number {
  const t = m.target;
  if (t.poi && state.world.pois[t.poi]) return state.world.pois[t.poi]!.cell;
  if (t.node && state.world.nodes[t.node]) return state.world.nodes[t.node]!.cell;
  if (t.cell !== undefined) return t.cell;
  return state.world.capitalCell;
}

/** Makes sure a returning march has a path that ends at the capital, starting from where it stands. */
export function ensureHomePath(state: GameState, m: MarchState): void {
  const cap = state.world.capitalCell;
  if (m.path.length > 0 && m.path[m.path.length - 1] === cap) return;
  const from = m.path.length ? m.path[Math.min(m.step, m.path.length - 1)]! : targetCell(state, m);
  m.path = findPath(state.world, from, cap, { allowLocked: true }) ?? [cap];
  m.step = 0;
  m.progress = 0;
}

/** Reverses the remaining way: the march turns around on its current edge. */
export function reverseFromHere(m: MarchState): void {
  const last = m.path.length - 1;
  if (last < 0) return;
  const i = Math.min(m.step, last);
  if (i < last && m.progress > 0) {
    m.path = [m.path[i + 1]!, ...m.path.slice(0, i + 1).reverse()];
    m.progress = Math.max(0, PROGRESS_PER_STEP - m.progress);
  } else {
    m.path = m.path.slice(0, i + 1).reverse();
    m.progress = 0;
  }
  m.step = 0;
}

/** Loot for ruins (scale 0.5) and caches (scale 1) from lootTables[tier]: resource ranges plus the resource-type rare roll. Items are not rolled here. */
export function rollSimpleLoot(state: GameState, poi: PoiState, scale: number): Res {
  const table = WORLD.lootTables.find((t) => t.tier === Math.max(1, Math.min(5, poi.tier)));
  const out: Res = {};
  if (!table) return out;
  const add = (res: ResourceId, v: number): void => { out[res] = (out[res] ?? 0) + v; };
  for (const res of sortedKeys(table.resources) as ResourceId[]) {
    const [lo, hi] = table.resources[res]!;
    const r = hashRand(state.seed, `loot:${res}`, state.tick, poi.id);
    add(res, Math.max(1, Math.round((lo + Math.floor(r * (hi - lo + 1))) * scale)));
  }
  let total = 0;
  for (const e of table.rare) total += e.weight;
  let pick = hashRand(state.seed, 'loot:rare', state.tick, poi.id) * total;
  for (const e of table.rare) {
    if (pick < e.weight) {
      if (e.kind === 'resource') {
        const r = hashRand(state.seed, 'loot:rareamt', state.tick, poi.id);
        add(e.res, Math.round((e.amount[0] + Math.floor(r * (e.amount[1] - e.amount[0] + 1))) * scale));
      }
      break;
    }
    pick -= e.weight;
  }
  return out;
}
