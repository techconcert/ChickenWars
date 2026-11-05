// Cached hex grid for the base (city) scene, derived from state.city.radius.
import { hexDistance, makeHexGrid } from '../../gen/hex';
import type { HexGrid } from '../../gen/hex';

const cache = new Map<number, HexGrid>();

export function baseGrid(radius: number): HexGrid {
  let g = cache.get(radius);
  if (!g) { g = makeHexGrid(radius); cache.set(radius, g); }
  return g;
}

/** Hex distance between two base cells. */
export function cellDistance(radius: number, a: number, b: number): number {
  const g = baseGrid(radius);
  return hexDistance(g.q[a] ?? 0, g.r[a] ?? 0, g.q[b] ?? 0, g.r[b] ?? 0);
}

/** Neighbour cell ids (6, -1 outside the grid). */
export function cellNeighbours(radius: number, cell: number): number[] {
  const g = baseGrid(radius);
  const out: number[] = [];
  for (let k = 0; k < 6; k++) out.push(g.nb[cell * 6 + k] ?? -1);
  return out;
}
