// Offline fast-forward (D12, D47). The first OFFLINE_EXACT_TICKS of an absence are simulated tick by tick, so short absences are exact.
// Beyond that, the remaining time is covered in coarse macro steps: each step calls the same systems once at the step's end tick, with
// production, upkeep, healing and node regrowth scaled by the step length, and every march settled at once (gatherers fill up and come
// home, others come home, no battles). It is an approximation on purpose: about 1000 calls instead of 288000 ticks.
import { advance } from './tick';
import type { GameEvent } from './events';
import type { TickCtx } from './ctx';
import type { GameState } from './state';
import { tickAllies } from './systems/allies';
import { tickBandits } from './systems/bandits';
import { tickCity } from './systems/city';
import { tickEconomy } from './systems/economy';
import { tickHeroes } from './systems/heroes';
import { settleMarchesOffline } from './systems/marches';
import { tickMilitary } from './systems/military';
import { tickQuests } from './systems/quests';
import { tickResearch } from './systems/research';
import { tickSeasons } from './systems/seasons';
import { tickNodes } from './systems/world';

/** Ticks simulated exactly before the coarse steps start (5 game minutes at 1x). */
export const OFFLINE_EXACT_TICKS = 3000;
/** Length of one coarse step in ticks; divides the day (600) and the trader interval (300). */
export const OFFLINE_MACRO_TICKS = 300;

/** Runs `total` ticks of absence on `state` (safe mode must already be on) and returns the events produced. */
export function runOffline(state: GameState, total: number): GameEvent[] {
  const events: GameEvent[] = [];
  const exact = Math.min(total, OFFLINE_EXACT_TICKS);
  for (let i = 0; i < exact; i++) events.push(...advance(state));
  let left = total - exact;
  if (left <= 0) return events;
  // align to a step boundary with a few more exact ticks, then settle the marches that are still out
  while (left > 0 && state.tick % OFFLINE_MACRO_TICKS !== 0) { events.push(...advance(state)); left--; }
  const ctx: TickCtx = { events, safeMode: true };
  settleMarchesOffline(state, ctx);
  while (left >= OFFLINE_MACRO_TICKS) {
    state.tick += OFFLINE_MACRO_TICKS;
    left -= OFFLINE_MACRO_TICKS;
    tickSeasons(state, ctx);
    tickCity(state, ctx);
    tickEconomy(state, ctx, OFFLINE_MACRO_TICKS);
    tickMilitary(state, ctx, OFFLINE_MACRO_TICKS);
    tickResearch(state, ctx);
    tickHeroes(state, ctx);
    tickNodes(state, OFFLINE_MACRO_TICKS);
    tickBandits(state, ctx);
    tickAllies(state, ctx);
    tickQuests(state, ctx);
  }
  for (let i = 0; i < left; i++) events.push(...advance(state));
  return events;
}
