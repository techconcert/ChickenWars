// Balance bot: troop training and marches (gather, scout, attack). Uses only public commands plus read-only sim helpers.
import { recordToStacks, stacksPower, troopPower10 } from '../../src/sim/combat/power';
import { resolveBattle } from '../../src/sim/combat/resolver';
import { SEASON_IDS } from '../../src/sim/constants';
import { getRates } from '../../src/sim/city/production';
import { getPopulation } from '../../src/sim/city/pop';
import { getCaps } from '../../src/sim/city/caps';
import { validateCommand } from '../../src/sim/commands';
import type { Command } from '../../src/sim/commands';
import { TROOPS, TROOP_LIST } from '../../src/sim/data/registry';
import { heroStats } from '../../src/sim/heroStats';
import { playerSideMods } from '../../src/sim/heroes/mods';
import { cellDistance, gridFor } from '../../src/sim/nav';
import { battleHero, cityDefence, raidThreshold, raidTierAllowed } from '../../src/sim/raids';
import type { GameState, PoiState, Res, ResourceId } from '../../src/sim/state';
import { enemyOf } from '../../src/sim/systems/combat';
import { marchSlots } from '../../src/sim/nav/modifiers';
import { BALANCE } from '../../src/sim/data/registry';
import { trainCost } from '../../src/sim/systems/military';

const TIER1_CAP = 130;
const CLASS_SHARE: Record<string, number> = { infantry: 0.5, archer: 0.3, cavalry: 0.2, siege: 0 };

export function troopsHome(state: GameState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of Object.keys(state.troops)) if ((state.troops[t]?.healthy ?? 0) > 0) out[t] = state.troops[t]!.healthy;
  return out;
}
const total = (r: Record<string, number>): number => Object.values(r).reduce((a, b) => a + b, 0);

function afford(avail: Res, cost: Res, reserve: Res | null): boolean {
  for (const k of Object.keys(cost) as ResourceId[]) if ((cost[k] ?? 0) + (reserve?.[k] ?? 0) > (avail[k] ?? 0)) return false;
  return true;
}

/** Best trainable troop id of a class right now (highest tier whose building/tech allow it), or null. */
export function bestTroop(state: GameState, cls: string): string | null {
  let best: string | null = null;
  let bestTier = 0;
  for (const t of TROOP_LIST) {
    if (t.class !== cls || t.tier <= bestTier) continue;
    const err = validateCommand(state, { t: 'train', troop: t.id, count: 1 });
    if (err === 'cost' || err === 'pop_cap' || err === 'queue_full' || err === null) { best = t.id; bestTier = t.tier; }
  }
  return best;
}

