// Bandits: camp growth, respawn and level sync (M5 static + growth). Raids are added in M7 (stub `checkRaids`).
import { campLevel } from '../combat/power';
import { cellDistance, makeHexGrid, neighbours } from '../../gen/hex';
import type { HexGrid } from '../../gen/hex';
import { DAY_TICKS, SEASON_IDS } from '../constants';
import type { TickCtx } from '../ctx';
import { BALANCE, WORLD } from '../data/registry';
import { hash32, hashRand } from '../rng';
import type { GameState, PoiState } from '../state';
import { launchRaids, tickAmbush, tickRaids } from '../raids';
import { sortedKeys } from '../util';

const gridCache = new Map<number, HexGrid>();
function gridOf(radius: number): HexGrid {
  let g = gridCache.get(radius);
  if (!g) { g = makeHexGrid(radius); gridCache.set(radius, g); }
  return g;
}

/** Ticks until a cleared camp respawns: 3..5 whole days, deterministic. */
export function respawnDelay(seed: number, tick: number, poiId: string): number {
  return DAY_TICKS * (3 + Math.floor(hashRand(seed, 'respawnDelay', tick, poiId) * 3));
}

/** Base data of a camp tier. */
export function campData(tier: number): (typeof WORLD.banditCamps)[number] | undefined {
  return WORLD.banditCamps.find((c) => c.tier === tier) ?? WORLD.banditCamps[0];
}

/** Reset a camp to base strength (used on clear and on respawn). */
export function resetCamp(poi: PoiState): void {
  const d = campData(poi.tier);
  if (!d) return;
  poi.strength = d.baseStrength;
  poi.troops = d.troops.map((s) => ({ troop: s.troop, count: s.count }));
  poi.level = campLevel(poi.tier, poi.strength);
}

/** A free walkable cell near `poi` in its region (BFS up to 4 steps), or the poi's own cell when none. */
export function findRespawnCell(state: GameState, poi: PoiState): number {
  const w = state.world;
  const g = gridOf(w.radius);
  if (g.count !== w.regionOf.length) return poi.cell;
  const taken = new Set<number>([w.capitalCell]);
  for (const id of sortedKeys(w.pois)) { const p = w.pois[id]; if (p && p.id !== poi.id) taken.add(p.cell); }
  for (const id of sortedKeys(w.nodes)) { const n = w.nodes[id]; if (n) taken.add(n.cell); }
  const cands: number[] = [];
  for (const c of nearby(g, poi.cell, 4)) {
    if (c === poi.cell || taken.has(c)) continue;
    if (w.regionOf[c] !== poi.region || (w.navCost[c] ?? 0) <= 0) continue;
    const f = w.flags[c] ?? 0;
    if ((f & 1) === 0 || (f & 4) === 0 || (f & 16) !== 0) continue;
    if (cellDistance(g, c, w.capitalCell) < 3) continue;
    cands.push(c);
  }
  if (!cands.length) return poi.cell;
  cands.sort((a, b) => a - b);
  return cands[hash32(state.seed, 'respawnCell', state.tick, poi.id) % cands.length]!;
}

function nearby(g: HexGrid, from: number, depth: number): number[] {
  const seen = new Set<number>([from]);
  let frontier = [from];
  for (let d = 0; d < depth; d++) {
    const next: number[] = [];
    for (const c of frontier) for (const n of neighbours(g, c)) if (!seen.has(n)) { seen.add(n); next.push(n); }
    frontier = next;
  }
  seen.delete(from);
  return [...seen].sort((a, b) => a - b);
}

/** Daily strength growth of one camp: growthPerDay x season banditGrowth x difficulty banditGrowth, capped at tierCap. */
export function growCamp(state: GameState, poi: PoiState): void {
  const d = campData(poi.tier);
  if (!d || !poi.active) return;
  const season = BALANCE.seasonMods[SEASON_IDS[state.season.index]];
  const mult = season.banditGrowth * BALANCE.difficulty[state.options.difficulty].banditGrowth;
  if (poi.strength >= d.tierCap) { poi.strength = d.tierCap; return; } // also trims camps saved before a cap was lowered
  poi.strength = Math.min(d.tierCap, poi.strength + d.growthPerDay * mult);
}

export function tickBandits(state: GameState, ctx: TickCtx): void {
  const dayRollover = state.tick > 0 && state.tick % DAY_TICKS === 0;
  for (const id of sortedKeys(state.world.pois)) {
    const poi = state.world.pois[id];
    if (!poi || poi.kind !== 'bandit_camp') continue;
    if (!poi.active) {
      if (poi.respawnAt !== null && state.tick >= poi.respawnAt) {
        poi.cell = findRespawnCell(state, poi);
        poi.region = state.world.regionOf[poi.cell] ?? poi.region;
        resetCamp(poi);
        poi.active = true;
        poi.respawnAt = null;
        poi.raidReadyAt = state.tick + DAY_TICKS * 2;
      }
      continue;
    }
    if (dayRollover) growCamp(state, poi);
    const lvl = campLevel(poi.tier, poi.strength);
    if (poi.level !== lvl) poi.level = lvl;
  }
  checkRaids(state, ctx);
}

/** Raids and ambushes (M7): launch, warn, resolve; ambush rolls; nothing hostile happens in safe mode (offline, D12). */
export function checkRaids(state: GameState, ctx: TickCtx): void {
  launchRaids(state, ctx);
  tickRaids(state, ctx);
  tickAmbush(state, ctx);
}
