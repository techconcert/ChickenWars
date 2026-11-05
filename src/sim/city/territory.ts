// Builders, territory and placement validation for the base grid.
import { BALANCE, BUILDINGS, effectAt, maxCountAt } from '../data/registry';
import type { GameState } from '../state';
import { sortedKeys } from '../util';
import { cellDistance } from './grid';

export function townHallLevel(state: GameState): number {
  return state.city.buildings[state.city.townHall]?.level ?? 1;
}

/** 1 + builders effects of completed huts. */
export function getBuilders(state: GameState): number {
  let n = 1;
  for (const id of sortedKeys(state.city.buildings)) {
    const b = state.city.buildings[id];
    if (!b) continue;
    const e = effectAt(b.type, 'builders', b.level);
    if (e) n += e.count;
  }
  return n;
}

export function maxQueueLength(state: GameState): number {
  return Math.max(BALANCE.buildQueueMax, getBuilders(state) + BALANCE.buildQueueExtra);
}

/** Territory radius (hex distance from the town hall) at the current town hall level. */
export function territoryRadius(state: GameState): number {
  const th = state.city.buildings[state.city.townHall];
  const e = th ? effectAt('town_hall', 'territory', th.level) : undefined;
  return Math.min(e?.radius ?? 4, BALANCE.territoryMaxRadius);
}

export function inTerritory(state: GameState, cell: number): boolean {
  const th = state.city.buildings[state.city.townHall];
  if (!th || cell < 0 || cell >= state.city.terrain.length) return false;
  return cellDistance(state.city.radius, th.cell, cell) <= territoryRadius(state);
}

export function buildingAtCell(state: GameState, cell: number): string | null {
  for (const id of sortedKeys(state.city.buildings)) if (state.city.buildings[id]?.cell === cell) return id;
  return null;
}

/** Cell check for the placement ghost: null if buildable, else 'bad_cell' | 'territory' | 'terrain' | 'occupied'. */
export function cellError(state: GameState, cell: number): string | null {
  if (!Number.isInteger(cell) || cell < 0 || cell >= state.city.terrain.length) return 'bad_cell';
  if (!inTerritory(state, cell)) return 'territory';
  if ((state.city.terrain[cell] ?? 0) !== 0) return 'terrain';
  if (buildingAtCell(state, cell) !== null) return 'occupied';
  return null;
}

export function countOfType(state: GameState, type: string): number {
  let n = 0;
  for (const id of Object.keys(state.city.buildings)) if (state.city.buildings[id]?.type === type) n++;
  return n;
}

/** Full build validation without cost/queue checks. Returns an error code or null. */
export function placementError(state: GameState, type: string, cell: number): string | null {
  const def = BUILDINGS[type];
  if (!def) return 'unknown_building';
  const th = townHallLevel(state);
  if (def.unlockTH > th) return 'locked';
  if (countOfType(state, type) >= maxCountAt(type, th)) return 'max_count';
  const c = cellError(state, cell);
  if (c) return c;
  return requiresError(state, type);
}

export function requiresError(state: GameState, type: string): string | null {
  const def = BUILDINGS[type];
  for (const r of def?.requires ?? []) {
    let ok = false;
    for (const id of Object.keys(state.city.buildings)) {
      const b = state.city.buildings[id];
      if (b && b.type === r.building && b.level >= r.level) ok = true;
    }
    if (!ok) return 'requires';
  }
  return null;
}
