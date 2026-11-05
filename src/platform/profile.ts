// Cosmetic profile (docs/systems/progression-and-quests.md): persisted in localStorage 'hl-profile'. Never affects start power.
import { emptyProfile, recordRun } from '@sim/progression/profile';
import type { Profile } from '@sim/progression/profile';
import { dailySeed } from '@sim/progression/daily';
import type { GameState } from '@sim/state';

const KEY = 'hl-profile';
const RECORDED = 'hl-profile-recorded';

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Profile>;
      return { ...emptyProfile(), ...p };
    }
  } catch { /* blocked or corrupt storage: start empty */ }
  return emptyProfile();
}

export function saveProfile(p: Profile): void {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* ignore */ }
}

/** Records a won run once per game (keyed by seed + difficulty + start). Returns the profile and whether it was newly recorded. */
export function recordWin(state: GameState): { profile: Profile; fresh: boolean } {
  const id = `${state.seed}:${state.options.difficulty}:${state.options.startType}:${state.options.clan}`;
  let seen = '';
  try { seen = localStorage.getItem(RECORDED) ?? ''; } catch { /* ignore */ }
  const before = loadProfile();
  if (seen === id) return { profile: before, fresh: false };
  const next = recordRun(before, state);
  saveProfile(next);
  try { localStorage.setItem(RECORDED, id); } catch { /* ignore */ }
  return { profile: next, fresh: true };
}

/** Today's seed from the local calendar date (offline "Daily seed"). */
export function todaysSeed(d: Date = new Date()): number {
  return dailySeed(d.getFullYear(), d.getMonth() + 1, d.getDate());
}
