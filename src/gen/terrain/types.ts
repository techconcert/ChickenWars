import type { HexGrid } from '../hex';
import type { Noise } from '../noise';

/** World height per terrace level. */
export const STEP = 1.7;
export const SEA = -0.28;
export const NO_REGION = 65535;

/** Flags bits (contract section 4). */
export const F_LAND = 1;
export const F_BUILDABLE = 2;
export const F_WALKABLE = 4;
export const F_RAMP = 8;
export const F_LAKE = 16;
export const F_COAST = 32;
/** Set after terrain generation: the height field is sloped or ledged around this cell, so no model may stand on it (not part of the terrain hash). */
export const F_STEEP = 64;

/** Biome ids (contract section 4). */
export const B_BEACH = 0;
export const B_MEADOW = 1;
export const B_FOREST = 2;
export const B_HIGHLAND = 3;
export const B_SNOW = 4;

export interface StartTypeParams {
  /** optional start type id, used for cache keys */
  id?: string;
  river: boolean;
  snowBaseline: number;
  islands: number;
}

export const DEFAULT_START: StartTypeParams = { id: 'river_valley', river: false, snowBaseline: 0, islands: 1 };

export interface TerrainOptions {
  radius: number;
  startType?: StartTypeParams;
}

export interface RegionInfo {
  id: number;
  biome: number;
  level: number;
  centroidCell: number;
  cells: number;
  neighbours: number[];
}

export interface RampInfo {
  id: number;
  regionA: number;
  regionB: number;
  /** high-side cell, low-side cell (both flagged ramp) */
  cells: number[];
  /** centreline low -> high in world units */
  centre: [number, number][];
  width: number;
  /** candidate border edges for the height field, flat triples (highCell, dirIndex, lowCell) */
  cands: number[];
  levelHigh: number;
}

export interface BridgeInfo {
  id: number;
  regionA: number;
  regionB: number;
  cells: number[];
}

export interface LakeInfo {
  id: number;
  region: number;
  level: number;
  cells: number[];
}

export interface TerrainStats {
  landCells: number;
  landRegions: number;
  lakes: number;
  ramps: number;
  bridges: number;
  maxLevel: number;
  mergedCells: number;
  rivers: number;
}

export interface TerrainLogic {
  seed: number;
  radius: number;
  count: number;
  grid: HexGrid;
  startType: StartTypeParams;
  /** compact region id, NO_REGION (65535) for sea */
  regionOf: Uint16Array;
  level: Uint8Array;
  biome: Uint8Array;
  flags: Uint8Array;
  navCost: Uint8Array;
  /** dirt path cells near ramps (render only, hashed) */
  path: Uint8Array;
  /** 0 none, 1 river water, 2 ford */
  river: Uint8Array;
  /** lake index per cell or -1 */
  lakeId: Int16Array;
  regions: RegionInfo[];
  ramps: RampInfo[];
  bridges: BridgeInfo[];
  lakes: LakeInfo[];
  hash: number;
  stats: TerrainStats;
}

/** Plain-array form copied into GameState.world (D19). Sea cells have regionOf = -1. */
export interface PlainLogic {
  radius: number;
  terrainHash: number;
  regionOf: number[];
  level: number[];
  biome: number[];
  flags: number[];
  navCost: number[];
  regions: { id: number; biome: number; level: number; centroidCell: number; cells: number; neighbours: number[] }[];
  ramps: { id: number; regionA: number; regionB: number; cells: number[] }[];
  bridges: { id: number; regionA: number; regionB: number; cells: number[] }[];
}

/** Mutable working data shared between the generation steps. Region ids here are "raw" until compaction. */
export interface World {
  seed: number;
  R: number;
  N: number;
  grid: HexGrid;
  rnd: () => number;
  noise: Noise;
  start: StartTypeParams;
  /** nominal world radius in units */
  worldR: number;
  /** region seed spacing and island radius (world units) */
  S: number;
  IR: number;
  islands: number;
  isLand: Uint8Array;
  region: Int16Array;
  NRg: number;
  rcx: Float64Array;
  rcz: Float64Array;
  rCells: number[][];
  landR: Uint8Array;
  radj: Set<number>[];
  isCoastR: Uint8Array;
  rCenterCell: Int32Array;
  landList: number[];
  /** 1 = bridge cell (carved between islands) */
  bridge: Uint8Array;
  bridgeLinks: { a: number; b: number; cells: number[] }[];
  depth: Int16Array;
  rLevel: Int8Array;
  peak: number;
  maxL: number;
  /** per-cell terrace level; -9 for sea */
  lvl: Int8Array;
  lakeId: Int16Array;
  lakes: LakeInfo[];
  /** 0 none, 1 river water, 2 ford */
  river: Uint8Array;
  riverPath: number[];
  /** hex distance to sea for land cells */
  dsea: Int16Array;
  rBiome: Uint8Array;
  ramps: RampInfo[];
  path: Uint8Array;
  isRampCell: Uint8Array;
  merged: number;
}

export function isWater(w: World, c: number): boolean {
  return w.lakeId[c]! >= 0 || w.river[c] === 1;
}
