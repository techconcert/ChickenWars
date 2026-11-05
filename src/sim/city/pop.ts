// Population: cap from houses (and the town hall), used by troops (home, wounded, training, marching) and workers.
import { TROOPS, effectsAt } from '../data/registry';
import type { GameState } from '../state';
import { sortedKeys } from '../util';

/** Housing each completed non-hall building uses up for its workers. */
export const WORKERS_PER_BUILDING = 1;

export interface Population { cap: number; used: number; troops: number; workers: number; free: number }

export function getPopulation(state: GameState): Population {
  let cap = 0;
  let workers = 0;
  for (const id of sortedKeys(state.city.buildings)) {
    const b = state.city.buildings[id];
    if (!b || b.level < 1) continue;
    for (const e of effectsAt(b.type, 'popCap', b.level)) cap += e.amount;
    if (b.type !== 'town_hall') workers += WORKERS_PER_BUILDING;
  }
  let troops = 0;
  for (const id of sortedKeys(state.troops)) {
    const p = state.troops[id];
    const cost = TROOPS[id]?.popCost ?? 1;
    if (p) troops += (p.healthy + p.wounded) * cost;
  }
  for (const j of state.training) troops += j.count * (TROOPS[j.troop]?.popCost ?? 1);
  for (const mid of sortedKeys(state.marches)) {
    const m = state.marches[mid];
    if (!m) continue;
    for (const t of sortedKeys(m.troops)) troops += (m.troops[t] ?? 0) * (TROOPS[t]?.popCost ?? 1);
  }
  const used = troops + workers;
  return { cap, used, troops, workers, free: cap - used };
}
