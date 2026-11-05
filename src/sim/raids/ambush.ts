// Ambushes on gathering marches, and the offline safe-mode attack gate (docs/systems/bandits.md, time-and-sim.md).
import { recordToStacks, stacksPower } from '../combat/power';
import { resolveBattle } from '../combat/resolver';
import type { BattleInput } from '../combat/resolver';
import { SEASON_IDS } from '../constants';
import type { TickCtx } from '../ctx';
import { BALANCE, WORLD } from '../data/registry';
import { reverseFromHere } from '../nav/marchCore';
import { hash32, hashRand } from '../rng';
import type { BattleReport, GameState, MarchState, Stack } from '../state';
import { sortedKeys } from '../util';
import { playerSideMods } from '../heroes/mods';
import { woundedShare } from '../systems/military';
import { REGION_CLEARED_PREFIX } from './constants';
import { battleHero } from './defence';

/** Sticky per-region marker: the player cleared a camp there once (the region counts as guarded afterwards). */
export function markClearedRegions(state: GameState): void {
  for (const id of sortedKeys(state.world.pois)) {
    const p = state.world.pois[id]!;
    if (p.kind === 'bandit_camp' && !p.active) state.quests.counters[REGION_CLEARED_PREFIX + p.region] = 1;
  }
}

/** Chance (0..1) that a gather march arriving at a node in `region` is ambushed; 0 in guarded or tier-1 regions. */
export function ambushChance(state: GameState, region: number): number {
  const r = state.world.regions[region];
  if (!r || r.dangerTier < 2) return 0;
  if (state.quests.counters[REGION_CLEARED_PREFIX + region]) return 0;
  const season = BALANCE.seasonMods[SEASON_IDS[state.season.index]].banditGrowth;
  const growth = BALANCE.difficulty[state.options.difficulty].banditGrowth;
  return Math.min(BALANCE.raids.ambushMax, BALANCE.raids.ambushPerTier * (r.dangerTier - 1) * season * growth);
}

/** The ambushers: the region tier's camp troops at ambushStrength x difficulty. */
export function ambushStacks(state: GameState, tier: number): Stack[] {
  const d = WORLD.banditCamps.find((c) => c.tier === Math.min(5, Math.max(1, tier))) ?? WORLD.banditCamps[0];
  if (!d) return [];
  const mult = BALANCE.raids.ambushStrength * BALANCE.difficulty[state.options.difficulty].banditStrength;
  const out: Stack[] = [];
  for (const s of d.troops) {
    const count = Math.floor(s.count * mult);
    if (count > 0) out.push({ troop: s.troop, count });
  }
  return out;
}

function resolveAmbush(state: GameState, ctx: TickCtx, m: MarchState, tier: number): void {
  const hero = state.heroes[m.hero];
  const enemy = ambushStacks(state, tier);
  const reportId = state.nextId++;
  const mine = recordToStacks(m.troops);
  const mods = playerSideMods(state, m.hero, mine);
  const input: BattleInput = {
    attacker: { name: `Ambushers (tier ${tier})`, hero: null, stacks: enemy },
    defender: { name: hero ? battleHero(state, hero.id).name : m.hero, hero: hero ? battleHero(state, hero.id) : null, stacks: mine, mods },
    winter: SEASON_IDS[state.season.index] === 'winter',
  };
  const res = resolveBattle(input, hash32(state.seed, 'ambush', state.tick, reportId));
  const won = res.winner === 'defender';
  const share = Math.min(1, woundedShare(state, mods.woundedRatioPct) + res.woundedBonusB);
  const woundedB: Record<string, number> = {};
  for (const t of Object.keys(res.lossesB).sort()) {
    const w = Math.round((res.lossesB[t] ?? 0) * share);
    if (w > 0) woundedB[t] = w;
  }
  m.troops = { ...res.survivorsB };
  if (Object.keys(woundedB).length) {
    m.wounded = { ...(m.wounded ?? {}) };
    for (const t of Object.keys(woundedB)) m.wounded[t] = (m.wounded[t] ?? 0) + (woundedB[t] ?? 0);
  }
  const report: BattleReport = {
    id: reportId, tick: state.tick, attackerName: input.attacker.name, defenderName: input.defender.name, target: m.target.node ?? null,
    winner: res.winner, rounds: res.rounds, casualtiesA: res.lossesA, casualtiesB: res.lossesB, woundedA: {},
    loot: {}, items: [], heroXp: 0, rageEvents: res.rageEvents, kind: 'ambush', woundedB,
  };
  state.reports.push(report);
  if (state.reports.length > BALANCE.reportsKept) state.reports.splice(0, state.reports.length - BALANCE.reportsKept);
  if (won) state.stats.battlesWon += 1; else state.stats.battlesLost += 1;
  ctx.events.push({ t: 'BattleResolved', tick: state.tick, report: reportId, winner: res.winner, target: null });
  ctx.events.push({ t: 'AmbushResolved', tick: state.tick, march: m.id, won, report: reportId });
  if (!won) {
    // Driven off: the march turns for home with what it has.
    const n = m.target.node ? state.world.nodes[m.target.node] : undefined;
    if (n && n.gatherer === m.id) n.gatherer = null;
    reverseFromHere(m);
    m.state = 'returning';
  }
}

/** Rolls the ambush once per gathering stop (when the march has just arrived at its node). Never in safe mode. */
export function tickAmbush(state: GameState, ctx: TickCtx): void {
  markClearedRegions(state);
  if (ctx.safeMode) return;
  for (const id of sortedKeys(state.marches)) {
    const m = state.marches[id];
    if (!m || m.kind !== 'gather' || m.state !== 'gathering' || m.ambushChecked) continue;
    m.ambushChecked = true;
    const node = m.target.node ? state.world.nodes[m.target.node] : undefined;
    if (!node) continue;
    const p = ambushChance(state, node.region);
    if (p <= 0 || hashRand(state.seed, 'ambush', state.tick, m.id) >= p) continue;
    resolveAmbush(state, ctx, m, state.world.regions[node.region]?.dangerTier ?? 2);
  }
}

/** Offline gate: an attack march resolves in safe mode only when the attacker is at least safeAttackRatio x the defender. */
export function safeAttackFavourable(march: MarchState, enemy: readonly Stack[]): boolean {
  const mine = stacksPower(recordToStacks(march.troops));
  const theirs = stacksPower(enemy);
  return mine * 100 >= theirs * Math.round(BALANCE.raids.safeAttackRatio * 100);
}