/** Trains toward the class mix while food, pop and reserve allow. At most one batch per class per decision. */
export function planTraining(state: GameState, avail: Res, reserve: Res | null, opts: { maxArmy: number; foodFloor: number; minTroops: number }): Command[] {
  const cmds: Command[] = [];
  const rates = getRates(state);
  const have: Record<string, number> = {};
  const haveHi: Record<string, number> = {};
  let totalHi = 0;
  let totalNow = 0;
  for (const t of Object.keys(state.troops)) {
    const n = (state.troops[t]?.healthy ?? 0) + (state.troops[t]?.wounded ?? 0);
    const c = TROOPS[t]?.class ?? 'infantry';
    have[c] = (have[c] ?? 0) + n;
    totalNow += n;
    if ((TROOPS[t]?.tier ?? 1) >= 2) { haveHi[c] = (haveHi[c] ?? 0) + n; totalHi += n; }
  }
  const addJob = (t: string, n: number): void => {
    const c = TROOPS[t]?.class ?? 'infantry';
    have[c] = (have[c] ?? 0) + n; totalNow += n;
    if ((TROOPS[t]?.tier ?? 1) >= 2) { haveHi[c] = (haveHi[c] ?? 0) + n; totalHi += n; }
  };
  for (const j of state.training) addJob(j.troop, j.count);
  for (const m of Object.values(state.marches)) for (const t of Object.keys(m.troops)) addJob(t, m.troops[t] ?? 0);
  if (totalNow >= opts.maxArmy) return cmds;
  let foodNet = rates.food.net;
  const left = { ...avail };
  let pop = getPopulation(state).free;
  const avCls = ['infantry', 'archer', 'cavalry'].filter((c) => bestTroop(state, c));
  const shareSum = avCls.reduce((a, c) => a + (CLASS_SHARE[c] ?? 0), 0) || 1;
  for (const cls of avCls) {
    const troop = bestTroop(state, cls)!;
    const def = TROOPS[troop]!;
    // tier-1 troops are only a starter force (gathering, first camps); the pop room is kept for tier 2 and up
    if (def.tier === 1 && totalNow >= TIER1_CAP) continue;
    const hi = def.tier >= 2;
    const hiSum = avCls.filter((c) => (TROOPS[bestTroop(state, c)!]?.tier ?? 1) >= 2).reduce((a, c) => a + (CLASS_SHARE[c] ?? 0), 0) || 1;
    const wantShare = (CLASS_SHARE[cls] ?? 0) / (hi ? hiSum : shareSum);
    if (hi ? totalHi > 20 && (haveHi[cls] ?? 0) / Math.max(1, totalHi) > wantShare + 0.1 : totalNow > 20 && (have[cls] ?? 0) / Math.max(1, totalNow) > wantShare + 0.1) continue;
    if (state.training.filter((j) => j.troop === troop).length >= 1) continue;
    // sustainable? each troop eats def.upkeepFoodPerMinute; keep the net food positive and stock above the floor
    const batch = Math.max(1, Math.min(40, Math.floor(pop / def.popCost), opts.maxArmy - totalNow));
    let n = batch;
    while (n > 0) {
      const cost = trainCost(state, troop, n);
      const upkeep = n * def.upkeepFoodPerMinute;
      if (afford(left, cost, totalNow < opts.minTroops ? null : reserve) && foodNet - upkeep > 1 && (left.food ?? 0) - (cost.food ?? 0) > opts.foodFloor) break;
      n = Math.floor(n / 2);
    }
    if (n < 1) continue;
    const cmd: Command = { t: 'train', troop, count: n };
    if (validateCommand(state, cmd)) continue;
    const cost = trainCost(state, troop, n);
    cmds.push(cmd);
    for (const k of Object.keys(cost) as ResourceId[]) left[k] = (left[k] ?? 0) - (cost[k] ?? 0);
    foodNet -= n * def.upkeepFoodPerMinute;
    pop -= n * def.popCost;
    totalNow += n;
    have[cls] = (have[cls] ?? 0) + n;
    if (hi) { haveHi[cls] = (haveHi[cls] ?? 0) + n; totalHi += n; }
  }
  return cmds;
}

// ---- marches

const hostile = (p: PoiState): boolean => p.active && (p.kind === 'bandit_camp' || p.kind === 'lair' || p.kind === 'boss');

function regionOpen(state: GameState, cell: number): boolean {
  const r = state.world.regionOf[cell] ?? -1;
  return r < 0 || (state.world.regions[r]?.unlocked ?? true);
}

/** Picks up to `lead` troops, best power per head first. */
export function pickArmy(home: Record<string, number>, lead: number, onlyFighters = true): Record<string, number> {
  const ids = Object.keys(home).filter((t) => (home[t] ?? 0) > 0 && (!onlyFighters || (TROOPS[t]?.atk ?? 0) > 0));
  ids.sort((a, b) => troopPower10(b) - troopPower10(a) || (a < b ? -1 : 1));
  const out: Record<string, number> = {};
  let room = lead;
  for (const t of ids) {
    const n = Math.min(home[t]!, room);
    if (n > 0) { out[t] = n; room -= n; }
    if (room <= 0) break;
  }
  return out;
}

export interface Prediction { win: boolean; lossShare: number; enemyPower: number }

