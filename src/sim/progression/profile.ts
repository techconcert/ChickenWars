// Cosmetic-only meta progression (no power creep). The platform layer persists a Profile; the sim never reads it.
import type { GameState } from '../state';
import { computeScore } from './score';

export const PROFILE_VERSION = 1;

/** Cosmetic unlock ids. Banner ids map to a colour in the UI; portrait ids to a hero portrait variant. */
export const BANNER_UNLOCKS = { hard_win: { id: 'banner_ember_gold', colour: '#d9a23a' } } as const;
export const PORTRAIT_UNLOCKS = { normal_win: 'portrait_laurel' } as const;

export interface Profile {
  version: number;
  unlockedBanners: string[];
  unlockedPortraits: string[];
  runsWon: number;
  bestScore: number;
}

export function emptyProfile(): Profile {
  return { version: PROFILE_VERSION, unlockedBanners: [], unlockedPortraits: [], runsWon: 0, bestScore: 0 };
}

/** Returns a new profile after a finished (won) run; non-won states change nothing. Idempotent per unlock id. */
export function recordRun(profile: Profile, state: GameState): Profile {
  if (!state.flags.won) return profile;
  const p: Profile = { ...profile, unlockedBanners: profile.unlockedBanners.slice(), unlockedPortraits: profile.unlockedPortraits.slice() };
  p.runsWon += 1;
  p.bestScore = Math.max(p.bestScore, computeScore(state));
  const add = (list: string[], id: string): void => { if (!list.includes(id)) list.push(id); };
  if (state.options.difficulty === 'hard') add(p.unlockedBanners, BANNER_UNLOCKS.hard_win.id);
  if (state.options.difficulty !== 'easy') add(p.unlockedPortraits, PORTRAIT_UNLOCKS.normal_win);
  return p;
}
