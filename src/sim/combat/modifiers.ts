// Documented combat constants (docs/systems/combat.md) and modifier helpers. All values are per-mille (x1000) integers.
import { BALANCE } from '../data/registry';

/** Hero stat to bonus conversion (permille per stat point). Hero atk 20 gives +10% troop attack. */
export const HERO_ATK_PM = 5;
export const HERO_DEF_PM = 5;
/** Hero hp / this = permille bonus to troop hp (hp 200 gives +10%). */
export const HERO_HP_DIV = 2;
/** Ally heroes (rallies) contribute this share of their stats, in percent. */
export const ALLY_HERO_SHARE_PCT = 50;
/** Camp palisade: +25% defence while no siege is present (combat.md). */
export const PALISADE_DEF_PM = 250;
/** Winter penalty to atk and def (no clan is exempt in data). */
export const WINTER_PM = 50;
/** Rage gained per round, plus casualty share (of starting troops) times this. */
export const RAGE_PER_ROUND = 20;
export const RAGE_CASUALTY_FACTOR = 40;
/** Boss phase 2 (bandits.md): once the boss side is at or below this share of its starting troops (percent) it enrages once. */
export const BOSS_ENRAGE_BELOW_PCT = 50;
/** Enrage bonus to the boss side's attack, permille (+30%). */
export const BOSS_ENRAGE_ATK_PM = 300;
/** Per-stack damage variance in percent around 100 (96..104) driven by the roll seed. */
export const VARIANCE_MIN_PCT = 96;
export const VARIANCE_SPAN = 9;
/** Skill rank adds this many permille to skill effect strength per rank above 1. */
export const SKILL_RANK_PM = 100;
/** Skill fires at most 1 time per battle, 2 times from rank 2. */
export function maxSkillFires(rank: number): number {
  return rank >= 2 ? 2 : 1;
}

/** Attacker attack penalty and defender defence bonus (permille) for fighting uphill. */
export function uphillPm(levels: number): number {
  if (levels <= 0) return 0;
  const raw = Math.round(BALANCE.combat.uphillPerLevel * 1000) * levels;
  return Math.min(raw, Math.round(BALANCE.combat.uphillCap * 1000));
}

/** Percent to permille with skill rank scaling: base x (1000 + 100*(rank-1)) / 1000. */
export function rankScale(value: number, rank: number): number {
  return Math.floor((value * (1000 + SKILL_RANK_PM * (Math.max(1, rank) - 1))) / 1000);
}
