// Resource payment helpers shared by the city, military and economy systems.
import type { GameState, Res, ResourceId } from '../state';

export const RES_KEYS: readonly ResourceId[] = ['food', 'wood', 'stone', 'gold', 'ember'];

export function canAfford(state: GameState, cost: Res): boolean {
  for (const k of RES_KEYS) if ((cost[k] ?? 0) > state.resources[k]) return false;
  return true;
}

export function pay(state: GameState, cost: Res): void {
  for (const k of RES_KEYS) state.resources[k] -= cost[k] ?? 0;
}

/** Refund `frac` of `cost` (floored per resource). Refunds may exceed the cap; production never reduces stock. */
export function refund(state: GameState, cost: Res, frac: number): void {
  for (const k of RES_KEYS) state.resources[k] += Math.floor((cost[k] ?? 0) * frac);
}

export function scaleCost(cost: Res, mult: number): Res {
  const out: Res = {};
  for (const k of RES_KEYS) if (cost[k] !== undefined) out[k] = Math.round((cost[k] ?? 0) * mult);
  return out;
}
