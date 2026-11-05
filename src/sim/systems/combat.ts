// Combat system: resolves marches in phase 'fighting' against their target POI (docs/systems/combat.md).
import { rollLoot } from '../combat/loot';
import { recordToStacks, stacksPower, totalCount } from '../combat/power';
import { resolveBattle } from '../combat/resolver';
import { BOSS_ENRAGE_ATK_PM, BOSS_ENRAGE_BELOW_PCT } from '../combat/modifiers';
import type { BattleHero, BattleInput } from '../combat/resolver';
import { SEASON_IDS } from '../constants';
import type { TickCtx } from '../ctx';
import { BALANCE, HEROES, HERO_LIST, TROOPS, WORLD } from '../data/registry';
import { heroStats } from '../heroStats';
import { grantHeroXp } from '../heroes/xp';
import { hash32 } from '../rng';
import type { BattleReport, GameState, HeroState, MarchState, PoiState, Res, ResourceId, Stack } from '../state';
import { sortedKeys } from '../util';
import { rallyAugment, rallyDone, rallyLoot, rallySplit } from '../allies/rally';
import { playerSideMods } from '../heroes/mods';
import { safeAttackFavourable } from '../raids';
import { unlockBridges } from './bridges';
import { campData, resetCamp, respawnDelay } from './bandits';
import { woundedShare } from './military';

/** Miniboss/boss skill when the synthetic hero has no data of its own. */
const BANDIT_HERO_SKILL = 'cleave';

export interface Enemy { name: string; stacks: Stack[]; hero: BattleHero | null; palisade: boolean; /** bosses enrage at 50% troops (phase 2) */ enrage?: { belowPct: number; atkPm: number } }

export const BOSS_ENRAGE = { belowPct: BOSS_ENRAGE_BELOW_PCT, atkPm: BOSS_ENRAGE_ATK_PM };

function townHallLevel(state: GameState): number {
  return state.city.buildings[state.city.townHall]?.level ?? 1;
}

function banditHero(name: string, level: number): BattleHero {
  const startDef = HERO_LIST.find((h) => h.recruit.kind === 'start') ?? HERO_LIST[0];
  const b = startDef ? startDef.baseStats : { atk: 0, def: 0, hp: 0 };
  const g = startDef ? startDef.growth : { atk: 0, def: 0, hp: 0 };
  const n = Math.max(0, level - 1);
  return {
    name, atk: Math.floor(b.atk + g.atk * n), def: Math.floor(b.def + g.def * n), hp: Math.floor(b.hp + g.hp * n),
    skill: BANDIT_HERO_SKILL, skillRank: 1,
  };
}

function scaled(stacks: readonly Stack[], mult: number): Stack[] {
  const out: Stack[] = [];
  for (const s of stacks) {
    const count = Math.floor(s.count * mult);
    if (count > 0) out.push({ troop: s.troop, count });
  }
  return out;
}

/** The enemy a POI fields: troops scaled by strength (camps) and difficulty; lairs get a miniboss, bosses their hero. */
export function enemyOf(state: GameState, poi: PoiState): Enemy {
  const dm = BALANCE.difficulty[state.options.difficulty].banditStrength;
  const camp = campData(poi.tier);
  if (poi.kind === 'boss') {
    const b = WORLD.bosses.find((x) => x.id === poi.bossId) ?? WORLD.bosses.find((x) => x.tier === poi.tier);
    const base = poi.troops.length ? poi.troops : (b ? b.troops : []);
    return { name: b ? b.name : 'Boss', stacks: scaled(base, dm), hero: banditHero(b ? b.name : 'Boss', b ? b.heroLevel : poi.tier * 5), palisade: false, enrage: BOSS_ENRAGE };
  }
  if (poi.kind === 'lair') {
    const base = poi.troops.length ? poi.troops : scaled(camp ? camp.troops : [], 2);
    return { name: `Lair (tier ${poi.tier})`, stacks: scaled(base, dm), hero: banditHero('Lair Chief', poi.level), palisade: false };
  }
  const base = poi.troops.length ? poi.troops : (camp ? camp.troops : []);
  const mult = camp && poi.strength > 0 ? (poi.strength * dm) / camp.baseStrength : dm;
  return { name: `Bandit Camp (tier ${poi.tier})`, stacks: scaled(base, mult), hero: null, palisade: true };
}

