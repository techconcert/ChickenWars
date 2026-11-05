// Tavern: deterministic rotating candidates.
import { BALANCE, BUILDINGS, HERO_LIST, effectsAt } from '../data/registry';
import { hash32 } from '../rng';
import type { GameState } from '../state';
import { sortedKeys } from '../util';
import { TAVERN_BUILDING } from './constants';

export function tavernLevel(state: GameState): number {
  let best = 0;
  if (!BUILDINGS[TAVERN_BUILDING]) return 0;
  for (const id of sortedKeys(state.city.buildings)) {
    const b = state.city.buildings[id];
    if (b && b.type === TAVERN_BUILDING && b.level > best) best = b.level;
  }
  return best;
}

/** Number of candidates the best tavern offers. */
export function candidateCount(state: GameState): number {
  const lvl = tavernLevel(state);
  if (lvl < 1) return 0;
  let n = 0;
  for (const e of effectsAt(TAVERN_BUILDING, 'heroCandidates', lvl)) n += e.count;
  return n;
}

/** Candidates for rotation `cycle`: unowned tavern heroes ordered by a hash of (seed, cycle, id). */
export function rollCandidates(state: GameState, cycle: number, count: number): string[] {
  const pool = HERO_LIST.filter((h) => h.recruit.kind === 'tavern' && !state.heroes[h.id]).map((h) => h.id);
  pool.sort((a, b) => hash32(state.seed, 'tavern', cycle, a) - hash32(state.seed, 'tavern', cycle, b) || (a < b ? -1 : 1));
  return pool.slice(0, count);
}

/** Refreshes the candidate list when due. */
export function refreshTavern(state: GameState): void {
  if (tavernLevel(state) < 1) return;
  if (state.tick < state.tavern.refreshAt) return;
  const every = BALANCE.tavernRefreshTicks;
  const cycle = Math.floor(state.tick / every);
  state.tavern.candidates = rollCandidates(state, cycle, candidateCount(state));
  state.tavern.refreshAt = (cycle + 1) * every;
}
