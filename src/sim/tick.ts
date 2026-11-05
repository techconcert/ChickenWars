// advance(): exactly one tick. Order is fixed and tested (architecture section 4, contract section 5).
import { LOG_LIMIT, OFFLINE_CAP_TICKS } from './constants';
import { runOffline } from './offline';
import { applyCommand, validateCommand } from './commands';
import type { Command } from './commands';
import type { TickCtx } from './ctx';
import type { GameEvent } from './events';
import type { GameState } from './state';
import { tickAllies } from './systems/allies';
import { tickBandits } from './systems/bandits';
import { tickCity } from './systems/city';
import { tickCombat } from './systems/combat';
import { tickEconomy } from './systems/economy';
import { tickHeroes } from './systems/heroes';
import { tickMarches } from './systems/marches';
import { tickMilitary } from './systems/military';
import { tickQuests } from './systems/quests';
import { tickResearch } from './systems/research';
import { tickSeasons } from './systems/seasons';
import { tickWorld } from './systems/world';

export const SYSTEMS: readonly { name: string; run: (state: GameState, ctx: TickCtx) => void }[] = [
  { name: 'seasons', run: tickSeasons },
  { name: 'city', run: tickCity },
  { name: 'economy', run: tickEconomy },
  { name: 'military', run: tickMilitary },
  { name: 'research', run: tickResearch },
  { name: 'heroes', run: tickHeroes },
  { name: 'marches', run: tickMarches },
  { name: 'combat', run: tickCombat },
  { name: 'bandits', run: tickBandits },
  { name: 'allies', run: tickAllies },
  { name: 'world', run: tickWorld },
  { name: 'quests', run: tickQuests },
];

/**
 * Runs one tick in place: validate+apply queued commands (rejections become CommandRejected events),
 * run systems in SYSTEMS order, then increment `state.tick`. Returns the events produced.
 */
export function advance(state: GameState, commands: readonly Command[] = []): GameEvent[] {
  const ctx: TickCtx = { events: [], safeMode: state.flags.safeMode };
  for (const cmd of commands) {
    const code = validateCommand(state, cmd);
    if (code) ctx.events.push({ t: 'CommandRejected', tick: state.tick, code, cmd: cmd.t });
    else applyCommand(state, cmd, ctx);
  }
  for (const sys of SYSTEMS) sys.run(state, ctx);
  state.tick += 1;
  if (ctx.events.length) {
    for (const e of ctx.events) state.log.push(e);
    if (state.log.length > LOG_LIMIT) state.log.splice(0, state.log.length - LOG_LIMIT);
  }
  return ctx.events;
}

/** Offline catch-up: up to OFFLINE_CAP_TICKS in safe mode. The first minutes are exact, the rest is fast-forwarded in coarse steps (src/sim/offline.ts). Returns all events. */
export function catchUp(state: GameState, elapsedTicks: number): GameEvent[] {
  const total = Math.min(Math.max(0, Math.floor(elapsedTicks)), OFFLINE_CAP_TICKS);
  const prev = state.flags.safeMode;
  state.flags.safeMode = true;
  const events = runOffline(state, total);
  state.flags.safeMode = prev;
  return events;
}
