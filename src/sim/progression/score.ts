// Cosmetic score for the end screen (docs/systems/progression-and-quests.md). Integer arithmetic only.
import { DAY_TICKS } from '../constants';
import type { GameState } from '../state';

/** Cosmetic weights (not balance): points per stat. */
export const SCORE_WEIGHTS = {
  townHallLevel: 200, boss: 1000, camp: 25, battleWon: 5, hero: 100, questDone: 50, exploredPer: 10, gatheredPer: 100,
  /** Time bonus when won: max(0, timeBonusBase - days * timeBonusPerDay). */
  timeBonusBase: 20000, timeBonusPerDay: 40,
} as const;
const DIFFICULTY_PCT = { easy: 80, normal: 100, hard: 125 } as const;

export function computeScore(state: GameState): number {
  const w = SCORE_WEIGHTS;
  const th = state.city.buildings[state.city.townHall]?.level ?? 1;
  const c = state.quests.counters;
  let pts = th * w.townHallLevel + state.stats.bossesKilled * w.boss + state.stats.campsCleared * w.camp + state.stats.battlesWon * w.battleWon;
  pts += Object.keys(state.heroes).length * w.hero + state.quests.completed.length * w.questDone;
  pts += Math.floor((c.cellsExplored ?? 0) / w.exploredPer) + Math.floor(state.stats.gathered / w.gatheredPer);
  if (state.flags.won) pts += Math.max(0, w.timeBonusBase - Math.floor(state.tick / DAY_TICKS) * w.timeBonusPerDay);
  return Math.floor((pts * DIFFICULTY_PCT[state.options.difficulty]) / 100);
}
