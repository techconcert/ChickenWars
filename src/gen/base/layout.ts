import { SQ3, cellDistance, makeHexGrid, worldToCell } from '../hex';
import { hash3i, makeNoise } from '../noise';

import { BASE_CLIFF, BASE_FOREST, BASE_GRASS, BASE_ROCK, BASE_WATER } from './constants';

export * from './constants';
export { buildBaseHeightField, type BaseHeightField } from './heightfield';

const DIR12: readonly (readonly [number, number])[] = [
  [1, 0], [0.8660254037844386, 0.5], [0.5, 0.8660254037844386], [0, 1], [-0.5, 0.8660254037844386], [-0.8660254037844386, 0.5],
  [-1, 0], [-0.8660254037844386, -0.5], [-0.5, -0.8660254037844386], [0, -1], [0.5, -0.8660254037844386], [0.8660254037844386, -0.5],
];

/**
 * Base (city) scene terrain, D23. Per base cell (hex grid radius `radius`, contract cell order):
 * 0 grass, 1 forest, 2 rock, 3 water, 4 cliff. Deterministic from the seed with integer hash noise only.
 * Centre cells within radius 3 are always grass; at least 60% of cells within radius 10 are grass.
 */
export function generateBaseTerrain(seed: number, radius = 16): number[] {
  const g = makeHexGrid(radius);
  const noise = makeNoise(seed ^ 0x5bd1e995);
  const out = new Array<number>(g.count).fill(BASE_GRASS);
  const centre = g.idxOf(0, 0);
  const d0 = (c: number): number => cellDistance(g, c, centre);
  const pointAt = (angleIdx: number, d: number): number => {
    const dir = DIR12[((angleIdx % 12) + 12) % 12]!;
    return worldToCell(g, dir[0] * d * SQ3 * 0.9, dir[1] * d * 1.5 * 0.9);
  };
  const set = (c: number, t: number, onlyGrass = true): void => {
    if (c < 0) return;
    if (onlyGrass && out[c] !== BASE_GRASS) return;
    out[c] = t;
  };
  // forest: a broken ring in the outer part, thinner inside
  for (let c = 0; c < g.count; c++) {
    const d = d0(c);
    if (d < 7) continue;
    const n = noise.n2(g.x[c]! * 0.2 + 13, g.z[c]! * 0.2);
    const need = d >= 12 ? -0.05 : d >= 9 ? 0.45 : 0.7;
    if (n > need) out[c] = BASE_FOREST;
  }
  // forest clumps near the middle ring
  const clumps = 5;
  for (let i = 0; i < clumps; i++) {
    const a = Math.floor(hash3i(seed, i, 1, 21) * 12);
    const d = 6 + Math.floor(hash3i(seed, i, 2, 21) * 5);
    const c0 = pointAt(a, d);
    if (c0 < 0) continue;
    const rad = 1 + Math.floor(hash3i(seed, i, 3, 21) * 2);
    for (let c = 0; c < g.count; c++) if (cellDistance(g, c, c0) <= rad && hash3i(c, i, 4, seed) < 0.85) set(c, BASE_FOREST);
  }
  // rock outcrops
  for (let i = 0; i < 4; i++) {
    const a = Math.floor(hash3i(seed, i, 5, 22) * 12);
    const d = 5 + Math.floor(hash3i(seed, i, 6, 22) * 8);
    const c0 = pointAt(a, d);
    if (c0 < 0) continue;
    set(c0, BASE_ROCK, false);
    for (let k = 0; k < 6; k++) if (hash3i(c0, k, 7, seed) < 0.55) set(g.nb[c0 * 6 + k]!, BASE_ROCK, false);
  }
  // pond
  {
    const a = Math.floor(hash3i(seed, 9, 9, 23) * 12);
    const d = 6 + Math.floor(hash3i(seed, 8, 8, 23) * 4);
    const c0 = pointAt(a, d);
    if (c0 >= 0) {
      out[c0] = BASE_WATER;
      for (let k = 0; k < 6; k++) {
        const n = g.nb[c0 * 6 + k]!;
        if (n >= 0 && hash3i(n, k, 10, seed) < 0.9) out[n] = BASE_WATER;
      }
    }
  }
  // edge cliffs (irregular rim)
  for (let c = 0; c < g.count; c++) {
    const d = d0(c);
    const wob = Math.round(1.2 * noise.n2(g.x[c]! * 0.15 + 7, g.z[c]! * 0.15 + 3));
    if (d >= radius || d + wob >= radius) out[c] = BASE_CLIFF;
  }
  // keep the heart of the city open
  for (let c = 0; c < g.count; c++) if (d0(c) <= 3) out[c] = BASE_GRASS;
  // at least 62% grass within radius 10: convert forest/rock (nearest first) back to grass
  const inner: number[] = [];
  for (let c = 0; c < g.count; c++) if (d0(c) <= 10) inner.push(c);
  let grass = inner.filter((c) => out[c] === BASE_GRASS).length;
  const need = Math.ceil(inner.length * 0.62);
  if (grass < need) {
    const cand = inner.filter((c) => out[c] === BASE_FOREST || out[c] === BASE_ROCK).sort((a, b) => d0(a) - d0(b) || a - b);
    for (const c of cand) {
      if (grass >= need) break;
      out[c] = BASE_GRASS;
      grass++;
    }
  }
  return out;
}
