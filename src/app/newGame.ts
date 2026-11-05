// New-game construction: terrain logic -> plain arrays + capital cell -> GameClient. Runs on the main thread (logic is ~30 ms).
import { generateBaseTerrain } from '@gen/base/layout';
import { generateTerrainLogic, toPlainLogic, F_BUILDABLE, F_COAST, F_RAMP, F_WALKABLE, B_BEACH } from '@gen/terrain/logic';
import { buildHeightField } from '@gen/terrain/field';
import { clipReason } from '@gen/terrain/steep';
import { F_STEEP } from '@gen/terrain/types';
import type { PlainLogic } from '@gen/terrain/types';
import { makeHexGrid, hexDistance } from '@gen/hex';
import { BALANCE, START_TYPES } from '@sim/data/registry';
import type { GameOptions, WorldLogicInput } from '@sim/state';
import { GameClient } from './game';

export interface NewGameOpts { seed: number; size: GameOptions['size']; difficulty: GameOptions['difficulty']; startType: string; clan: string }

export const WORLD_RADIUS: Record<GameOptions['size'], number> = { small: 40, standard: 60 };

/** Terrain params shared with the renderer so its cache key matches (id + start type flags). */
export function startTypeParams(startType: string): { id: string; river: boolean; snowBaseline: number; islands: number } {
  const st = START_TYPES[startType] ?? START_TYPES['river_valley'];
  if (!st) throw new Error(`unknown start type ${startType}`);
  return { id: st.id, ...st.terrain };
}

/**
 * Deterministic capital: among land cells that are walkable, buildable, not ramp and at least 3 cells from the coast,
 * take the largest region (level 1-ish preferred: lowest level >= 1 when the region sizes tie closely), then the
 * eligible cell of that region nearest the island centre of mass.
 */
export function pickCapitalCell(p: PlainLogic): number {
  const g = makeHexGrid(p.radius);
  // a flat spot has no neighbour on another level (no cliff face beside it) and no ramp cell beside it, so the model never sinks into a slope
  const flat = (c: number): boolean => {
    for (let k = 0; k < 6; k++) {
      const n = g.nb[c * 6 + k]!;
      if (n >= 0 && ((p.level[n] ?? 0) !== (p.level[c] ?? 0) || ((p.flags[n] ?? 0) & F_RAMP) !== 0)) return false;
    }
    // nothing taller within 3 cells, so no ledge between the camera and the model hides it
    const seen = new Set<number>([c]);
    let ring = [c];
    for (let d = 0; d < 3; d++) {
      const next: number[] = [];
      for (const a of ring) for (let k = 0; k < 6; k++) {
        const n = g.nb[a * 6 + k]!;
        if (n < 0 || seen.has(n)) continue;
        seen.add(n);
        if ((p.level[n] ?? 0) > (p.level[c] ?? 0)) return false;
        next.push(n);
      }
      ring = next;
    }
    return true;
  };
  let needFlat = true;
  const ok = (c: number): boolean => {
    const f = p.flags[c] ?? 0;
    return (f & F_WALKABLE) !== 0 && (f & F_BUILDABLE) !== 0 && (f & (F_RAMP | F_STEEP)) === 0 && p.biome[c] !== B_BEACH && (!needFlat || flat(c));
  };
  // distance from coast/sea by BFS over land cells
  const coastD = new Int16Array(g.count).fill(-1);
  const queue: number[] = [];
  for (let c = 0; c < g.count; c++) {
    const land = (p.regionOf[c] ?? -1) >= 0;
    if (!land || ((p.flags[c] ?? 0) & F_COAST) !== 0) { coastD[c] = 0; queue.push(c); }
  }
  for (let h = 0; h < queue.length; h++) {
    const c = queue[h]!;
    for (let k = 0; k < 6; k++) {
      const n = g.nb[c * 6 + k]!;
      if (n >= 0 && coastD[n] === -1) { coastD[n] = coastD[c]! + 1; queue.push(n); }
    }
  }
  // island centre of mass over land
  let sq = 0, sr = 0, n = 0;
  for (let c = 0; c < g.count; c++) if ((p.regionOf[c] ?? -1) >= 0) { sq += g.q[c]!; sr += g.r[c]!; n++; }
  const cq = n ? Math.round(sq / n) : 0;
  const cr = n ? Math.round(sr / n) : 0;
  // region score: size, preferring low levels (level 1-ish = level <= 1)
  const regions = [...p.regions].sort((a, b) => {
    const la = a.level <= 1 ? 1 : 0;
    const lb = b.level <= 1 ? 1 : 0;
    return (lb - la) || (b.cells - a.cells) || (a.id - b.id);
  });
  for (const strict of [true, false]) for (const minCoast of [3, 2, 1, 0]) {
    needFlat = strict;
    for (const reg of regions) {
      let best = -1;
      let bd = Infinity;
      for (let c = 0; c < g.count; c++) {
        if (p.regionOf[c] !== reg.id || !ok(c) || (coastD[c] ?? 0) < minCoast) continue;
        const d = hexDistance(g.q[c]!, g.r[c]!, cq, cr) * 1000 + c;
        if (d < bd) { bd = d; best = c; }
      }
      if (best >= 0) return best;
    }
  }
  return p.regions[0]?.centroidCell ?? 0;
}

/** Terrain logic, steep-cell marking on the real height field, capital pick and the world logic input. Shared with the clipping test. */
export function buildWorldLogic(seed: number, radius: number, startType: string, sampleSize = 0.3): { logic: ReturnType<typeof generateTerrainLogic>; plain: PlainLogic; field: ReturnType<typeof buildHeightField>; capitalCell: number; worldLogic: WorldLogicInput } {
  const logic = generateTerrainLogic(seed, { radius, startType: startTypeParams(startType) });
  const plain = toPlainLogic(logic);
  const field = buildHeightField(logic, { sampleSize });
  const g = makeHexGrid(plain.radius);
  for (let c = 0; c < g.count; c++) {
    if (((plain.flags[c] ?? 0) & F_WALKABLE) !== 0 && clipReason(field, g.x[c] ?? 0, g.z[c] ?? 0)) plain.flags[c] = (plain.flags[c] ?? 0) | F_STEEP;
  }
  const capitalCell = pickCapitalCell(plain);
  const worldLogic: WorldLogicInput = {
    radius: plain.radius, terrainHash: plain.terrainHash, capitalCell,
    regionOf: plain.regionOf, level: plain.level, biome: plain.biome, flags: plain.flags, navCost: plain.navCost,
    regions: plain.regions.map((r) => ({ ...r, dangerTier: 1, unlocked: false, boss: null, lord: null })),
    ramps: plain.ramps, bridges: plain.bridges,
  };
  return { logic, plain, field, capitalCell, worldLogic };
}

export function createNewGame(opts: NewGameOpts): GameClient {
  const radius = WORLD_RADIUS[opts.size];
  const { worldLogic } = buildWorldLogic(opts.seed, radius, opts.startType);
  const baseTerrain = generateBaseTerrain(opts.seed, BALANCE.territoryMaxRadius);
  return GameClient.create(opts.seed, { size: opts.size, difficulty: opts.difficulty, startType: opts.startType, clan: opts.clan }, { worldLogic, baseTerrain });
}
