// Raids on the city (docs/systems/bandits.md): launch rules, warning, arrival resolution.
import { cellDistance, findPath, gridFor } from '../nav';
import { researchBonus } from '../research/bonus';
import { campLevel, totalCount } from '../combat/power';
import { resolveBattle } from '../combat/resolver';
import type { BattleInput } from '../combat/resolver';
import { DAY_TICKS, SEASON_IDS } from '../constants';
import type { TickCtx } from '../ctx';
import { BALANCE, WORLD } from '../data/registry';
import { hash32, hashRand } from '../rng';
import type { BattleReport, GameState, PoiState, RaidState, Res, ResourceId, Stack } from '../state';
import { sortedKeys } from '../util';
import { lordStage } from '../allies/lords';
import { addWounded, woundedShare } from '../systems/military';
import { MAX_ACTIVE_RAIDS } from './constants';
import { playerSideMods } from '../heroes/mods';
import { battleHero, cityDefence, protectedFraction } from './defence';

/** Raid troops of a camp: its base troops scaled to the current strength (x difficulty). */
export function raiderStacks(state: GameState, camp: PoiState): Stack[] {
  const d = WORLD.banditCamps.find((c) => c.tier === camp.tier) ?? WORLD.banditCamps[0];
  if (!d) return [];
  const dm = BALANCE.difficulty[state.options.difficulty].banditStrength;
  const base = camp.troops.length ? camp.troops : d.troops;
  const mult = camp.strength > 0 ? (camp.strength * dm) / d.baseStrength : dm;
  const out: Stack[] = [];
  for (const s of base) {
    const count = Math.floor(s.count * mult);
    if (count > 0) out.push({ troop: s.troop, count });
  }
  return out;
}

/** Lord of the region the camp sits in, if any. */
function regionLord(state: GameState, camp: PoiState): string | null {
  return state.world.regions[camp.region]?.lord ?? null;
}

/** Strength a camp needs before it raids: tier raidThreshold x difficulty (hard 0.9) x hostile-lord region (0.9). */
export function raidThreshold(state: GameState, camp: PoiState): number {
  const d = WORLD.banditCamps.find((c) => c.tier === camp.tier) ?? WORLD.banditCamps[0];
  if (!d) return Infinity;
  let t = d.raidThreshold * BALANCE.difficulty[state.options.difficulty].raidThresholdMult;
  const lord = regionLord(state, camp);
  const l = lord ? state.lords[lord] : undefined;
  if (l && lordStage(l.rep) === 'hostile') t *= BALANCE.raids.hostileThresholdMult;
  return t;
}

/** Warning lead in ticks: raidWarningTicks x difficulty warningMult + research `raidWarning` effects. */
export function warningTicks(state: GameState): number {
  let t = Math.round(BALANCE.raidWarningTicks * BALANCE.difficulty[state.options.difficulty].warningMult);
  t += researchBonus(state, 'raidWarning'); // capped at 1800 ticks
  return Math.max(1, t);
}

/** A camp raids only a city its tier can threaten: cityLevelRange start of its tier minus 2 (D30), so far high-tier camps stay home early. */
export function raidTierAllowed(state: GameState, tier: number): boolean {
  const rt = WORLD.regionTiers.find((r) => r.tier === tier);
  const th = state.city.buildings[state.city.townHall]?.level ?? 1;
  return !rt || rt.cityLevelRange[0] - 2 <= th;
}

/** Town Hall level (1 when missing). Raids never start before `raids.minTownHall`. */
function townHallOf(state: GameState): number {
  return state.city.buildings[state.city.townHall]?.level ?? 1;
}

export interface RaidCheck { ok: boolean; reason: string }

/** Whether `camp` would launch a raid now (everything except the random launch roll). */
export function raidConditions(state: GameState, camp: PoiState): RaidCheck {
  if (camp.kind !== 'bandit_camp' || !camp.active) return { ok: false, reason: 'inactive' };
  if (state.tick < camp.raidReadyAt) return { ok: false, reason: 'cooldown' };
  if (state.tick < BALANCE.raids.graceDays * DAY_TICKS) return { ok: false, reason: 'grace' };
  if (townHallOf(state) < BALANCE.raids.minTownHall) return { ok: false, reason: 'early' };
  if (camp.strength < raidThreshold(state, camp)) return { ok: false, reason: 'threshold' };
  if (!raidTierAllowed(state, camp.tier)) return { ok: false, reason: 'tier' };
  const g = gridFor(state.world.radius);
  if (cellDistance(g, camp.cell, state.world.capitalCell) > BALANCE.raidRange) return { ok: false, reason: 'range' };
  for (const id of sortedKeys(state.raids)) if (state.raids[id]!.camp === camp.id) return { ok: false, reason: 'in_flight' };
  const dm = BALANCE.difficulty[state.options.difficulty].banditStrength;
  if (cityDefence(state).power >= camp.strength * dm * BALANCE.raids.weakFactor) return { ok: false, reason: 'strong' };
  return { ok: true, reason: 'ok' };
}

