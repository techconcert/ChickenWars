import type { CommandOf } from '../commands';
import { emit } from '../ctx';
import type { Handler, TickCtx } from '../ctx';
import { BALANCE, BUILDINGS, buildingCost, buildingTicks } from '../data/registry';
import type { BuildJob, GameState, Res } from '../state';
import { canAfford, pay, refund, RES_KEYS } from '../city/cost';
import { buildSpeedPct } from '../city/modifiers';
import { cellError, getBuilders, maxQueueLength, placementError, requiresError, townHallLevel } from '../city/territory';

export { adjacencyBonus } from '../city/adjacency';

function jobOf(state: GameState, building: string): BuildJob | undefined {
  return state.city.queue.find((j) => j.building === building);
}

function enqueue(state: GameState, building: string, targetLevel: number, type: string): void {
  const cost = buildingCost(type, targetLevel);
  pay(state, cost);
  state.city.queue.push({
    id: String(state.nextId++), building, targetLevel, startTick: null, endTick: null,
    ticks: buildingTicks(type, targetLevel), cost,
  });
}

/** Cumulative cost of levels 1..level. */
function cumulativeCost(type: string, level: number): Res {
  const out: Res = {};
  for (let l = 1; l <= level; l++) {
    const c = buildingCost(type, l);
    for (const k of RES_KEYS) if (c[k] !== undefined) out[k] = (out[k] ?? 0) + (c[k] ?? 0);
  }
  return out;
}

export const handlers: { [K in 'build' | 'upgrade' | 'cancelBuild' | 'moveBuilding' | 'reorderBuild' | 'demolish' | 'repair']: Handler<CommandOf<K>> } = {
  build: {
    validate(state, cmd) {
      const err = placementError(state, cmd.building, cmd.cell);
      if (err) return err;
      if (state.city.queue.length >= maxQueueLength(state)) return 'queue_full';
      if (!canAfford(state, buildingCost(cmd.building, 1))) return 'cost';
      return null;
    },
    apply(state, cmd) {
      const id = String(state.nextId++);
      state.city.buildings[id] = { id, type: cmd.building, cell: cmd.cell, level: 0, damaged: false };
      enqueue(state, id, 1, cmd.building);
    },
  },
  upgrade: {
    validate(state, cmd) {
      const b = state.city.buildings[cmd.building];
      if (!b) return 'unknown_building';
      const def = BUILDINGS[b.type];
      if (!def || b.level < 1) return 'under_construction';
      if (jobOf(state, b.id)) return 'busy';
      if (b.level >= def.maxLevel) return 'max_level';
      const target = b.level + 1;
      if (b.type !== 'town_hall' && target > townHallLevel(state)) return 'th_level';
      const rq = requiresError(state, b.type);
      if (rq) return rq;
      if (state.city.queue.length >= maxQueueLength(state)) return 'queue_full';
      if (!canAfford(state, buildingCost(b.type, target))) return 'cost';
      return null;
    },
    apply(state, cmd) {
      const b = state.city.buildings[cmd.building];
      if (b) enqueue(state, b.id, b.level + 1, b.type);
    },
  },
  /** Free move of a finished building to another free tile in the territory (the Town Hall stays put). */
  moveBuilding: {
    validate(state, cmd) {
      const b = state.city.buildings[cmd.building];
      if (!b) return 'no_building';
      if (b.type === 'town_hall') return 'protected';
      if (b.level < 1 || jobOf(state, b.id)) return 'busy';
      if (b.cell === cmd.cell) return 'occupied';
      return cellError(state, cmd.cell);
    },
    apply(state, cmd, ctx) {
      const b = state.city.buildings[cmd.building]!;
      b.cell = cmd.cell;
      emit(ctx, { t: 'BuildingMoved', tick: state.tick, building: b.id, type: b.type, cell: cmd.cell });
    },
  },
  /** Moves a waiting job to position `to` among the waiting jobs (0 = next to start). Running jobs stay in front and cannot be moved. */
  reorderBuild: {
    validate(state, cmd) {
      const job = state.city.queue.find((j) => j.id === cmd.job);
      if (!job) return 'no_job';
      if (job.startTick !== null) return 'busy';
      const waiting = state.city.queue.filter((j) => j.startTick === null).length;
      if (!Number.isInteger(cmd.to) || cmd.to < 0 || cmd.to >= waiting) return 'bad_amount';
      return null;
    },
    apply(state, cmd) {
      const running = state.city.queue.filter((j) => j.startTick !== null);
      const waiting = state.city.queue.filter((j) => j.startTick === null);
      const from = waiting.findIndex((j) => j.id === cmd.job);
      const [job] = waiting.splice(from, 1);
      waiting.splice(cmd.to, 0, job!);
      state.city.queue = [...running, ...waiting];
    },
  },
  cancelBuild: {
    validate(state, cmd) {
      return jobOf(state, cmd.building) ? null : 'no_job';
    },
    apply(state, cmd, ctx) {
      const job = jobOf(state, cmd.building);
      if (!job) return;
      const r = BALANCE.cancelRefund;
      const progress = job.startTick === null ? 0 : Math.min(1, (state.tick - job.startTick) / Math.max(1, job.ticks));
      refund(state, job.cost, progress < r.earlyThreshold ? r.early : r.late);
      state.city.queue = state.city.queue.filter((j) => j !== job);
      const b = state.city.buildings[job.building];
      if (b && b.level === 0) {
        delete state.city.buildings[b.id];
        emit(ctx, { t: 'BuildingDemolished', tick: state.tick, building: b.id, type: b.type });
      }
    },
  },
  demolish: {
    validate(state, cmd) {
      const b = state.city.buildings[cmd.building];
      if (!b) return 'unknown_building';
      if (b.type === 'town_hall') return 'protected';
      if (b.level < 1 || jobOf(state, b.id)) return 'busy';
      if (state.training.some((t) => t.building === b.id)) return 'training';
      return null;
    },
    apply(state, cmd, ctx) {
      const b = state.city.buildings[cmd.building];
      if (!b) return;
      refund(state, cumulativeCost(b.type, b.level), BALANCE.demolishRefund);
      delete state.city.buildings[b.id];
      emit(ctx, { t: 'BuildingDemolished', tick: state.tick, building: b.id, type: b.type });
    },
  },
  repair: {
    validate(state, cmd) {
      const b = state.city.buildings[cmd.building];
      if (!b) return 'unknown_building';
      if (!b.damaged) return 'not_damaged';
      if (!canAfford(state, repairCost(state, b.id))) return 'cost';
      return null;
    },
    apply(state, cmd) {
      const b = state.city.buildings[cmd.building];
      if (!b) return;
      pay(state, repairCost(state, b.id));
      b.damaged = false;
    },
  },
};

