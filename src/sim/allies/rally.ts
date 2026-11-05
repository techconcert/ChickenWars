// Rallies: allied lords' armies join a march against a camp/lair/boss (docs/systems/allies.md).
import { stacksPower } from '../combat/power';
import type { BattleHero } from '../combat/resolver';
import type { BattleResult } from '../combat/resolver';
import type { TickCtx } from '../ctx';
import { BALANCE, LORDS } from '../data/registry';
import { cellDistance, gridFor } from '../nav';
import type { GameState, LordState, MarchState, RallyState, Res, ResourceId, Stack } from '../state';
import { sortedKeys } from '../util';
import { bundleValue, changeRep, lordStage } from './lords';
import { armyStacks } from './perks';

/** Max allied heroes added to the battle. */
export const MAX_ALLY_HEROES = 2;
/** Max lords invited to one rally. */
export const MAX_RALLY_LORDS = 3;

export interface RallyAugment { extraStacks: Stack[]; allyHeroes: BattleHero[]; lords: string[] }

function joinedLords(state: GameState, rally: RallyState): LordState[] {
  return rally.arrived.map((id) => state.lords[id]).filter((l): l is LordState => !!l && lordStage(l.rep) === 'allied')
    .sort((a, b) => b.rep - a.rep || (a.id < b.id ? -1 : 1));
}

/** Lords' stacks and heroes that fight with a rally march (empty augment when the rally is gone). Records contributions. */
export function rallyAugment(state: GameState, march: MarchState): RallyAugment {
  const rally = march.rally ? state.rallies[march.rally] : undefined;
  if (!rally) return { extraStacks: [], allyHeroes: [], lords: [] };
  const lords = joinedLords(state, rally);
  const merged: Record<string, number> = {};
  const contrib: Record<string, number> = {};
  for (const l of lords) {
    const st = armyStacks(l.id, BALANCE.allies.rallyArmyPct);
    contrib[l.id] = Math.max(1, stacksPower(st));
    for (const s of st) merged[s.troop] = (merged[s.troop] ?? 0) + s.count;
  }
  const player: Stack[] = Object.keys(march.troops).sort().map((troop) => ({ troop, count: march.troops[troop] ?? 0 }));
  contrib.player = Math.max(1, stacksPower(player));
  rally.contrib = contrib;
  const allyHeroes: BattleHero[] = [];
  for (const l of lords.slice(0, MAX_ALLY_HEROES)) {
    const h = LORDS[l.id]?.hero;
    if (h) allyHeroes.push({ name: LORDS[l.id]!.name, atk: h.atk, def: h.def, hp: h.hp, skill: null, skillRank: 1 });
  }
  return {
    extraStacks: Object.keys(merged).sort().map((troop) => ({ troop, count: merged[troop]! })),
    allyHeroes, lords: lords.map((l) => l.id),
  };
}

/** Rewrites a combined battle result to the player's part only (losses split pro rata by troop id). */
export function rallySplit(res: BattleResult, playerStacks: readonly Stack[], extraStacks: readonly Stack[]): void {
  const p0: Record<string, number> = {};
  const e0: Record<string, number> = {};
  for (const s of playerStacks) p0[s.troop] = (p0[s.troop] ?? 0) + s.count;
  for (const s of extraStacks) e0[s.troop] = (e0[s.troop] ?? 0) + s.count;
  const lossesA: Record<string, number> = {};
  const survivorsA: Record<string, number> = {};
  for (const t of Object.keys(p0).sort()) {
    const mine = p0[t] ?? 0;
    const total = mine + (e0[t] ?? 0);
    const loss = total > 0 ? Math.min(mine, Math.round(((res.lossesA[t] ?? 0) * mine) / total)) : 0;
    if (loss > 0) lossesA[t] = loss;
    if (mine - loss > 0) survivorsA[t] = mine - loss;
  }
  res.lossesA = lossesA;
  res.survivorsA = survivorsA;
}

/**
 * Loot split in permille summing to exactly 1000: the player gets rallyPlayerPct, the lords share the rest by contribution.
 * With no lords the player keeps everything.
 */
export function lootShares(playerPct: number, lordContrib: Readonly<Record<string, number>>): { player: number; lords: Record<string, number> } {
  const ids = Object.keys(lordContrib).sort();
  if (!ids.length) return { player: 1000, lords: {} };
  const player = Math.round(playerPct * 10);
  const rest = 1000 - player;
  let sum = 0;
  for (const id of ids) sum += Math.max(0, lordContrib[id] ?? 0);
  const lords: Record<string, number> = {};
  let given = 0;
  let top = ids[0]!;
  for (const id of ids) {
    const c = Math.max(0, lordContrib[id] ?? 0);
    lords[id] = sum > 0 ? Math.floor((rest * c) / sum) : Math.floor(rest / ids.length);
    given += lords[id]!;
    if (c > (lordContrib[top] ?? 0)) top = id;
  }
  lords[top] = (lords[top] ?? 0) + (rest - given);
  return { player, lords };
}

