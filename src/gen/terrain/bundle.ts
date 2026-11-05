import { makeHexGrid } from '../hex';
import { buildHeightField } from './field';
import type { HeightField } from './fieldTypes';
import { generateTerrainLogic } from './logic';
import { generatePlacements } from './placement';
import type { Placements } from './placeTypes';
import type { StartTypeParams, TerrainLogic } from './types';

export interface TerrainParams {
  seed: number;
  radius: number;
  startType?: StartTypeParams;
  /** height-field sample spacing, default `defaultSampleSize(radius)` (0.3, or 0.35 for radius >= 50) */
  sampleSize?: number;
  cliffWidth?: number;
  rockVariants?: number;
}

export interface TerrainTimings {
  logicMs: number;
  fieldMs: number;
  placementMs: number;
  totalMs: number;
}

/** Everything the renderer needs for the world terrain. */
export interface TerrainBundle {
  params: TerrainParams;
  logic: TerrainLogic;
  field: HeightField;
  placements: Placements;
  timings: TerrainTimings;
  /** set by the async client: true when generated inside a Web Worker (not the synchronous fallback) */
  viaWorker?: boolean;
  /** number of progress callbacks received (async client only) */
  progressEvents?: number;
}

export type TerrainProgress = (p: number, stage: string) => void;

/**
 * Height-field sample spacing per map radius. The Standard map (radius 60) has 1.9x the samples of Small, so it samples
 * at 0.35 (about 280k samples, roughly 0.95 s in a worker) instead of 0.3 (380k, about 1.35 s); see CHANGELOG M1.
 */
export function defaultSampleSize(radius: number): number {
  return radius >= 50 ? 0.35 : 0.3;
}

export function terrainCacheKey(p: TerrainParams): string {
  const st = p.startType;
  const stKey = st ? (st.id ?? `${st.river ? 1 : 0}/${st.snowBaseline}/${st.islands}`) : 'default';
  return `${p.seed}|${p.radius}|${stKey}|${p.sampleSize ?? defaultSampleSize(p.radius)}|${p.cliffWidth ?? ''}`;
}

/** Synchronous generation (tests, fallback when no Worker). `now` is an injected clock in ms (default: no timing). */
export function generateTerrainSync(params: TerrainParams, onProgress?: TerrainProgress, now: () => number = () => 0): TerrainBundle {
  const t0 = now();
  onProgress?.(0, 'logic');
  const logic = generateTerrainLogic(params.seed, { radius: params.radius, startType: params.startType });
  const t1 = now();
  onProgress?.(0.1, 'field');
  const field = buildHeightField(logic, {
    sampleSize: params.sampleSize ?? defaultSampleSize(params.radius),
    cliffWidth: params.cliffWidth,
    now,
    onProgress: (p) => onProgress?.(0.1 + p * 0.7, 'field'),
  });
  const t2 = now();
  onProgress?.(0.8, 'placement');
  const placements = generatePlacements(field, { rockVariants: params.rockVariants });
  const t3 = now();
  onProgress?.(1, 'done');
  return { params, logic, field, placements, timings: { logicMs: t1 - t0, fieldMs: t2 - t1, placementMs: t3 - t2, totalMs: t3 - t0 } };
}

/** The hex grid holds closures, so it is stripped for postMessage and rebuilt on arrival. */
export type TerrainLogicData = Omit<TerrainLogic, 'grid'>;
export interface TerrainBundleData extends Omit<TerrainBundle, 'logic'> {
  logic: TerrainLogicData;
}

export function toTransferable(b: TerrainBundle): { data: TerrainBundleData; buffers: ArrayBuffer[] } {
  const { grid: _grid, ...logic } = b.logic;
  void _grid;
  const f = b.field;
  const arrays: ArrayBufferView[] = [
    logic.regionOf, logic.level, logic.biome, logic.flags, logic.navCost, logic.path, logic.river, logic.lakeId,
    f.H, f.cellG, f.bioG, f.Lg, f.rampM, f.rampSideM, f.pathM, f.lakeNear, f.wl, f.bnG, f.hnG, ...f.sdfs,
  ];
  const buffers = [...new Set(arrays.map((a) => a.buffer as ArrayBuffer))];
  return { data: { ...b, logic }, buffers };
}

export function fromTransferable(d: TerrainBundleData): TerrainBundle {
  return { ...d, logic: { ...d.logic, grid: makeHexGrid(d.logic.radius) } };
}