/** Simulates the fight with the resolver (a stand-in for the player's "preview"). Seed fixed; margin is applied by callers. */
export function predictAttack(state: GameState, hero: string, army: Record<string, number>, poi: PoiState): Prediction {
  const stacks = recordToStacks(army);
  const enemy = enemyOf(state, poi);
  const res = resolveBattle({
    attacker: { name: 'bot', hero: battleHero(state, hero), stacks, mods: playerSideMods(state, hero, stacks) },
    defender: { name: enemy.name, hero: enemy.hero, stacks: enemy.stacks, enrage: enemy.enrage },
    uphillLevels: 1, winter: SEASON_IDS[state.season.index] === 'winter', palisade: enemy.palisade,
  }, 12345);
  const lost = Object.values(res.lossesA).reduce((a, b) => a + b, 0);
  return { win: res.winner === 'attacker', lossShare: lost / Math.max(1, total(army)), enemyPower: stacksPower(enemy.stacks) };
}

/**
 * Share of the home army that must stay put so the city does not look weak to a camp that could raid it:
 * the camps' strength x weakFactor x 1.25 minus what towers, walls, lent troops and heroes already provide.
 */
export function guardFraction(state: GameState): number {
  if (state.tick < BALANCE.raids.graceDays * 600 - 1200) return 0;
  const g = gridFor(state.world.radius);
  const dm = BALANCE.difficulty[state.options.difficulty].banditStrength;
  let need = 0;
  for (const p of Object.values(state.world.pois)) {
    if (p.kind !== 'bandit_camp' || !p.active || cellDistance(g, p.cell, state.world.capitalCell) > BALANCE.raidRange) continue;
    if (p.strength < raidThreshold(state, p) * 0.85 || !raidTierAllowed(state, p.tier)) continue;
    need = Math.max(need, p.strength * dm * BALANCE.raids.weakFactor * 1.25);
  }
  if (need <= 0) return 0;
  const d = cityDefence(state);
  const homePower = stacksPower(d.home);
  const extras = d.power - homePower;
  // marching troops are part of the force that can be kept back: the share is taken of the whole army, not of what happens to be home
  const away: Record<string, number> = {};
  for (const m of Object.values(state.marches)) for (const t of Object.keys(m.troops)) away[t] = (away[t] ?? 0) + (m.troops[t] ?? 0);
  const totalPower = homePower + stacksPower(recordToStacks(away));
  const required = Math.max(0, need - extras);
  return totalPower <= 0 ? 1 : Math.min(1, required / totalPower);
}

export interface MarchPolicy {
  /** Max loss share accepted for an attack. */
  maxLoss: number; allowAttack: boolean; allowRally: boolean; homeGuard: number;
}

/** Nearest explored node of the most needed resource within reach. */
function pickNode(state: GameState, needRank: ResourceId[], used: ReadonlySet<string>): string | null {
  const w = state.world;
  const g = gridFor(w.radius);
  for (const res of needRank) {
    let best: string | null = null;
    let bd = Infinity;
    for (const id of Object.keys(w.nodes).sort()) {
      const n = w.nodes[id]!;
      if (n.resource !== res || n.amount < 300 || n.respawnAt !== null || n.gatherer || used.has(id) || n.blockedUntil > state.tick) continue;
      if (!regionOpen(state, n.cell) || (w.fog[n.cell] ?? 0) === 0) continue;
      const d = cellDistance(g, w.capitalCell, n.cell);
      if (d > 24) continue;
      if (d < bd) { bd = d; best = id; }
    }
    if (best) return best;
  }
  return null;
}

function needRank(state: GameState): ResourceId[] {
  const caps = getCaps(state);
  const ratio = (r: ResourceId): number => state.resources[r] / Math.max(1, caps[r]);
  return (['wood', 'stone', 'food', 'gold'] as ResourceId[]).filter((r) => ratio(r) < 0.8).sort((a, b) => ratio(a) - ratio(b));
}

const kindRank = (p: PoiState): number => (p.kind === 'boss' ? 2 : p.kind === 'lair' ? 1 : 0);

