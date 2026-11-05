// City defence: what the town fields against a raid (home troops, idle heroes, watchtowers, walls, allied lords' lent troops).
import { stacksPower } from '../combat/power';
import type { BattleHero } from '../combat/resolver';
import { BALANCE, HEROES, TROOPS, effectsAt } from '../data/registry';
import { researchBonus } from '../research/bonus';
import { heroStats } from '../heroStats';
import { globalEffects } from '../nav/modifiers';
import type { GameState, Stack } from '../state';
import { sortedKeys } from '../util';
import { lordLentStacks } from '../allies/perks';
import { DAMAGED_PCT, DEFENCE_HP_DIV, HERO_POWER_HP_DIV, TOWER_POWER_PER_ATK } from './constants';

export interface CityDefence {
  /** Home healthy troops (player) and allied lords' lent troops. */
  home: Stack[]; lent: Stack[];
  /** Idle hero ids at home, strongest first. */
  heroes: string[];
  towerAtk: number; towerHp: number; wallHp: number;
  /** Comparable to camp strength. */
  power: number;
}

export function battleHero(state: GameState, id: string): BattleHero {
  const st = heroStats(state, id);
  const def = HEROES[id];
  const hs = state.heroes[id];
  return { name: def ? def.name : id, atk: st.atk, def: st.def, hp: st.hp, skill: def ? def.skill : null, skillRank: hs ? hs.skillRank : 1 };
}

function heroPower(state: GameState, id: string): number {
  const st = heroStats(state, id);
  return st.atk + st.def + Math.floor(st.hp / HERO_POWER_HP_DIV);
}

/** Idle heroes (not on a march), strongest first, ties by id. */
export function homeHeroes(state: GameState): string[] {
  const ids = sortedKeys(state.heroes).filter((id) => state.heroes[id] && state.heroes[id]!.march === null);
  return ids.sort((a, b) => heroPower(state, b) - heroPower(state, a) || (a < b ? -1 : 1));
}

export function homeStacks(state: GameState): Stack[] {
  const out: Stack[] = [];
  for (const t of sortedKeys(state.troops)) {
    const n = TROOPS[t]?.role === 'trader' ? 0 : state.troops[t]?.healthy ?? 0;
    if (n > 0) out.push({ troop: t, count: n });
  }
  return out;
}

/** Clan/research `buildingHp` percent for defence structures. */
function defenceHpPct(state: GameState): number {
  let p = 0;
  for (const e of globalEffects(state)) if (e.kind === 'buildingHp' && e.category === 'defence') p += e.pct;
  return p;
}

export function cityDefence(state: GameState): CityDefence {
  let towerAtk = 0;
  let towerHp = 0;
  let wallHp = 0;
  for (const id of sortedKeys(state.city.buildings)) {
    const b = state.city.buildings[id];
    if (!b || b.level < 1) continue;
    const eff = b.damaged ? DAMAGED_PCT : 100;
    for (const e of effectsAt(b.type, 'defence', b.level)) {
      if (b.type === 'wall') wallHp += Math.floor((e.hp * eff) / 100);
      else { towerAtk += Math.floor((e.atk * eff) / 100); towerHp += Math.floor((e.hp * eff) / 100); }
    }
  }
  const hpMult = 1 + defenceHpPct(state) / 100;
  // Research wallHp lifts wall hit points, towerAtk the towers' attack (both capped by researchBonus).
  wallHp = Math.floor((wallHp * hpMult * (100 + researchBonus(state, 'wallHp'))) / 100);
  towerHp = Math.floor(towerHp * hpMult);
  towerAtk = Math.floor((towerAtk * (100 + researchBonus(state, 'towerAtk'))) / 100);
  const home = homeStacks(state);
  const lent = lordLentStacks(state);
  const heroes = homeHeroes(state);
  let power = stacksPower(home) + stacksPower(lent);
  power += towerAtk * TOWER_POWER_PER_ATK + Math.floor((towerHp + wallHp) / DEFENCE_HP_DIV);
  for (const h of heroes) power += heroPower(state, h);
  return { home, lent, heroes, towerAtk, towerHp, wallHp, power };
}

/** Percent of the stock that storehouses protect from looting: 2.5% per level summed, max 25%. */
export function protectedFraction(state: GameState): number {
  let levels = 0;
  for (const id of sortedKeys(state.city.buildings)) {
    const b = state.city.buildings[id];
    if (b && b.type === 'storehouse') levels += b.level;
  }
  return Math.min(BALANCE.raids.protectMax, levels * BALANCE.raids.protectPerLevel);
}
