import { FNV_OFFSET, fnvArray, fnvInt } from '../noise';
import { assignBiomes, cellBiome, cellFlags, cellNavCost } from './biomes';
import { assignCellLevels, assignRegionLevels, carveRiver, placeLakes } from './levels';
import { buildRamps } from './ramps';
import { buildRegions, createWorld } from './regions';
import {
  DEFAULT_START, F_LAND, F_RAMP, F_WALKABLE, NO_REGION,
  type BridgeInfo, type PlainLogic, type RegionInfo, type TerrainLogic, type TerrainOptions, type World,
} from './types';

export * from './types';

/**
 * Pure, deterministic terrain logic layer (docs/04-terrain.md T5, contract sections 3 and 4).
 * Only integer hash noise and basic arithmetic (+ - * / floor sqrt abs min max) are used.
 */
export function generateTerrainLogic(seed: number, opts: TerrainOptions): TerrainLogic {
  const start = { ...DEFAULT_START, ...(opts.startType ?? {}) };
  const w = createWorld(seed | 0, opts.radius, start);
  buildRegions(w);
  assignRegionLevels(w);
  carveRiver(w);
  placeLakes(w);
  assignBiomes(w);
  assignCellLevels(w);
  buildRamps(w);
  return assemble(w);
}

function assemble(w: World): TerrainLogic {
  const { N, grid } = w;
  // compact region ids
  const cid = new Int32Array(w.NRg).fill(-1);
  let nReg = 0;
  for (const r of w.landList) cid[r] = nReg++;
  const regionOf = new Uint16Array(N).fill(NO_REGION);
  const level = new Uint8Array(N);
  const biome = new Uint8Array(N);
  const flags = new Uint8Array(N);
  const navCost = new Uint8Array(N);
  const lakeId = w.lakeId.slice();
  let landCells = 0;
  let maxLevel = 0;
  for (let c = 0; c < N; c++) {
    if (!w.isLand[c]) continue;
    landCells++;
    regionOf[c] = cid[w.region[c]!]!;
    level[c] = Math.max(0, w.lvl[c]!);
    if (level[c]! > maxLevel) maxLevel = level[c]!;
    biome[c] = cellBiome(w, c);
    flags[c] = cellFlags(w, c);
    navCost[c] = cellNavCost(w, c, biome[c]!, flags[c]!);
  }
  const regions: RegionInfo[] = w.landList.map((r) => ({
    id: cid[r]!,
    biome: w.rBiome[r]!,
    level: w.rLevel[r]!,
    centroidCell: w.rCenterCell[r]!,
    cells: w.rCells[r]!.length,
    neighbours: [...w.radj[r]!].filter((b) => cid[b]! >= 0).map((b) => cid[b]!).sort((a, b) => a - b),
  }));
  const ramps = w.ramps.map((rp) => ({ ...rp, regionA: cid[rp.regionA]!, regionB: cid[rp.regionB]! }));
  const bridges: BridgeInfo[] = w.bridgeLinks.map((b, i) => ({ id: i, regionA: cid[b.a]!, regionB: cid[b.b]!, cells: b.cells }));
  const logic: TerrainLogic = {
    seed: w.seed, radius: w.R, count: N, grid, startType: w.start, regionOf, level, biome, flags, navCost,
    path: w.path.slice(), river: w.river.slice(), lakeId, regions, ramps, bridges, lakes: w.lakes, hash: 0,
    stats: {
      landCells, landRegions: nReg, lakes: w.lakes.length, ramps: ramps.length, bridges: bridges.length, maxLevel, mergedCells: w.merged,
      rivers: w.riverPath.length,
    },
  };
  logic.hash = hashLogic(logic);
  return logic;
}

/** FNV-1a over the arrays of the logic layer. */
export function hashLogic(l: TerrainLogic): number {
  let h = FNV_OFFSET;
  h = fnvInt(h, l.seed);
  h = fnvInt(h, l.radius);
  h = fnvArray(h, l.regionOf);
  h = fnvArray(h, l.level);
  h = fnvArray(h, l.biome);
  h = fnvArray(h, l.flags);
  h = fnvArray(h, l.navCost);
  h = fnvArray(h, l.path);
  h = fnvArray(h, l.river);
  for (const r of l.regions) {
    h = fnvInt(h, r.id);
    h = fnvInt(h, r.biome);
    h = fnvInt(h, r.level);
    h = fnvInt(h, r.centroidCell);
    h = fnvInt(h, r.cells);
    h = fnvArray(h, r.neighbours);
  }
  for (const r of l.ramps) {
    h = fnvInt(h, r.id);
    h = fnvInt(h, r.regionA);
    h = fnvInt(h, r.regionB);
    h = fnvArray(h, r.cells);
    h = fnvInt(h, Math.round(r.width * 1000));
  }
  for (const b of l.bridges) {
    h = fnvInt(h, b.regionA);
    h = fnvInt(h, b.regionB);
    h = fnvArray(h, b.cells);
  }
  return h >>> 0;
}

/** Plain number arrays matching the sim's WorldLogicInput (D19). Sea cells have regionOf = -1. */
export function toPlainLogic(l: TerrainLogic): PlainLogic {
  const regionOf: number[] = new Array<number>(l.count);
  for (let i = 0; i < l.count; i++) regionOf[i] = l.regionOf[i] === NO_REGION ? -1 : l.regionOf[i]!;
  return {
    radius: l.radius,
    terrainHash: l.hash,
    regionOf,
    level: Array.from(l.level),
    biome: Array.from(l.biome),
    flags: Array.from(l.flags),
    navCost: Array.from(l.navCost),
    regions: l.regions.map((r) => ({ ...r, neighbours: r.neighbours.slice() })),
    ramps: l.ramps.map((r) => ({ id: r.id, regionA: r.regionA, regionB: r.regionB, cells: r.cells.slice() })),
    bridges: l.bridges.map((b) => ({ id: b.id, regionA: b.regionA, regionB: b.regionB, cells: b.cells.slice() })),
  };
}

/** Movement between neighbouring cells: both walkable, same level, or one level apart across a ramp cell. */
export function canStep(l: { level: ArrayLike<number>; flags: ArrayLike<number> }, a: number, b: number): boolean {
  const fa = l.flags[a]!;
  const fb = l.flags[b]!;
  if (!(fa & F_WALKABLE) || !(fb & F_WALKABLE)) return false;
  const d = Math.abs(l.level[a]! - l.level[b]!);
  if (d === 0) return true;
  return d === 1 && ((fa | fb) & F_RAMP) !== 0;
}

/** Cells reachable from `from` over walkable cells with canStep (BFS). Returns a visited mask. */
export function reachable(l: TerrainLogic, from: number): Uint8Array {
  const seen = new Uint8Array(l.count);
  const q = [from];
  seen[from] = 1;
  for (let h = 0; h < q.length; h++) {
    const c = q[h]!;
    for (let k = 0; k < 6; k++) {
      const b = l.grid.nb[c * 6 + k]!;
      if (b >= 0 && !seen[b] && canStep(l, c, b)) { seen[b] = 1; q.push(b); }
    }
  }
  return seen;
}

export function isLandCell(l: TerrainLogic, c: number): boolean {
  return (l.flags[c]! & F_LAND) !== 0;
}
