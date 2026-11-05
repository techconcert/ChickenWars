// Heroes system: talents, respec, equipment, item upgrades, tavern and hero grants (docs/systems/heroes.md).
import type { CommandOf } from '../commands';
import { canAfford, pay } from '../city/cost';
import type { Handler, TickCtx } from '../ctx';
import { BALANCE, BUILDINGS, HEROES, ITEMS, TALENTS } from '../data/registry';
import { ACADEMY_BUILDING, ITEM_MAX_UPGRADE, itemUpgradeCost } from '../heroes/constants';
import { refreshTavern, tavernLevel } from '../heroes/tavern';
import { skillRankOf, talentError } from '../heroes/talents';
import type { GameState, HeroState, Slot } from '../state';
import { sortedKeys } from '../util';
import { academyLevel } from './research';

export { grantHeroXp } from '../heroes/xp';

const SLOTS: readonly Slot[] = ['weapon', 'armour', 'banner', 'trinket'];

/**
 * Adds a named hero to the roster (quests, ruins and shrines call this). No-op returning false when the hero is
 * unknown or already owned. Unique heroes ignore the tavern roster cap check in `recruitHero` but never duplicate.
 */
export function grantHero(state: GameState, heroId: string, ctx: TickCtx): boolean {
  if (!HEROES[heroId] || state.heroes[heroId]) return false;
  const hero: HeroState = {
    id: heroId, level: 1, xp: 0, talents: {},
    equipment: { weapon: null, armour: null, banner: null, trinket: null }, march: null, skillRank: 1,
  };
  state.heroes[heroId] = hero;
  state.tavern.candidates = state.tavern.candidates.filter((c) => c !== heroId);
  ctx.events.push({ t: 'HeroRecruited', tick: state.tick, hero: heroId });
  return true;
}

/** Hero that currently wears inventory item `item`, or null. */
export function itemWearer(state: GameState, item: string): string | null {
  for (const h of sortedKeys(state.heroes)) {
    const hs = state.heroes[h];
    if (hs && SLOTS.some((s) => hs.equipment[s] === item)) return h;
  }
  return null;
}

/** Heroes system tick: tavern rotation. */
export function tickHeroes(state: GameState, _ctx: TickCtx): void {
  refreshTavern(state);
}

export const handlers: { [K in 'heroTalent' | 'equip' | 'recruitHero' | 'respec' | 'upgradeItem']: Handler<CommandOf<K>> } = {
  heroTalent: {
    validate: (state, cmd) => talentError(state, cmd.hero, cmd.talent),
    apply(state, cmd) {
      const hero = state.heroes[cmd.hero];
      if (!hero || !TALENTS[cmd.talent]) return;
      hero.talents[cmd.talent] = (hero.talents[cmd.talent] ?? 0) + 1;
      hero.skillRank = skillRankOf(hero);
    },
  },
  respec: {
    validate(state, cmd) {
      const hero = state.heroes[cmd.hero];
      if (!hero) return 'no_hero';
      if (hero.march) return 'on_march';
      if (!Object.keys(hero.talents).length) return 'nothing_to_respec';
      if (state.resources.gold < BALANCE.respecCostGold) return 'cost';
      return null;
    },
    apply(state, cmd) {
      const hero = state.heroes[cmd.hero];
      if (!hero) return;
      pay(state, { gold: BALANCE.respecCostGold });
      hero.talents = {};
      hero.skillRank = 1;
    },
  },
  equip: {
    validate(state, cmd) {
      const hero = state.heroes[cmd.hero];
      if (!hero) return 'no_hero';
      if (!SLOTS.includes(cmd.slot)) return 'bad_slot';
      if (hero.march) return 'on_march';
      if (cmd.item === null) return hero.equipment[cmd.slot] ? null : 'empty_slot';
      const inst = state.inventory[cmd.item];
      if (!inst) return 'no_item';
      const def = ITEMS[inst.def];
      if (!def) return 'no_item';
      if (def.slot !== cmd.slot) return 'wrong_slot';
      const wearer = itemWearer(state, cmd.item);
      if (wearer !== null && wearer !== cmd.hero) return 'item_in_use';
      return null;
    },
    apply(state, cmd) {
      const hero = state.heroes[cmd.hero];
      if (!hero) return;
      hero.equipment[cmd.slot] = cmd.item;
    },
  },
  upgradeItem: {
    validate(state, cmd) {
      const inst = state.inventory[cmd.item];
      const def = inst ? ITEMS[inst.def] : undefined;
      if (!inst || !def) return 'no_item';
      if (inst.upgrade >= ITEM_MAX_UPGRADE) return 'max_upgrade';
      if (!BUILDINGS[ACADEMY_BUILDING] || academyLevel(state) < 1) return 'no_academy';
      if (!canAfford(state, itemUpgradeCost(def.rarity, inst.upgrade + 1))) return 'cost';
      return null;
    },
    apply(state, cmd, ctx) {
      const inst = state.inventory[cmd.item];
      const def = inst ? ITEMS[inst.def] : undefined;
      if (!inst || !def) return;
      pay(state, itemUpgradeCost(def.rarity, inst.upgrade + 1));
      inst.upgrade += 1;
      ctx.events.push({ t: 'ItemUpgraded', tick: state.tick, item: inst.id, level: inst.upgrade });
    },
  },
  recruitHero: {
    validate(state, cmd) {
      const def = HEROES[cmd.hero];
      if (!def) return 'unknown_hero';
      if (def.recruit.kind !== 'tavern') return 'not_for_hire';
      if (state.heroes[cmd.hero]) return 'owned';
      if (tavernLevel(state) < 1) return 'no_tavern';
      if (!state.tavern.candidates.includes(cmd.hero)) return 'not_offered';
      if (Object.keys(state.heroes).length >= BALANCE.heroMax) return 'roster_full';
      if (!canAfford(state, def.recruit.cost)) return 'cost';
      return null;
    },
    apply(state, cmd, ctx) {
      const def = HEROES[cmd.hero];
      if (!def || def.recruit.kind !== 'tavern') return;
      pay(state, def.recruit.cost);
      grantHero(state, cmd.hero, ctx);
    },
  },
};
