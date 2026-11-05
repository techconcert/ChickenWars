// Runtime and worldgen POI construction. spawnCampNear is reused by events and the bandits system.
import { BALANCE, TROOPS, WORLD } from '../data/registry';
import { cellDistance, gridFor, reachableFrom } from '../nav';
import { hash32, hashRand } from '../rng';
import type { GameState, PoiState, Stack } from '../state';
import { isPlaceable, poiFits } from './place';

/** Strength heuristic for arbitrary stacks: sum of count x (atk+def) x 0.15 (matches banditCamps tier 1/2 values). */
export function stackStrength(stacks: readonly Stack[]): number {
  let s = 0;
  for (const st of stacks) {
    const t = TROOPS[st.troop];
    if (t) s += st.count * (t.atk + t.def) * 0.15;
  }
  return Math.round(s);
}

/** Camp tier for a region danger tier (tier 6 regions use 5). */
export function campTier(regionTier: number): number {
  return Math.max(1, Math.min(5, regionTier));
}

/** Contract section 6: level = (tier-1)*5 + 1 + floor(4*(strength-base)/(cap-base)), clamped to the tier band. `strength` may be difficulty-scaled; pass the multiplier to undo it. */
export function campLevel(tier: number, strength: number, difficultyMult = 1): number {
  const def = WORLD.banditCamps.find((c) => c.tier === tier);
  if (!def) return 1;
  const raw = strength / difficultyMult;
  const f = Math.floor((4 * (raw - def.baseStrength)) / (def.tierCap - def.baseStrength));
  return (tier - 1) * 5 + 1 + Math.max(0, Math.min(4, f));
}

function newPoi(state: GameState, kind: PoiState['kind'], cell: number, tier: number): PoiState {
  const id = `poi_${state.nextId++}`;
  const poi: PoiState = {
    id, kind, cell, region: state.world.regionOf[cell] ?? -1, tier: Math.min(5, tier), level: 0, active: true,
    troops: [], strength: 0, respawnAt: null, raidReadyAt: 0,
  };
  state.world.pois[id] = poi;
  return poi;
}

function diffMult(state: GameState): number {
  return BALANCE.difficulty[state.options.difficulty].banditStrength;
}

/**
 * Creates a bandit camp POI at `cell` with troops scaled to `strength` (default: tier base x difficulty).
 * `growth` in 0..1 places the strength between base and cap (worldgen variety).
 */
export function makeCamp(state: GameState, cell: number, tier: number, growth = 0): PoiState {
  const t = campTier(tier);
  const def = WORLD.banditCamps.find((c) => c.tier === t)!;
  const raw = Math.round(def.baseStrength + (def.tierCap - def.baseStrength) * growth);
  const dm = diffMult(state);
  const poi = newPoi(state, 'bandit_camp', cell, t);
  poi.strength = Math.round(raw * dm);
  const scale = raw / def.baseStrength;
  poi.troops = def.troops.map((s) => ({ troop: s.troop, count: Math.max(1, Math.round(s.count * scale)) }));
  poi.level = campLevel(t, raw);
  // first raid not before 3 days, staggered by the seed
  poi.raidReadyAt = 1800 + (hash32(state.seed, 'raid0', poi.id) % 600);
  return poi;
}

export function makeLair(state: GameState, cell: number, tier: number): PoiState {
  const t = campTier(tier);
  const def = WORLD.banditCamps.find((c) => c.tier === t)!;
  const poi = newPoi(state, 'lair', cell, t);
  poi.troops = def.troops.map((s) => ({ troop: s.troop, count: Math.round(s.count * 1.6) }));
  poi.strength = Math.round(def.baseStrength * 1.6 * diffMult(state));
  poi.level = Math.min(25, t * 5);
  return poi;
}

export function makeBoss(state: GameState, cell: number, regionTier: number): PoiState | null {
  const def = WORLD.bosses.find((b) => b.tier === Math.max(2, Math.min(6, regionTier)));
  if (!def) return null;
  const poi = newPoi(state, 'boss', cell, regionTier);
  poi.bossId = def.id;
  poi.troops = def.troops.map((s) => ({ troop: s.troop, count: s.count }));
  poi.strength = Math.round(stackStrength(def.troops) * (1 + def.heroLevel * 0.05) * diffMult(state));
  poi.level = Math.min(25, def.tier * 5);
  return poi;
}

export function makeSimplePoi(state: GameState, kind: 'ruin' | 'shrine' | 'cache' | 'village', cell: number, tier: number): PoiState {
  const poi = newPoi(state, kind, cell, tier);
  poi.explored = false;
  return poi;
}

/**
 * Spawns a camp of `tier` on the nearest valid cell to `cell` (walkable, reachable from the capital, spaced from other POIs,
 * outside the capital clear radius). Deterministic from (seed, tick, nextId). Returns null if nothing fits within 14 cells.
 */
export function spawnCampNear(state: GameState, cell: number, tier: number): PoiState | null {
  const w = state.world;
  const g = gridFor(w.radius);
  const reach = reachableFrom(w, w.capitalCell);
  const cands: { c: number; d: number; h: number }[] = [];
  for (let c = 0; c < g.count; c++) {
    if (!reach[c]) continue;
    const d = cellDistance(g, c, cell);
    if (d > 14 || !isPlaceable(state, c) || !poiFits(state, c, 'bandit_camp')) continue;
    cands.push({ c, d, h: hash32(state.seed, 'spawnCamp', state.tick, state.nextId, c) });
  }
  if (!cands.length) return null;
  cands.sort((a, b) => a.d - b.d || a.h - b.h || a.c - b.c);
  const pick = cands[0]!;
  return makeCamp(state, pick.c, tier, 0);
}

/** A seeded reachable cell between `minD` and `maxD` from `centre` (used by events). Falls back to `centre`. */
export function seededCellNear(state: GameState, centre: number, minD: number, maxD: number, salt: string): number {
  const g = gridFor(state.world.radius);
  const reach = reachableFrom(state.world, state.world.capitalCell);
  const list: number[] = [];
  for (let c = 0; c < g.count; c++) {
    if (!reach[c] || !isPlaceable(state, c)) continue;
    const d = cellDistance(g, c, centre);
    if (d >= minD && d <= maxD) list.push(c);
  }
  if (!list.length) return centre;
  return list[Math.floor(hashRand(state.seed, salt, state.tick, state.nextId) * list.length)]!;
}
