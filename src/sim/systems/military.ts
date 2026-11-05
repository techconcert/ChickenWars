import { DAY_TICKS, FP, TICKS_PER_MINUTE } from '../constants';
import type { CommandOf } from '../commands';
import { emit } from '../ctx';
import type { Handler, TickCtx } from '../ctx';
import { BALANCE, TROOPS, effectsAt } from '../data/registry';
import type { GameState, Res, TrainJob } from '../state';
import { canAfford, pay, refund, scaleCost } from '../city/cost';
import { trainTimePct, troopCostPct, woundedRatioPct } from '../city/modifiers';
import { buffSum } from '../bonuses';
import { researchBonus } from '../research/bonus';
import { getPopulation } from '../city/pop';
import { sortedKeys } from '../util';

/** Effective cost of a batch (clan/tech costMult per troop class applied). */
export function trainCost(state: GameState, troop: string, count: number): Res {
  const def = TROOPS[troop];
  if (!def) return {};
  const total: Res = {};
  for (const k of Object.keys(def.cost) as (keyof Res)[]) total[k] = (def.cost[k] ?? 0) * count;
  return scaleCost(total, Math.max(0, 1 + troopCostPct(state, def.class) / 100));
}

/** trainSpeed multiplier of a building instance for a troop class (1 if none). */
function speedMult(state: GameState, building: string, cls: string): number {
  const b = state.city.buildings[building];
  if (!b) return 1;
  let m = 1;
  for (const e of effectsAt(b.type, 'trainSpeed', b.level)) if (e.troopClass === cls) m = e.mult;
  return m * (1 + researchBonus(state, 'trainSpeed', { class: cls }) / 100);
}

/** Duration in ticks of a batch at a given building. */
export function trainDuration(state: GameState, building: string, troop: string, count: number): number {
  const def = TROOPS[troop];
  if (!def) return 1;
  const t = (count * def.trainTicks * Math.max(0.1, 1 + trainTimePct(state) / 100)) / speedMult(state, building, def.class);
  return Math.max(1, Math.round(t));
}

/** Picks the eligible building instance with the shortest queue (ties: lowest id); null if none has a free slot. */
function pickBuilding(state: GameState, troop: string): { id: string | null; err: string | null } {
  const def = TROOPS[troop];
  if (!def) return { id: null, err: 'unknown_troop' };
  let found = false;
  let best: string | null = null;
  let bestN = Infinity;
  for (const id of sortedKeys(state.city.buildings)) {
    const b = state.city.buildings[id];
    if (!b || b.type !== def.building || b.level < Math.max(1, def.minBuildingLevel)) continue;
    found = true;
    const n = state.training.filter((j) => j.building === id).length;
    if (n < BALANCE.trainQueueMax && n < bestN) { best = id; bestN = n; }
  }
  if (!found) return { id: null, err: 'no_building' };
  return best ? { id: best, err: null } : { id: null, err: 'queue_full' };
}

export const handlers: { [K in 'train' | 'cancelTrain']: Handler<CommandOf<K>> } = {
  train: {
    validate(state, cmd) {
      const def = TROOPS[cmd.troop];
      if (!def || def.role === 'enemy') return 'unknown_troop'; // human enemy troops cannot be trained
      if (!Number.isInteger(cmd.count) || cmd.count < 1 || cmd.count > BALANCE.trainBatchMax) return 'bad_count';
      if (def.requiresTech && !state.research.done.includes(def.requiresTech)) return 'tech';
      const pick = pickBuilding(state, cmd.troop);
      if (pick.err) return pick.err;
      if (!canAfford(state, trainCost(state, cmd.troop, cmd.count))) return 'cost';
      if (getPopulation(state).free < cmd.count * def.popCost) return 'pop_cap';
      return null;
    },
    apply(state, cmd) {
      const pick = pickBuilding(state, cmd.troop);
      if (!pick.id) return;
      const cost = trainCost(state, cmd.troop, cmd.count);
      pay(state, cost);
      state.training.push({ id: String(state.nextId++), building: pick.id, troop: cmd.troop, count: cmd.count, startTick: null, endTick: null, cost });
    },
  },
  cancelTrain: {
    validate(state, cmd) {
      return state.training.some((j) => j.id === cmd.job) ? null : 'no_job';
    },
    apply(state, cmd) {
      const job = state.training.find((j) => j.id === cmd.job);
      if (!job) return;
      refund(state, job.cost, job.startTick === null ? 1 : 0.5);
      state.training = state.training.filter((j) => j !== job);
    },
  },
};

// ---- wounded and healing

