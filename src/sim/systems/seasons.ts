import { DAY_TICKS, SEASON_IDS } from '../constants';
import type { TickCtx } from '../ctx';
import { emit } from '../ctx';
import { BALANCE, START_TYPES } from '../data/registry';
import type { GameState } from '../state';

/** Days in [spring, summer, autumn, winter] for the state's start type. */
export function seasonLengths(state: GameState): [number, number, number, number] {
  const st = START_TYPES[state.options.startType];
  if (!st) return [20, 20, 20, 20];
  const d = st.season;
  return [d.springDays, d.summerDays, d.autumnDays, d.winterDays];
}

export function seasonId(state: GameState): (typeof SEASON_IDS)[number] {
  return SEASON_IDS[state.season.index] ?? 'spring';
}

/** Season modifiers from balance.json for the current season. */
export function seasonMods(state: GameState): (typeof BALANCE.seasonMods)['spring'] {
  return BALANCE.seasonMods[seasonId(state)];
}

/** Advances the day counter at each day boundary and rolls the season when its length is reached. */
export function tickSeasons(state: GameState, ctx: TickCtx): void {
  if (state.tick === 0 || state.tick % DAY_TICKS !== 0) return;
  const s = state.season;
  s.day += 1;
  s.dayOfSeason += 1;
  emit(ctx, { t: 'DayStarted', tick: state.tick, day: s.day });
  const len = seasonLengths(state)[s.index] ?? 20;
  if (s.dayOfSeason >= len) {
    s.dayOfSeason = 0;
    if (s.index === 3) { s.index = 0; s.year += 1; } else s.index = (s.index + 1) as 0 | 1 | 2 | 3;
    emit(ctx, { t: 'SeasonChanged', tick: state.tick, season: s.index, year: s.year });
  }
}
