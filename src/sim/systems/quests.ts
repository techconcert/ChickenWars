// Quests system (docs/systems/progression-and-quests.md): derive counters from this tick's events, check the Reign win,
// then advance the quest chain and triggered side quests. Runs last in the tick order.
import type { TickCtx } from '../ctx';
import { tickProgression } from '../progression';
import { deriveCounters } from '../quests/counters';
import { ensureActiveBase, runQuests } from '../quests';
import type { GameState } from '../state';

export function tickQuests(state: GameState, ctx: TickCtx): void {
  ensureActiveBase(state);
  const seen = ctx.events.slice();
  deriveCounters(state, seen);
  tickProgression(state, ctx, seen);
  runQuests(state, ctx);
}