/** Launches new raids (called every tick; evaluates camps every `checkInterval` ticks). Never in safe mode. */
export function launchRaids(state: GameState, ctx: TickCtx): void {
  if (ctx.safeMode || state.tick % BALANCE.raids.checkInterval !== 0) return;
  if (state.tick < BALANCE.raids.graceDays * DAY_TICKS) return; // new towns get a quiet start
  if (townHallOf(state) < BALANCE.raids.minTownHall) return; // no raids until the Town Hall is past level 5
  for (const id of sortedKeys(state.world.pois)) {
    if (Object.keys(state.raids).length >= MAX_ACTIVE_RAIDS) return;
    const camp = state.world.pois[id]!;
    if (camp.kind !== 'bandit_camp' || !camp.active || state.tick < camp.raidReadyAt) continue;
    if (!raidConditions(state, camp).ok) continue;
    if (hashRand(state.seed, 'raidLaunch', state.tick, camp.id) >= BALANCE.raids.launchChance) continue;
    const path = findPath(state.world, camp.cell, state.world.capitalCell, { allowLocked: true });
    if (!path) { camp.raidReadyAt = state.tick + BALANCE.raids.cooldownTicks; continue; }
    const dm = BALANCE.difficulty[state.options.difficulty].banditStrength;
    const rid = `raid_${state.nextId++}`;
    const warn = warningTicks(state);
    const travel = Math.ceil((path.length - 1) * BALANCE.raids.ticksPerCell);
    const arriveAt = state.tick + Math.max(travel, warn);
    const raid: RaidState = {
      id: rid, camp: camp.id, path, arriveAt, strength: Math.floor(camp.strength * dm), troops: raiderStacks(state, camp),
      warnAt: arriveAt - warn, warned: false, launchedAt: state.tick,
    };
    state.raids[rid] = raid;
    camp.raidReadyAt = state.tick + BALANCE.raids.cooldownTicks;
    ctx.events.push({ t: 'RaidLaunched', tick: state.tick, raid: rid, camp: camp.id, arriveAt });
  }
}

/** Cell the raiders currently stand on (for the render), interpolated along the path by time. */
export function raidCell(state: GameState, raid: RaidState): number {
  const launched = raid.launchedAt ?? state.tick;
  const span = Math.max(1, raid.arriveAt - launched);
  const f = Math.min(1, Math.max(0, (state.tick - launched) / span));
  return raid.path[Math.min(raid.path.length - 1, Math.floor(f * (raid.path.length - 1)))] ?? state.world.capitalCell;
}

function lootCity(state: GameState, pct: number): Res {
  const loot: Res = {};
  const keep = 1 - protectedFraction(state);
  for (const r of ['food', 'wood', 'stone', 'gold'] as ResourceId[]) {
    const lootable = Math.floor(state.resources[r] * keep);
    const take = Math.min(state.resources[r], Math.floor(lootable * pct));
    if (take > 0) { state.resources[r] -= take; loot[r] = take; }
  }
  return loot;
}

/** Marks 1..damagedBuildingsMax non-hall buildings damaged, deterministically. Never destroys. */
function damageBuildings(state: GameState, ctx: TickCtx, raidId: string): string[] {
  const cand = sortedKeys(state.city.buildings).filter((id) => {
    const b = state.city.buildings[id]!;
    return id !== state.city.townHall && b.level >= 1 && !b.damaged;
  });
  const n = Math.min(cand.length, 1 + (hash32(state.seed, 'raidDamageN', state.tick, raidId) % BALANCE.raids.damagedBuildingsMax));
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const k = hash32(state.seed, 'raidDamagePick', state.tick, `${raidId}:${i}`) % cand.length;
    const id = cand.splice(k, 1)[0]!;
    state.city.buildings[id]!.damaged = true;
    out.push(id);
    ctx.events.push({ t: 'BuildingDamaged', tick: state.tick, building: id });
  }
  return out;
}

function bump(state: GameState, key: string): void {
  state.quests.counters[key] = (state.quests.counters[key] ?? 0) + 1;
}

