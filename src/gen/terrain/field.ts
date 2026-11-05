import { makeNoise } from '../noise';
import { worldToCell } from '../hex';
import { fixRamps, initRamps, type Box, type RampCtx } from './fieldRamps';
import type { FieldStats, HeightField } from './fieldTypes';
import { blurArr, clamp, lerp, prof, sdfFromMask, smoothstep } from './sdf';
import { F_LAND, SEA, STEP, type TerrainLogic } from './types';

export type { FieldRamp, FieldStats, HeightField } from './fieldTypes';
export { SLOPE_LIMIT } from './fieldRamps';

export interface FieldOptions {
  /** minimum sample spacing in world units (default 0.3) */
  sampleSize?: number;
  /** maximum samples along the longer axis (keeps radius-60 maps bounded), default 720 */
  maxDim?: number;
  /** cliff profile width where there is no ramp; smaller = sharper faces (prototype 0.22) */
  cliffWidth?: number;
  onProgress?: (p: number) => void;
  /** injected clock in ms, used only for stats.genMs (no performance.now in this file) */
  now?: () => number;
}

const LAKE_W = 1.6;
const RIVER_Y = -0.12;
export const DEFAULT_CLIFF_W = 0.15;

/** Port of the prototype buildField: hex logic -> SDF terraces -> ramps with slope verification (T1 fixes included). */
export function buildHeightField(logic: TerrainLogic, opts: FieldOptions = {}): HeightField {
  const now = opts.now ?? ((): number => 0);
  const t0 = now();
  const progress = opts.onProgress ?? ((): void => {});
  const cliffW = opts.cliffWidth ?? DEFAULT_CLIFF_W;
  const noise = makeNoise(logic.seed);
  const g = logic.grid;
  const N = logic.count;

  let ax0 = 1e9;
  let ax1 = -1e9;
  let az0 = 1e9;
  let az1 = -1e9;
  for (let c = 0; c < N; c++) {
    if (!(logic.flags[c]! & F_LAND)) continue;
    ax0 = Math.min(ax0, g.x[c]!);
    ax1 = Math.max(ax1, g.x[c]!);
    az0 = Math.min(az0, g.z[c]!);
    az1 = Math.max(az1, g.z[c]!);
  }
  const M = 11;
  const x0 = ax0 - M;
  const z0 = az0 - M;
  const x1 = ax1 + M;
  const z1 = az1 + M;
  const h = Math.max(opts.sampleSize ?? 0.3, Math.max(x1 - x0, z1 - z0) / (opts.maxDim ?? 720));
  const GW = Math.floor((x1 - x0) / h) + 1;
  const GH = Math.floor((z1 - z0) / h) + 1;
  const n = GW * GH;

  const warp = (x: number, z: number): [number, number] => [
    x + 0.9 * (0.65 * noise.n2(x * 0.1, z * 0.1) + 0.35 * noise.n2(x * 0.23 + 17, z * 0.23)),
    z + 0.9 * (0.65 * noise.n2(x * 0.1 + 31, z * 0.1 + 7) + 0.35 * noise.n2(x * 0.23 + 5, z * 0.23 + 29)),
  ];
  const cellG = new Int32Array(n);
  const Lg = new Int8Array(n);
  const bioG = new Uint8Array(n);
  const hnG = new Float32Array(n);
  const bnG = new Float32Array(n);
  const pathG = new Float32Array(n);
  let maxLv = 0;
  for (let j = 0; j < GH; j++) {
    for (let i = 0; i < GW; i++) {
      const k = j * GW + i;
      const x = x0 + i * h;
      const z = z0 + j * h;
      const [wx, wz] = warp(x, z);
      const c = worldToCell(g, wx, wz);
      cellG[k] = c;
      const land = c >= 0 && (logic.flags[c]! & F_LAND) !== 0;
      Lg[k] = land ? logic.level[c]! : -1;
      bioG[k] = land ? logic.biome[c]! : 0;
      if (land && logic.level[c]! > maxLv) maxLv = logic.level[c]!;
      if (land && logic.path[c]) pathG[k] = 1;
      hnG[k] = 0.05 * noise.n2(x * 0.35 + 11, z * 0.35);
      bnG[k] = noise.n2(x * 0.15 + 3, z * 0.15);
    }
  }
  progress(0.1);
  const sdfs: Float32Array[] = [];
  for (let k = 0; k <= maxLv; k++) {
    const m = new Uint8Array(n);
    for (let i = 0; i < n; i++) m[i] = Lg[i]! >= k ? 1 : 0;
    sdfs.push(sdfFromMask(m, GW, GH, h, 5));
    progress(0.1 + (0.3 * (k + 1)) / (maxLv + 1));
  }
  const bil = (arr: Float32Array, x: number, z: number): number => {
    let fx = (x - x0) / h;
    let fz = (z - z0) / h;
    fx = clamp(fx, 0, GW - 1.001);
    fz = clamp(fz, 0, GH - 1.001);
    const i = fx | 0;
    const j = fz | 0;
    const tx = fx - i;
    const tz = fz - j;
    const k = j * GW + i;
    return (arr[k]! * (1 - tx) + arr[k + 1]! * tx) * (1 - tz) + (arr[k + GW]! * (1 - tx) + arr[k + GW + 1]! * tx) * tz;
  };
  const nearestL = (x: number, z: number): number => Lg[clamp(Math.round((z - z0) / h), 0, GH - 1) * GW + clamp(Math.round((x - x0) / h), 0, GW - 1)]!;

  // lakes (surface = basin level + 0.45) and river water (level 0): soft-shore mask + water level per sample
  const lakeNear = new Float32Array(n);
  const wl = new Float32Array(n).fill(SEA);
  const addWater = (mask: Uint8Array, y: number): void => {
    const sd = sdfFromMask(mask, GW, GH, h, 3);
    for (let i = 0; i < n; i++) {
      const v = smoothstep(-3.0, -0.5, sd[i]!);
      if (v > lakeNear[i]!) lakeNear[i] = v;
      if (sd[i]! > -2.2) wl[i] = y;
    }
  };
  for (const lk of logic.lakes) {
    const m = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const c = cellG[i]!;
      m[i] = c >= 0 && logic.lakeId[c] === lk.id ? 1 : 0;
    }
    addWater(m, lk.level * STEP + 0.45);
  }
  if (logic.stats.rivers > 0) {
    const m = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const c = cellG[i]!;
      m[i] = c >= 0 && logic.river[c] === 1 ? 1 : 0;
    }
    addWater(m, RIVER_Y);
  }
  const pathM = blurArr(pathG, GW, GH, 3, 2);
  for (let i = 0; i < n; i++) pathM[i] = Math.min(1, pathM[i]! * 1.7);
  progress(0.5);

  const rampM = new Float32Array(n);
  const rampSideM = new Float32Array(n);
  const wG = new Float32Array(n);
  const H = new Float32Array(n);
  const ovW = new Float32Array(n);
  const ovY = new Float32Array(n);
  const heightAtSample = (k: number): number => {
    const w = Math.max(lerp(wG[k]!, LAKE_W, lakeNear[k]!), wG[k]!);
    const s0 = sdfs[0]![k]!;
    let hh = -2.0 * (1 - smoothstep(-3.6, 0.9 + 0.5 * bnG[k]!, s0));
    for (let q = 1; q <= maxLv; q++) hh += STEP * prof(sdfs[q]![k]! / w);
    hh += hnG[k]!;
    if (lakeNear[k]! > 0.7) hh = lerp(hh, Math.min(hh, wl[k]! - 0.55), smoothstep(0.7, 0.95, lakeNear[k]!));
    if (ovW[k]! > 0) hh = lerp(hh, ovY[k]!, ovW[k]!);
    return hh;
  };
  const computeH = (boxes?: Box[]): void => {
    if (!boxes) {
      for (let k = 0; k < n; k++) H[k] = heightAtSample(k);
      return;
    }
    for (const b of boxes) for (let j = b.j0; j <= b.j1; j++) for (let i = b.i0; i <= b.i1; i++) H[j * GW + i] = heightAtSample(j * GW + i);
  };
  const ctx: RampCtx = {
    x0, z0, h, GW, GH, noise, Lg, sdfs, rampM, rampSideM, ovW, ovY, wG, cliffW, computeH, hAt: (x, z) => bil(H, x, z), bil, nearestL,
    edgeNoise: new Float64Array(n), edgeNoiseSet: new Uint8Array(n),
  };
  wG.fill(cliffW);
  computeH();
  const { ramps, cands } = initRamps(ctx, logic);
  progress(0.6);
  fixRamps(ctx, ramps, cands);
  progress(0.95);

  const slopes = ramps.map((r) => r.maxSlope);
  const stats: FieldStats = {
    rampCount: ramps.length,
    maxSlope: slopes.length ? Math.max(...slopes) : 0,
    slopes,
    okCount: ramps.filter((r) => r.ok).length,
    widened: ramps.filter((r) => r.widened).length,
    rerouted: ramps.filter((r) => r.rerouted).length,
    lengthened: ramps.filter((r) => r.lengthened).length,
    thinPlateaus: ramps.filter((r) => r.thin).length,
    lowRise: ramps.filter((r) => r.rise < 1.0).length,
    genMs: now() - t0,
    samples: n,
  };
  progress(1);
  return { x0, z0, h, GW, GH, n, H, sdfs, maxLv, cellG, bioG, Lg, rampM, rampSideM, pathM, lakeNear, wl, bnG, hnG, ramps, stats, seed: logic.seed };
}
