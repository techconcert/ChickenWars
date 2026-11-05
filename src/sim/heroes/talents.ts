// Talent validation and effects.
import { HEROES, TALENTS } from '../data/registry';
import type { GameState, HeroState } from '../state';
import { SKILL_RANK_MAX } from './constants';
import { talentPointsAvailable } from './xp';

/** Points spent in the tree a talent belongs to. */
export function pointsInTree(hero: HeroState, tree: string): number {
  let n = 0;
  for (const id of Object.keys(hero.talents)) if (TALENTS[id]?.tree === tree) n += hero.talents[id] ?? 0;
  return n;
}

/** Skill rank implied by the hero's talents: 1 + ranks of skillRank nodes, capped. */
export function skillRankOf(hero: HeroState): number {
  let r = 1;
  for (const id of Object.keys(hero.talents).sort()) {
    const t = TALENTS[id];
    const rank = hero.talents[id] ?? 0;
    if (!t || rank <= 0) continue;
    for (const e of t.node.effects) if (e.kind === 'skillRank') r += e.amount * rank;
  }
  return Math.min(SKILL_RANK_MAX, r);
}

export function talentError(state: GameState, heroId: string, talent: string): string | null {
  const hero = state.heroes[heroId];
  const def = HEROES[heroId];
  if (!hero || !def) return 'no_hero';
  const t = TALENTS[talent];
  if (!t) return 'unknown_talent';
  if (t.tree !== def.class) return 'wrong_tree';
  if ((hero.talents[talent] ?? 0) >= t.node.maxRank) return 'max_rank';
  if (talentPointsAvailable(hero) < 1) return 'no_points';
  const spent = pointsInTree(hero, t.tree);
  const req = t.node.requires;
  if (req.points !== undefined && spent < req.points) return 'tier_locked';
  for (const n of req.nodes ?? []) if ((hero.talents[n] ?? 0) < 1) return 'requires';
  return null;
}
