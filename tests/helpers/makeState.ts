import { createInitialState } from '@sim/init';
import type { GameOptions, GameState } from '@sim/state';
import { makeTestBaseTerrain, makeTestWorldLogic } from '@sim/worldgen/testLogic';

export interface MakeStateOpts { seed?: number; options?: Partial<GameOptions>; worldRadius?: number; baseRadius?: number }

/** Fresh state on the flat test island. `patch` may mutate the result for scenario setup. */
export function makeState(opts: MakeStateOpts = {}, patch?: (s: GameState) => void): GameState {
  const seed = opts.seed ?? 1337;
  const s = createInitialState(seed, opts.options ?? {}, {
    worldLogic: makeTestWorldLogic(opts.worldRadius ?? 20),
    baseTerrain: makeTestBaseTerrain(opts.baseRadius ?? 16, seed),
  });
  patch?.(s);
  return s;
}