/** Troop ids ordered highest tier first (ties by id). */
function tierOrder(): string[] {
  return Object.keys(TROOPS).sort((a, b) => (TROOPS[b]?.tier ?? 0) - (TROOPS[a]?.tier ?? 0) || (a < b ? -1 : 1));
}

/** Fraction of battle losses that become wounded: 0.6 base, +1.5% per infirmary level (best one), + research, max 0.85. */
export function woundedShare(state: GameState, extraPct = 0): number {
  let best = 0;
  for (const id of sortedKeys(state.city.buildings)) {
    const b = state.city.buildings[id];
    if (b && effectsAt(b.type, 'woundedCap', b.level).length) best = Math.max(best, b.level);
  }
  const v = BALANCE.woundedShare.base + best * 0.015 + (woundedRatioPct(state) + extraPct) / 100;
  return Math.min(BALANCE.woundedShare.max, v);
}

/** Moves `n` casualties of `troop` into the wounded pool (creates the pool if needed). */
export function addWounded(state: GameState, troop: string, n: number): void {
  if (n <= 0) return;
  const p = (state.troops[troop] ??= { healthy: 0, wounded: 0 });
  p.wounded += n;
}

export function woundedCap(state: GameState): number {
  let cap = 0;
  for (const id of sortedKeys(state.city.buildings)) {
    const b = state.city.buildings[id];
    if (b) for (const e of effectsAt(b.type, 'woundedCap', b.level)) cap += e.amount;
  }
  return cap;
}

export function healPerMinute(state: GameState): number {
  let r = 0;
  for (const id of sortedKeys(state.city.buildings)) {
    const b = state.city.buildings[id];
    if (b) for (const e of effectsAt(b.type, 'heal', b.level)) r += e.perMinute;
  }
  const mult = 1 + (researchBonus(state, 'healMult') + buffSum(state, 'healMult')) / 100;
  return r * Math.max(0, mult);
}

export function totalWounded(state: GameState): number {
  let n = 0;
  for (const id of Object.keys(state.troops)) n += state.troops[id]?.wounded ?? 0;
  return n;
}

function heal(state: GameState, ctx: TickCtx, ticks = 1): void {
  if (totalWounded(state) === 0) {
    if (state.healAccum) state.healAccum = 0;
    return;
  }
  const total = (state.healAccum ?? 0) + Math.round((healPerMinute(state) * FP * ticks) / TICKS_PER_MINUTE);
  let whole = Math.floor(total / FP);
  state.healAccum = total - whole * FP;
  for (const id of tierOrder()) {
    if (whole <= 0) break;
    const p = state.troops[id];
    if (!p || p.wounded <= 0) continue;
    const n = Math.min(p.wounded, whole);
    p.wounded -= n;
    p.healthy += n;
    whole -= n;
    emit(ctx, { t: 'TroopsHealed', tick: state.tick, troop: id, count: n });
  }
}

/** At day end, wounded beyond the infirmary capacity die (lowest tier first). */
function dayEndWounded(state: GameState, ctx: TickCtx): void {
  let excess = totalWounded(state) - woundedCap(state);
  if (excess <= 0) return;
  let died = 0;
  for (const id of tierOrder().reverse()) {
    if (excess <= 0) break;
    const p = state.troops[id];
    if (!p || p.wounded <= 0) continue;
    const n = Math.min(p.wounded, excess);
    p.wounded -= n;
    excess -= n;
    died += n;
  }
  if (died > 0) emit(ctx, { t: 'WoundedDied', tick: state.tick, count: died });
}

/** Training queues (sequential per building), then healing, then end-of-day wounded cull. */
export function tickMilitary(state: GameState, ctx: TickCtx, ticks = 1): void {
  if (state.training.length) {
    const done: TrainJob[] = [];
    for (const j of state.training) if (j.endTick !== null && j.endTick <= state.tick) done.push(j);
    for (const j of done) {
      (state.troops[j.troop] ??= { healthy: 0, wounded: 0 }).healthy += j.count;
      emit(ctx, { t: 'TroopsTrained', tick: state.tick, troop: j.troop, count: j.count });
    }
    if (done.length) state.training = state.training.filter((j) => !done.includes(j));
    const busy = new Set<string>();
    for (const j of state.training) if (j.startTick !== null) busy.add(j.building);
    for (const j of state.training) {
      if (j.startTick !== null || busy.has(j.building)) continue;
      busy.add(j.building);
      j.startTick = state.tick;
      j.endTick = state.tick + trainDuration(state, j.building, j.troop, j.count);
    }
  }
  heal(state, ctx, ticks);
  if (state.tick > 0 && state.tick % DAY_TICKS === 0) dayEndWounded(state, ctx);
}