/** Fights the raiders against the city and applies all consequences. */
export function resolveRaid(state: GameState, ctx: TickCtx, raid: RaidState): void {
  const camp = state.world.pois[raid.camp];
  delete state.raids[raid.id];
  if (!camp || !camp.active) {
    // The camp was cleared while its raiders were on the road: they scatter.
    ctx.events.push({ t: 'RaidResolved', tick: state.tick, raid: raid.id, won: true });
    return;
  }
  const def = cityDefence(state);
  const heroId = def.heroes[0];
  const allies = def.heroes.slice(1, 3).map((h) => battleHero(state, h));
  const wallPool = def.wallHp + def.towerHp;
  const mods = playerSideMods(state, heroId ?? null, def.home);
  const input: BattleInput = {
    attacker: { name: 'Bandit Raiders', hero: null, stacks: raid.troops },
    defender: { name: 'The Town', hero: heroId ? battleHero(state, heroId) : null, stacks: [...def.home, ...def.lent], allies, mods },
    winter: SEASON_IDS[state.season.index] === 'winter',
    walls: wallPool > 0 ? { hp: wallPool, absorbPct: BALANCE.raids.wallAbsorbPct } : null,
    towers: def.towerAtk > 0 ? { damage: def.towerAtk * BALANCE.raids.towerDamageMult } : null,
  };
  const reportId = state.nextId++;
  const res = resolveBattle(input, hash32(state.seed, 'raid', state.tick, raid.id));
  const raidersWon = res.winner === 'attacker';

  // Defender losses: the player's share of each troop id (lent lord troops soak their part), part wounded.
  const share = Math.min(1, woundedShare(state, mods.woundedRatioPct) + res.woundedBonusB);
  const homeCount: Record<string, number> = {};
  for (const s of def.home) homeCount[s.troop] = s.count;
  const lentCount: Record<string, number> = {};
  for (const s of def.lent) lentCount[s.troop] = (lentCount[s.troop] ?? 0) + s.count;
  const lostPlayer: Record<string, number> = {};
  const woundedB: Record<string, number> = {};
  for (const t of Object.keys(res.lossesB).sort()) {
    const h = homeCount[t] ?? 0;
    const total = h + (lentCount[t] ?? 0);
    const pl = total > 0 ? Math.min(h, Math.round(((res.lossesB[t] ?? 0) * h) / total)) : 0;
    if (pl <= 0) continue;
    lostPlayer[t] = pl;
    const pool = state.troops[t];
    if (pool) pool.healthy = Math.max(0, pool.healthy - pl);
    const w = Math.round(pl * share);
    if (w > 0) { woundedB[t] = w; addWounded(state, t, w); }
  }

  let loot: Res = {};
  let damaged: string[] = [];
  if (raidersWon) {
    const start = totalCount(raid.troops);
    const left = Object.values(res.survivorsA).reduce((a, b) => a + b, 0);
    const pct = Math.max(BALANCE.raids.lootMinPct, start > 0 ? (BALANCE.raids.lootPct * left) / start : 0);
    loot = lootCity(state, Math.min(BALANCE.raids.lootPct, pct));
    damaged = damageBuildings(state, ctx, raid.id);
    state.stats.battlesLost += 1;
    // quests derives raidsLost/raidsWon from RaidResolved events; this private tally only drives the peril trigger.
    bump(state, 'raidDefeats');
    if ((state.quests.counters.raidDefeats ?? 0) >= BALANCE.raids.peril) state.quests.counters.cityInPeril = 1;
  } else {
    state.stats.battlesWon += 1;
    // The beaten camp loses a share of its strength.
    const d = WORLD.banditCamps.find((c) => c.tier === camp.tier);
    if (d) {
      camp.strength = Math.max(d.baseStrength, Math.floor(camp.strength * (1 - BALANCE.raids.defeatCampLoss)));
      camp.level = campLevel(camp.tier, camp.strength);
    }
  }

  const report: BattleReport = {
    id: reportId, tick: state.tick, attackerName: input.attacker.name, defenderName: input.defender.name, target: 'city',
    winner: res.winner, rounds: res.rounds, casualtiesA: res.lossesA, casualtiesB: lostPlayer, woundedA: {},
    loot, items: [], heroXp: 0, rageEvents: res.rageEvents, kind: 'raid', woundedB, damaged,
  };
  state.reports.push(report);
  if (state.reports.length > BALANCE.reportsKept) state.reports.splice(0, state.reports.length - BALANCE.reportsKept);
  ctx.events.push({ t: 'BattleResolved', tick: state.tick, report: reportId, winner: res.winner, target: 'city' });
  ctx.events.push({ t: 'RaidResolved', tick: state.tick, raid: raid.id, won: !raidersWon, report: reportId, loot, damaged });
}

/** Warnings and arrivals. In safe mode raids in flight turn back (nothing happens while the game is closed). */
export function tickRaids(state: GameState, ctx: TickCtx): void {
  for (const id of sortedKeys(state.raids)) {
    const raid = state.raids[id];
    if (!raid) continue;
    if (ctx.safeMode) {
      delete state.raids[id];
      ctx.events.push({ t: 'RaidResolved', tick: state.tick, raid: id, won: true });
      continue;
    }
    if (!raid.warned && state.tick >= (raid.warnAt ?? raid.arriveAt)) {
      raid.warned = true;
      ctx.events.push({ t: 'RaidWarning', tick: state.tick, raid: id, arriveAt: raid.arriveAt });
    }
    if (state.tick >= raid.arriveAt) resolveRaid(state, ctx, raid);
  }
}