function marchHero(state: GameState, hero: HeroState): BattleHero {
  const st = heroStats(state, hero.id);
  const def = HEROES[hero.id];
  return { name: def ? def.name : hero.id, atk: st.atk, def: st.def, hp: st.hp, skill: def ? def.skill : null, skillRank: hero.skillRank };
}

/** Levels the march fights uphill: terrain level of the POI cell over the cell it came from. */
function uphillOf(state: GameState, march: MarchState, poi: PoiState): number {
  const w = state.world;
  const from = march.path.length >= 2 ? march.path[march.path.length - 2]! : w.capitalCell;
  return (w.level[poi.cell] ?? 0) - (w.level[from] ?? 0);
}

function carryCapacity(troops: Record<string, number>): number {
  let cap = 0;
  for (const t of Object.keys(troops)) cap += (troops[t] ?? 0) * (TROOPS[t]?.load ?? 0);
  return cap;
}

function unlockRegions(state: GameState, ctx: TickCtx, poi: PoiState): number[] {
  const out: number[] = [];
  const home = state.world.regions[poi.region];
  if (!home) return out;
  if (poi.kind === 'boss') unlockBridges(state, ctx, 'boss', poi.region);
  for (const n of home.neighbours) {
    const r = state.world.regions[n];
    if (r && !r.unlocked && r.dangerTier <= poi.tier + 1) {
      r.unlocked = true;
      out.push(n);
      ctx.events.push({ t: 'RegionUnlocked', tick: state.tick, region: n });
    }
  }
  return out;
}

function bump(counters: Record<string, number>, key: string): void {
  counters[key] = (counters[key] ?? 0) + 1;
}