/** Applies the loot split to a rolled loot: returns the player's part and pays the lords' part out as reputation. */
export function rallyLoot(state: GameState, ctx: TickCtx, march: MarchState, resources: Res): Res {
  const rally = march.rally ? state.rallies[march.rally] : undefined;
  if (!rally || !rally.contrib) return resources;
  const lordContrib: Record<string, number> = {};
  for (const id of Object.keys(rally.contrib)) if (id !== 'player') lordContrib[id] = rally.contrib[id]!;
  const shares = lootShares(BALANCE.allies.rallyPlayerPct, lordContrib);
  const mine: Res = {};
  for (const r of Object.keys(resources).sort() as ResourceId[]) {
    const own = Math.floor(((resources[r] ?? 0) * shares.player) / 1000);
    if (own > 0) mine[r] = own;
  }
  for (const id of Object.keys(shares.lords).sort()) {
    const part: Res = {};
    for (const r of Object.keys(resources).sort() as ResourceId[]) part[r] = Math.floor(((resources[r] ?? 0) * (shares.lords[id] ?? 0)) / 1000);
    changeRep(state, ctx, id, Math.floor(bundleValue(part) * BALANCE.allies.giftRepPerValue));
  }
  return mine;
}

/** After the battle: join/kill reputation for the lords that fought, then the rally ends. */
export function rallyDone(state: GameState, ctx: TickCtx, march: MarchState, won: boolean): void {
  const rally = march.rally ? state.rallies[march.rally] : undefined;
  if (!rally) return;
  for (const l of joinedLords(state, rally)) {
    changeRep(state, ctx, l.id, BALANCE.allies.rallyJoinRep + (won ? BALANCE.allies.rallyKillRep : 0));
  }
  delete state.rallies[rally.id];
  delete march.rally;
}

/** Creates the rally record for a freshly created march (the march waits in phase 'done'). */
export function openRally(state: GameState, ctx: TickCtx, march: MarchState, target: string, lords: LordState[]): RallyState {
  const g = gridFor(state.world.radius);
  const arriveAt: Record<string, number> = {};
  const picked = lords.slice(0, MAX_RALLY_LORDS);
  for (const l of picked) {
    const v = state.world.pois[l.poi];
    const d = v ? cellDistance(g, v.cell, state.world.capitalCell) : 0;
    arriveAt[l.id] = state.tick + Math.max(1, Math.ceil(d * BALANCE.allies.lordTicksPerCell));
  }
  const id = `rally_${state.nextId++}`;
  const rally: RallyState = {
    id, march: march.id, target, waitUntil: state.tick + BALANCE.rallyWaitTicks,
    lords: picked.map((l) => l.id), arrived: [], arriveAt, departed: false,
  };
  state.rallies[id] = rally;
  march.rally = id;
  march.state = 'done';
  ctx.events.push({ t: 'RallyStarted', tick: state.tick, rally: id });
  return rally;
}

/** Per tick: lords arrive, the march departs when everyone is here or the wait ends, dead rallies are dropped. */
export function tickRallies(state: GameState, ctx: TickCtx): void {
  for (const id of sortedKeys(state.rallies)) {
    const rally = state.rallies[id]!;
    const m = state.marches[rally.march];
    if (!m) { delete state.rallies[id]; continue; }
    if (rally.departed) continue;
    if (m.state !== 'done') { rally.departed = true; continue; } // recalled or otherwise moved on
    for (const lid of rally.lords) {
      if (rally.arrived.includes(lid)) continue;
      const lord = state.lords[lid];
      if (lord && lordStage(lord.rep) === 'allied' && state.tick >= (rally.arriveAt?.[lid] ?? 0)) {
        rally.arrived.push(lid);
        ctx.events.push({ t: 'RallyJoined', tick: state.tick, rally: id, lord: lid });
      }
    }
    const pending = rally.lords.filter((lid) => {
      const lord = state.lords[lid];
      return !rally.arrived.includes(lid) && !!lord && lordStage(lord.rep) === 'allied' && (rally.arriveAt?.[lid] ?? 0) <= rally.waitUntil;
    });
    if (pending.length === 0 || state.tick >= rally.waitUntil) {
      rally.departed = true;
      m.state = 'moving';
      ctx.events.push({ t: 'RallyDeparted', tick: state.tick, rally: id, lords: rally.arrived.slice() });
    }
  }
}