/** 25% of the current level's build cost, rounded up. */
export function repairCost(state: GameState, building: string): Res {
  const b = state.city.buildings[building];
  if (!b || b.level < 1) return {};
  const c = buildingCost(b.type, b.level);
  const out: Res = {};
  for (const k of RES_KEYS) if (c[k] !== undefined) out[k] = Math.ceil((c[k] ?? 0) * 0.25);
  return out;
}

/** Completes finished jobs, then starts waiting jobs (FIFO) while a builder is free. */
export function tickCity(state: GameState, ctx: TickCtx): void {
  const q = state.city.queue;
  if (q.length === 0) return;
  const done: BuildJob[] = [];
  for (const j of q) if (j.endTick !== null && j.endTick <= state.tick) done.push(j);
  if (done.length) {
    for (const j of done) {
      const b = state.city.buildings[j.building];
      if (!b) continue;
      b.level = j.targetLevel;
      emit(ctx, { t: 'BuildingCompleted', tick: state.tick, building: b.id, type: b.type, level: b.level, cell: b.cell });
      if (b.level > 1) emit(ctx, { t: 'BuildingUpgraded', tick: state.tick, building: b.id, type: b.type, level: b.level });
    }
    state.city.queue = q.filter((j) => !done.includes(j));
  }
  const builders = getBuilders(state);
  let active = 0;
  for (const j of state.city.queue) if (j.startTick !== null) active++;
  for (const j of state.city.queue) {
    if (active >= builders) break;
    if (j.startTick !== null) continue;
    j.startTick = state.tick;
    // Research/talent buildSpeed shortens the job when it starts; `ticks` then holds the effective duration (UI bars, refunds).
    j.ticks = Math.max(1, Math.round(j.ticks / (1 + buildSpeedPct(state) / 100)));
    j.endTick = state.tick + j.ticks;
    active++;
    const b = state.city.buildings[j.building];
    if (b) emit(ctx, { t: 'BuildingStarted', tick: state.tick, building: b.id, type: b.type, level: j.targetLevel });
  }
}

