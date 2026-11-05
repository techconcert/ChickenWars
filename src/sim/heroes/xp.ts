// Hero XP, levels and talent points.
import type { TickCtx } from '../ctx';
import { BALANCE, xpForLevel } from '../data/registry';
import type { GameState, HeroState } from '../state';

export { xpForLevel };

/** Total talent points earned: one per level above 1. */
export function talentPointsEarned(hero: HeroState): number {
  return Math.max(0, hero.level - 1);
}
export function talentPointsSpent(hero: HeroState): number {
  let n = 0;
  for (const k of Object.keys(hero.talents)) n += hero.talents[k] ?? 0;
  return n;
}
export function talentPointsAvailable(hero: HeroState): number {
  return talentPointsEarned(hero) - talentPointsSpent(hero);
}

/**
 * Adds XP to a hero and levels it up (cap balance.heroMaxLevel, xp resets to 0 at the cap).
 * Emits HeroLevelUp per level. Returns the number of levels gained.
 */
export function grantHeroXp(state: GameState, heroId: string, xp: number, ctx: TickCtx): number {
  const hero = state.heroes[heroId];
  if (!hero || xp <= 0) return 0;
  let gained = 0;
  hero.xp += Math.floor(xp);
  while (hero.level < BALANCE.heroMaxLevel && hero.xp >= xpForLevel(hero.level)) {
    hero.xp -= xpForLevel(hero.level);
    hero.level += 1;
    gained += 1;
    ctx.events.push({ t: 'HeroLevelUp', tick: state.tick, hero: hero.id, level: hero.level });
  }
  if (hero.level >= BALANCE.heroMaxLevel) hero.xp = 0;
  return gained;
}
