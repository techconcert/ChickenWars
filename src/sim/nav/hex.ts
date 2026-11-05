// Sim-side hex helpers: thin cached wrappers over src/gen/hex.ts (contract section 2).
import { hexDistance, makeHexGrid } from '../../gen/hex';
import type { HexGrid } from '../../gen/hex';

const grids = new Map<number, HexGrid>();

/** Cached hex grid for a world radius (pure data derived from the radius). */
export function gridFor(radius: number): HexGrid {
  let g = grids.get(radius);
  if (!g) { g = makeHexGrid(radius); grids.set(radius, g); }
  return g;
}

export function cellDistance(g: HexGrid, a: number, b: number): number {
  return hexDistance(g.q[a]!, g.r[a]!, g.q[b]!, g.r[b]!);
}

/** Cell ids within `radius` of `cell` (inclusive), ascending id order. */
export function cellsWithin(g: HexGrid, cell: number, radius: number): number[] {
  const out: number[] = [];
  const q0 = g.q[cell]!;
  const r0 = g.r[cell]!;
  for (let dq = -radius; dq <= radius; dq++) {
    for (let dr = Math.max(-radius, -dq - radius); dr <= Math.min(radius, -dq + radius); dr++) {
      const id = g.idxOf(q0 + dq, r0 + dr);
      if (id >= 0) out.push(id);
    }
  }
  return out.sort((a, b) => a - b);
}

export { hexDistance };
