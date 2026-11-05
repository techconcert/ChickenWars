import { createInitialState } from '@sim/init';
import type { GameState } from '@sim/state';
import { makeTestBaseTerrain, makeTestWorldLogicRich } from '@sim/worldgen/testLogic';

/** New game on the rich multi-level test island (7 regions, ramps, lake). */
export function richState(seed = 7, options: Partial<GameState['options']> = {}): GameState {
  return createInitialState(seed, options, { worldLogic: makeTestWorldLogicRich(30), baseTerrain: makeTestBaseTerrain(16, seed) });
}