/** First viable attack for `hero` with the troops in `home` (keeping the guard share), or null. */
function findAttack(state: GameState, hero: string, home: Record<string, number>, policy: MarchPolicy, guard: number, bigOnly = false): { army: Record<string, number>; poi: PoiState } | null {
  const w = state.world;
  const g = gridFor(w.radius);
  const lead = heroStats(state, hero).lead;
  const fighters = total(pickArmy(home, 1e9));
  const guardN = Math.floor(fighters * guard);
  const frac = fighters > 0 ? Math.max(0, 1 - guardN / fighters) : 0;
  const avail: Record<string, number> = {};
  for (const t of Object.keys(home)) avail[t] = Math.floor(home[t]! * frac);
  const army = pickArmy(avail, lead);
  if (total(army) < 10) return null;
  const worthIt = (p: PoiState): boolean => p.kind !== 'bandit_camp' || state.stats.campsCleared < 2 || p.strength >= raidThreshold(state, p) * 0.75;
  const targets = Object.values(w.pois).filter((p) => hostile(p) && worthIt(p) && (!bigOnly || p.kind !== 'bandit_camp') && regionOpen(state, p.cell) && ((w.fog[p.cell] ?? 0) > 0 || cellDistance(g, w.capitalCell, p.cell) <= 12) && cellDistance(g, w.capitalCell, p.cell) <= 22)
    .sort((a, b) => kindRank(b) - kindRank(a) || b.tier - a.tier || cellDistance(g, w.capitalCell, a.cell) - cellDistance(g, w.capitalCell, b.cell) || (a.id < b.id ? -1 : 1));
  for (const p of targets) {
    const pr = predictAttack(state, hero, army, p);
    // a boss is a one-off that unlocks a region: the wounded come back from the infirmary, so a costlier win is accepted
    const cap = p.kind === 'boss' ? Math.max(policy.maxLoss, 0.8) : state.stats.campsCleared === 0 ? Math.max(policy.maxLoss, 0.65) : policy.maxLoss;
    if (pr.win && pr.lossShare <= cap) return { army, poi: p };
  }
  return null;
}

