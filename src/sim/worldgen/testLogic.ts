// Deterministic flat island logic for tests and for the app until the real generator is wired.
// Integer maths only (same restrictions as the real logic layer, D20).
import { hash32 } from '../rng';
import type { RegionState, WorldLogicInput } from '../state';
import { centreCellIndex } from '../util';

function cellsOf(radius: number): { q: number; r: number }[] {
  const out: { q: number; r: number }[] = [];
  for (let q = -radius; q <= radius; q++) for (let r = -radius; r <= radius; r++) if (Math.abs(q + r) <= radius) out.push({ q, r });
  return out;
}
const dist = (q: number, r: number): number => (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;

/** Flags: bit0 land, bit1 buildable, bit2 walkable, bit5 coast. navCost 0 = blocked, else 10 (meadow) / 12 (forest) / 8 (beach). */
export function makeTestWorldLogic(radius: number): WorldLogicInput {
  const cells = cellsOf(radius);
  const landR = Math.max(3, radius - 3);
  const homeR = Math.max(2, Math.floor(landR / 3));
  const regionOf: number[] = [];
  const level: number[] = [];
  const biome: number[] = [];
  const flags: number[] = [];
  const navCost: number[] = [];
  const members: number[][] = [[], [], [], [], []];
  cells.forEach(({ q, r }, i) => {
    const d = dist(q, r);
    const land = d <= landR;
    let region = 0;
    if (d > homeR) region = 1 + (q >= 0 ? 1 : 0) + (r >= 0 ? 2 : 0);
    if (land) members[region]?.push(i);
    const b = !land ? 0 : d >= landR - 1 ? 0 : hash32('tl', radius, q, r) % 100 < 25 && d > homeR ? 2 : 1;
    regionOf.push(region);
    level.push(0);
    biome.push(b);
    const coast = land && d === landR;
    flags.push(land ? 1 | (b === 0 ? 0 : 2) | 4 | (coast ? 32 : 0) : 0);
    navCost.push(!land ? 0 : b === 0 ? 8 : b === 2 ? 12 : 10);
  });
  const centre = centreCellIndex(radius);
  const regions: RegionState[] = members.map((m, id) => {
    let sq = 0;
    let sr = 0;
    for (const i of m) { sq += cells[i]?.q ?? 0; sr += cells[i]?.r ?? 0; }
    const aq = m.length ? Math.round(sq / m.length) : 0;
    const ar = m.length ? Math.round(sr / m.length) : 0;
    let best = m[0] ?? centre;
    let bd = Infinity;
    for (const i of m) {
      const c = cells[i];
      if (!c) continue;
      const dd = dist(c.q - aq, c.r - ar);
      if (dd < bd) { bd = dd; best = i; }
    }
    const neighbours = id === 0 ? [1, 2, 3, 4] : [0, id === 1 ? 4 : id - 1, id === 4 ? 1 : id + 1];
    return {
      id, biome: 1, level: 0, centroidCell: id === 0 ? centre : best, cells: m.length, neighbours,
      dangerTier: id === 0 ? 1 : id <= 2 ? 2 : 3, unlocked: id === 0, boss: null, lord: null,
    };
  });
  return { radius, terrainHash: hash32('testlogic', radius), capitalCell: centre, regionOf, level, biome, flags, navCost, regions, ramps: [] };
}

/** Base terrain: grass with scattered forest/rock/water, centre always grass. 0 grass, 1 forest, 2 rock, 3 water, 4 cliff. */
export function makeTestBaseTerrain(radius: number, seed = 1): number[] {
  return cellsOf(radius).map(({ q, r }) => {
    if (dist(q, r) <= 2) return 0;
    const h = hash32('base', seed, q, r) % 100;
    return h < 12 ? 1 : h < 18 ? 2 : h < 20 ? 3 : 0;
  });
}

/**
 * Richer deterministic test island (additive): 7 Voronoi regions (home + a ring of six) on levels [0,1,1,2,2,1,1],
 * ramps wherever adjacent regions differ by exactly one level, cliffs elsewhere, a 3-cell lake on the centroid of
 * region 1, beach rim with coast flags. Real-style nav costs (1..4). Integer maths only. Needs radius >= 24.
 */
export function makeTestWorldLogicRich(radius = 30): WorldLogicInput {
  const cells = cellsOf(radius);
  const N = cells.length;
  const NBQ = [1, 0, -1, -1, 0, 1];
  const NBR = [0, 1, 1, 0, -1, -1];
  const key = (q: number, r: number): number => (q + radius) * (2 * radius + 1) + (r + radius);
  const lookup = new Map<number, number>();
  cells.forEach(({ q, r }, i) => lookup.set(key(q, r), i));
  const nb = (i: number, k: number): number => {
    const c = cells[i]!;
    return lookup.get(key(c.q + NBQ[k]!, c.r + NBR[k]!)) ?? -1;
  };
  const landR = radius - 3;
  const sd = Math.round(landR * 0.6);
  const seeds = [{ q: 0, r: 0 }, ...[0, 1, 2, 3, 4, 5].map((k) => ({ q: NBQ[k]! * sd, r: NBR[k]! * sd }))];
  const REG_LEVEL = [0, 1, 1, 2, 2, 1, 1];
  const REG_BIOME = [1, 2, 1, 3, 4, 3, 2];
  const regionOf: number[] = new Array<number>(N).fill(-1);
  const level: number[] = new Array<number>(N).fill(0);
  const biome: number[] = new Array<number>(N).fill(0);
  const flags: number[] = new Array<number>(N).fill(0);
  const navCost: number[] = new Array<number>(N).fill(0);
  const members: number[][] = seeds.map(() => []);
  const ALT = [0, 2, 1, 4, 3];
  cells.forEach(({ q, r }, i) => {
    const d = dist(q, r);
    if (d > landR) return;
    let best = 0;
    let bd = 1e9;
    seeds.forEach((s, id) => {
      const dd = dist(q - s.q, r - s.r);
      if (dd < bd) { bd = dd; best = id; }
    });
    regionOf[i] = best;
    level[i] = REG_LEVEL[best]!;
    let b = REG_BIOME[best]!;
    if (hash32('rich', radius, q, r) % 100 < 18) b = ALT[b]!;
    if (d >= landR - 1) b = 0;
    biome[i] = b;
    flags[i] = 1 | 2 | 4 | (d === landR ? 32 : 0);
    navCost[i] = [1, 1, 2, 2, 3][b]!;
    members[best]!.push(i);
  });
  // centroids
  const centroid = members.map((m, id) => {
    let sq = 0;
    let sr = 0;
    for (const i of m) { sq += cells[i]!.q; sr += cells[i]!.r; }
    const aq = Math.round(sq / Math.max(1, m.length));
    const ar = Math.round(sr / Math.max(1, m.length));
    let best = m[0] ?? 0;
    let bd = 1e9;
    for (const i of m) {
      const dd = dist(cells[i]!.q - aq, cells[i]!.r - ar);
      if (dd < bd) { bd = dd; best = i; }
    }
    return id === 0 ? centreCellIndex(radius) : best;
  });
  // lake on region 1's centroid + two neighbours (same region only)
  for (const i of [centroid[1]!, nb(centroid[1]!, 0), nb(centroid[1]!, 1)]) {
    if (i >= 0 && regionOf[i] === 1) { flags[i] = 1 | 16; navCost[i] = 0; biome[i] = 1; }
  }
  // region adjacency and ramps
  const adj = new Map<number, number[]>();
  for (let i = 0; i < N; i++) {
    if (regionOf[i]! < 0) continue;
    for (let k = 0; k < 6; k++) {
      const j = nb(i, k);
      if (j < 0 || regionOf[j]! < 0 || regionOf[j] === regionOf[i]) continue;
      const a = regionOf[i]!;
      const b = regionOf[j]!;
      if (a < b) { const kk = a * 16 + b; const l = adj.get(kk) ?? []; l.push(i * 8 + k); adj.set(kk, l); }
    }
  }
  const ramps: WorldLogicInput['ramps'] = [];
  const neighbours: number[][] = seeds.map(() => []);
  for (const kk of [...adj.keys()].sort((x, y) => x - y)) {
    const a = Math.floor(kk / 16);
    const b = kk % 16;
    neighbours[a]!.push(b);
    neighbours[b]!.push(a);
    if (Math.abs(REG_LEVEL[a]! - REG_LEVEL[b]!) !== 1) continue;
    const cands = adj.get(kk)!.map((e) => ({ i: Math.floor(e / 8), j: nb(Math.floor(e / 8), e % 8) }))
      .filter(({ i, j }) => navCost[i]! > 0 && navCost[j]! > 0 && !(flags[i]! & 32) && !(flags[j]! & 32) && biome[i] !== 0 && biome[j] !== 0);
    if (!cands.length) continue;
    cands.sort((x, y) => hash32('ramp', a, b, x.i) - hash32('ramp', a, b, y.i) || x.i - y.i);
    const { i, j } = cands[0]!;
    for (const c of [i, j]) { flags[c] = (flags[c]! | 8) & ~2; navCost[c] = Math.min(9, navCost[c]! + 1); }
    ramps.push({ id: ramps.length, regionA: a, regionB: b, cells: [i, j] });
  }
  const regions: RegionState[] = seeds.map((_, id) => ({
    id, biome: REG_BIOME[id]!, level: REG_LEVEL[id]!, centroidCell: centroid[id]!, cells: members[id]!.length,
    neighbours: neighbours[id]!.sort((x, y) => x - y), dangerTier: id === 0 ? 1 : 2, unlocked: id === 0, boss: null, lord: null,
  }));
  return {
    radius, terrainHash: hash32('testlogic-rich', radius), capitalCell: centreCellIndex(radius),
    regionOf, level, biome, flags, navCost, regions, ramps,
  };
}
