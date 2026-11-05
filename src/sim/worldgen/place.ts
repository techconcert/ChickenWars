// Placement helpers shared by worldgen and runtime spawning.
import { CAPITAL_CLEAR_RADIUS, NODE_MIN_DISTANCE, POI_MIN_DISTANCE, cellDistance, gridFor } from '../nav';
import type { GameState, PoiKind } from '../state';

export const HOSTILE: readonly PoiKind[] = ['bandit_camp', 'lair', 'boss'];
const F_LAND = 1, F_WALKABLE = 4, F_RAMP = 8, F_LAKE = 16, F_COAST = 32, F_STEEP = 64;

/** Walkable land, never ramp, lake or coast cells, not next to a lake or river cell and not beside a cliff (the water's soft shore reaches into the neighbour and would drown the marker). */
export function isPlaceable(state: GameState, c: number): boolean {
  const f = state.world.flags[c] ?? 0;
  if (!(f & F_LAND) || !(f & F_WALKABLE) || f & (F_RAMP | F_LAKE | F_COAST | F_STEEP)) return false;
  const g = gridFor(state.world.radius);
  for (let k = 0; k < 6; k++) {
    const n = g.nb[c * 6 + k]!;
    if (n < 0) continue;
    if ((state.world.flags[n] ?? 0) & F_LAKE) return false;
    // a cliff face or ramp slope beside the cell would hide the model behind the terrain or tilt it
    if ((state.world.level[n] ?? 0) !== (state.world.level[c] ?? 0) || (state.world.flags[n] ?? 0) & F_RAMP) return false;
  }
  // no taller ground within 2 cells either: a ledge there would hide the model from the low camera
  const lc = state.world.level[c] ?? 0;
  for (let k = 0; k < 6; k++) {
    const n = g.nb[c * 6 + k]!;
    if (n < 0) continue;
    for (let j = 0; j < 6; j++) {
      const m = g.nb[n * 6 + j]!;
      if (m >= 0 && (state.world.level[m] ?? 0) > lc) return false;
    }
  }
  return (state.world.navCost[c] ?? 0) > 0 && c !== state.world.capitalCell;
}

/** True when a POI of `kind` may stand on `c`: spacing from POIs and nodes, capital clear radius for hostile ones. */
export function poiFits(state: GameState, c: number, kind: PoiKind): boolean {
  const g = gridFor(state.world.radius);
  const cap = state.world.capitalCell;
  const dCap = cellDistance(g, cap, c);
  if (HOSTILE.includes(kind) ? dCap <= CAPITAL_CLEAR_RADIUS : dCap < 2) return false;
  for (const p of Object.values(state.world.pois)) if (cellDistance(g, p.cell, c) < POI_MIN_DISTANCE) return false;
  for (const n of Object.values(state.world.nodes)) if (n.cell === c) return false;
  return true;
}

export function nodeFits(state: GameState, c: number): boolean {
  const g = gridFor(state.world.radius);
  if (cellDistance(g, state.world.capitalCell, c) < 2) return false;
  for (const p of Object.values(state.world.pois)) if (cellDistance(g, p.cell, c) < NODE_MIN_DISTANCE) return false;
  for (const n of Object.values(state.world.nodes)) if (cellDistance(g, n.cell, c) < NODE_MIN_DISTANCE) return false;
  return true;
}