export function planMarches(state: GameState, policy: MarchPolicy): Command[] {
  const cmds: Command[] = [];
  const home = troopsHome(state);
  const homeF = total(pickArmy(home, 1e9));
  let awayF = 0;
  for (const m of Object.values(state.marches)) awayF += total(pickArmy(m.troops, 1e9));
  const guardN = Math.ceil((homeF + awayF) * Math.max(policy.homeGuard, guardFraction(state)));
  const guard = homeF <= 0 ? 1 : Math.min(1, guardN / homeF);
  // a hero busy on a gather march is recalled when a viable attack exists for it
  if (policy.allowAttack) {
    for (const id of Object.keys(state.marches).sort()) {
      const m = state.marches[id]!;
      if (m.kind !== 'gather' || m.state === 'returning') continue;
      if (findAttack(state, m.hero, home, policy, guard)) {
        const c: Command = { t: 'recall', march: id };
        if (!validateCommand(state, c)) cmds.push(c);
      }
    }
  }
  // A boss or lair that the whole army could take: pull the gatherers home and hold the other marches back until it is done.
  let massing = false;
  if (policy.allowAttack) {
    const pot = { ...home };
    const gatherers = Object.keys(state.marches).sort().filter((id) => state.marches[id]!.kind === 'gather' || (state.marches[id]!.kind === 'attack' && state.marches[id]!.state === 'moving'));
    for (const id of Object.keys(state.marches)) if (state.marches[id]!.kind === 'gather' || state.marches[id]!.kind === 'attack' || state.marches[id]!.state === 'returning') for (const t of Object.keys(state.marches[id]!.troops)) pot[t] = (pot[t] ?? 0) + state.marches[id]!.troops[t]!;
    const lead = Object.keys(state.heroes).sort((a, b) => state.heroes[b]!.level - state.heroes[a]!.level)[0];
    const guardPot = Math.min(1, guardN / Math.max(1, total(pickArmy(pot, 1e9))));
    if (lead && findAttack(state, lead, pot, policy, guardPot, true)) {
      massing = !findAttack(state, lead, home, policy, guard, true);
      if (massing) for (const id of gatherers) { const c: Command = { t: 'recall', march: id }; if (state.marches[id]!.state !== 'returning' && !validateCommand(state, c)) cmds.push(c); }
    }
  }
  if (massing) return cmds;
  let slots = Math.min(marchSlots(state), BALANCE.marchSlotsMax) - Object.keys(state.marches).length;
  if (slots <= 0) return cmds;
  const heroes = Object.keys(state.heroes).filter((h) => state.heroes[h]!.march === null)
    .sort((a, b) => state.heroes[b]!.level - state.heroes[a]!.level || (a < b ? -1 : 1));
  const w = state.world;
  const g = gridFor(w.radius);
  const usedNodes = new Set<string>();

  for (const hero of heroes) {
    if (slots <= 0) break;
    const lead = heroStats(state, hero).lead;
    // 1. attack
    if (policy.allowAttack) {
      const found = findAttack(state, hero, home, policy, guard);
      if (found) {
        const { army, poi: p } = found;
        const cmd: Command = policy.allowRally && Object.values(state.lords).some((l) => l.rep >= 65) && (p.kind === 'boss' || p.kind === 'lair')
          ? { t: 'startRally', hero, troops: army, target: p.id }
          : { t: 'march', hero, troops: army, target: { poi: p.id }, kind: 'attack' };
        if (!validateCommand(state, cmd)) {
          cmds.push(cmd);
          for (const t of Object.keys(army)) home[t] = (home[t] ?? 0) - army[t]!;
          slots--;
          continue;
        }
      }
    }
    // 2. scout a ruin / cache with riders
    const riders = (home['rider'] ?? 0) + (home['knight'] ?? 0) + (home['lancer'] ?? 0);
    if (riders >= 6) {
      const ruin = Object.values(w.pois).filter((p) => (p.kind === 'ruin' || p.kind === 'cache') && p.active && !p.explored && regionOpen(state, p.cell) && cellDistance(g, w.capitalCell, p.cell) <= 20)
        .sort((a, b) => cellDistance(g, w.capitalCell, a.cell) - cellDistance(g, w.capitalCell, b.cell) || (a.id < b.id ? -1 : 1))[0];
      if (ruin) {
        const troops: Record<string, number> = {};
        for (const t of ['rider', 'knight', 'lancer']) if ((home[t] ?? 0) > 0) { troops[t] = Math.min(home[t]!, 8); break; }
        const cmd: Command = { t: 'march', hero, troops, target: { poi: ruin.id }, kind: 'scout' };
        if (!validateCommand(state, cmd)) {
          cmds.push(cmd);
          for (const t of Object.keys(troops)) home[t] = (home[t] ?? 0) - troops[t]!;
          slots--;
          continue;
        }
      }
    }
    // 3. gather with whatever is left (not the guard)
    const rank = needRank(state);
    const node = rank.length ? pickNode(state, rank, usedNodes) : null;
    if (node) {
      const ids = Object.keys(home).filter((t) => (home[t] ?? 0) > 0 && (TROOPS[t]?.load ?? 0) > 0).sort();
      const troops: Record<string, number> = {};
      let room = lead;
      const keep = Math.floor(total(home) * guard);
      let spare = total(home) - keep;
      for (const t of ids) {
        const n = Math.min(home[t]!, room, Math.max(0, spare));
        if (n > 0) { troops[t] = n; room -= n; spare -= n; }
      }
      if (total(troops) >= 8) {
        const cmd: Command = { t: 'march', hero, troops, target: { node }, kind: 'gather' };
        if (!validateCommand(state, cmd)) {
          cmds.push(cmd);
          usedNodes.add(node);
          for (const t of Object.keys(troops)) home[t] = (home[t] ?? 0) - troops[t]!;
          slots--;
        }
      }
    }
  }
  return cmds;
}
