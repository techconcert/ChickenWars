// Builds a real-terrain new game (the same construction as src/app/newGame.ts) without the GameClient, for bots and benches.
import { generateBaseTerrain } from '../../src/gen/base/layout';
import { generateTerrainLogic, toPlainLogic } from '../../src/gen/terrain/logic';
import { pickCapitalCell, startTypeParams } from '../../src/app/newGame';
import { BALANCE } from '../../src/sim/data/registry';
import { createInitialState } from '../../src/sim/init';
import type { GameOptions, GameState, WorldLogicInput } from '../../src/sim/state';

const cache = new Map<string, { worldLogic: WorldLogicInput; baseTerrain: number[] }>();

/** Terrain logic is ~30 ms but cached anyway; the arrays are copied by createInitialState. */
export function realWorld(seed: number, radius: number, startType: string): { worldLogic: WorldLogicInput; baseTerrain: number[] } {
  const key = `${seed}:${radius}:${startType}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const logic = generateTerrainLogic(seed, { radius, startType: startTypeParams(startType) });
  const plain = toPlainLogic(logic);
  const capitalCell = pickCapitalCell(plain);
  const worldLogic: WorldLogicInput = {
    radius: plain.radius, terrainHash: plain.terrainHash, capitalCell,
    regionOf: plain.regionOf, level: plain.level, biome: plain.biome, flags: plain.flags, navCost: plain.navCost,
    regions: plain.regions.map((r) => ({ ...r, dangerTier: 1, unlocked: false, boss: null, lord: null })),
    ramps: plain.ramps,
  };
  const out = { worldLogic, baseTerrain: generateBaseTerrain(seed, BALANCE.territoryMaxRadius) };
  cache.set(key, out);
  return out;
}

export interface RealOpts { seed?: number; radius?: number; options?: Partial<GameOptions> }

/** New game on generated terrain (default: seed 1337, small map radius 40, Normal, river_valley, oakwarden). */
export function realState(opts: RealOpts = {}): GameState {
  const seed = opts.seed ?? 1337;
  const startType = opts.options?.startType ?? 'river_valley';
  const w = realWorld(seed, opts.radius ?? 40, startType);
  return createInitialState(seed, { difficulty: 'normal', ...opts.options }, { worldLogic: w.worldLogic, baseTerrain: w.baseTerrain });
}
