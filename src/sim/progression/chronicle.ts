// Chronicle: the player-facing milestone log (progression-and-quests.md). Pure helpers over state.chronicle.
import type { GameState } from '../state';

/** Oldest entries are dropped beyond this many (keeps saves small; the end screen shows the latest). */
export const CHRONICLE_LIMIT = 500;

export function addChronicle(state: GameState, text: string): void {
  state.chronicle.push({ tick: state.tick, text });
  if (state.chronicle.length > CHRONICLE_LIMIT) state.chronicle.splice(0, state.chronicle.length - CHRONICLE_LIMIT);
}