/** Resolve one fighting march against its POI. */
function resolveMarch(state: GameState, ctx: TickCtx, march: MarchState): void {
  const poi = march.target.poi ? state.world.pois[march.target.poi] : undefined;
  const hero = state.heroes[march.hero];
  march.state = 'returning';
  march.path = [];
  march.step = 0;
  march.progress = 0;
  if (!poi || !poi.active || !hero) return;

  const enemy = enemyOf(state, poi);
  const attackerStacks = recordToStacks(march.troops);
  // M7/M8 hooks (raids/allies): offline safe mode only fights favourable battles; rallies add the lords' armies and heroes.
  if (ctx.safeMode && !safeAttackFavourable(march, enemy.stacks)) {
    ctx.events.push({ t: 'AttackAborted', tick: state.tick, march: march.id, poi: poi.id });
    return;
  }
  const aug = march.rally ? rallyAugment(state, march) : null;
  const reportId = state.nextId++;
  const mods = playerSideMods(state, hero.id, attackerStacks);
  const input: BattleInput = {
    attacker: {
      name: HEROES[hero.id]?.name ?? hero.id, hero: marchHero(state, hero), mods,
      stacks: aug ? [...attackerStacks, ...aug.extraStacks] : attackerStacks, allies: aug ? aug.allyHeroes : undefined,
    },
    defender: { name: enemy.name, hero: enemy.hero, stacks: enemy.stacks, enrage: enemy.enrage },
    uphillLevels: uphillOf(state, march, poi),
    winter: SEASON_IDS[state.season.index] === 'winter',
    palisade: enemy.palisade,
  };
  const res = resolveBattle(input, hash32(state.seed, 'combat', state.tick, reportId));
  const won = res.winner === 'attacker';
  if (aug) rallySplit(res, attackerStacks, aug.extraStacks);

  // Player losses: part wounded (march.wounded joins the home pool when the march returns), the rest die.
  const share = Math.min(1, woundedShare(state, mods.woundedRatioPct) + res.woundedBonusA);
  const woundedA: Record<string, number> = {};
  for (const t of Object.keys(res.lossesA).sort()) {
    const w = Math.round((res.lossesA[t] ?? 0) * share);
    if (w > 0) woundedA[t] = w;
  }
  march.troops = { ...res.survivorsA };
  if (Object.keys(woundedA).length) {
    march.wounded = { ...(march.wounded ?? {}) };
    for (const t of Object.keys(woundedA)) march.wounded[t] = (march.wounded[t] ?? 0) + (woundedA[t] ?? 0);
  }

  // Enemy losses are permanent.
  const startE = totalCount(enemy.stacks);
  const leftE = Object.values(res.survivorsB).reduce((a, b) => a + b, 0);
  const enemyPower = stacksPower(enemy.stacks);
  const loot: Res = {};
  let items: string[] = [];
  let xp = 0;

  if (won) {
    const playerLvl = townHallLevel(state);
    const roll = rollLoot(poi, playerLvl, hash32(state.seed, 'loot', state.tick, reportId));
    if (aug) roll.resources = rallyLoot(state, ctx, march, roll.resources);
    let room = carryCapacity(march.troops);
    for (const r of Object.keys(march.carried) as ResourceId[]) if (r !== 'ember') room -= march.carried[r] ?? 0;
    for (const r of Object.keys(roll.resources).sort() as ResourceId[]) {
      const want = roll.resources[r] ?? 0;
      const give = r === 'ember' ? want : Math.max(0, Math.min(want, room));
      if (r !== 'ember') room -= give;
      if (give > 0) { loot[r] = give; march.carried[r] = (march.carried[r] ?? 0) + give; }
    }
    items = roll.items;
    for (const def of items) {
      const id = String(state.nextId++);
      state.inventory[id] = { id, def, upgrade: 0 };
      ctx.events.push({ t: 'ItemDropped', tick: state.tick, item: id, def });
    }
    xp = Math.floor(enemyPower / 20);
    grantHeroXp(state, hero.id, xp, ctx);
    state.stats.battlesWon += 1;
    poi.active = false;
    if (poi.kind === 'bandit_camp') {
      resetCamp(poi);
      poi.respawnAt = state.tick + respawnDelay(state.seed, state.tick, poi.id);
    } else {
      poi.troops = [];
      poi.respawnAt = null;
    }
    if (poi.kind === 'boss') {
      state.stats.bossesKilled += 1;
      bump(state.quests.counters, 'bossesKilled');
      const name = enemy.name;
      ctx.events.push({ t: 'BossDefeated', tick: state.tick, poi: poi.id, boss: poi.bossId ?? name });
      const opened = unlockRegions(state, ctx, poi);
      state.chronicle.push({ tick: state.tick, text: `${name} has fallen.${opened.length ? ` New lands lie open: region ${opened.join(', ')}.` : ''}` });
    } else {
      state.stats.campsCleared += 1;
      bump(state.quests.counters, 'campCleared');
      bump(state.quests.counters, `campCleared_t${poi.tier}`);
      ctx.events.push({ t: 'CampCleared', tick: state.tick, poi: poi.id, tier: poi.tier });
    }
  } else {
    state.stats.battlesLost += 1;
    // The bandits keep their surviving strength.
    if (startE > 0) {
      const ratio = leftE / startE;
      if (poi.kind === 'bandit_camp') poi.strength = Math.max(1, Math.floor(poi.strength * ratio));
      else poi.troops = scaled(poi.troops.length ? poi.troops : enemy.stacks, ratio);
    }
  }

  const report: BattleReport = {
    id: reportId, tick: state.tick, attackerName: input.attacker.name, defenderName: enemy.name, target: poi.id,
    winner: res.winner, rounds: res.rounds, casualtiesA: res.lossesA, casualtiesB: res.lossesB, woundedA,
    loot, items, heroXp: xp, rageEvents: res.rageEvents,
  };
  state.reports.push(report);
  if (state.reports.length > BALANCE.reportsKept) state.reports.splice(0, state.reports.length - BALANCE.reportsKept);
  march.report = reportId;
  if (march.rally) rallyDone(state, ctx, march, won);
  ctx.events.push({ t: 'BattleResolved', tick: state.tick, report: reportId, winner: res.winner, target: poi.id });
}

export function tickCombat(state: GameState, ctx: TickCtx): void {
  for (const id of sortedKeys(state.marches)) {
    const m = state.marches[id];
    if (m && m.state === 'fighting') resolveMarch(state, ctx, m);
  }
}
