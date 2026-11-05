// Balance bot: city building planner. An ordered goal list is walked each decision; the first goal that cannot be
// paid reserves its cost so later goals only spend the surplus (priority queue with a reservation).
import { baseGrid, cellDistance } from '../../src/sim/city/grid';
import { adjacencyBonus } from '../../src/sim/city/adjacency';
import { cellError, getBuilders, townHallLevel } from '../../src/sim/city/territory';
import { validateCommand } from '../../src/sim/commands';
import type { Command } from '../../src/sim/commands';
import { BUILDINGS, buildingCost, maxCountAt } from '../../src/sim/data/registry';
import type { GameState, Res } from '../../src/sim/state';

export type Goal =
  | { k: 'build'; type: string; n: number }
  | { k: 'level'; type: string; level: number }
  | { k: 'th'; level: number };

const B = (type: string, n: number): Goal => ({ k: 'build', type, n });
const L = (type: string, level: number): Goal => ({ k: 'level', type, level });
const T = (level: number): Goal => ({ k: 'th', level });

/** The scripted build order. Counts are clipped to what the Town Hall level allows, so entries above it wait. */
const ECO = ['house', 'farm', 'lumber_camp', 'quarry'];
const eco = (n: number): Goal[] => (n >= 4 ? [...ECO, 'storehouse'] : ECO).map((t) => L(t, n));

/** Per Town Hall stage: new economy buildings, economy levels up to the stage, the next hall, then army and defence. */
export const GOALS: readonly Goal[] = [
  B('farm', 1), B('lumber_camp', 1), B('quarry', 1), B('lumber_camp', 2), B('farm', 2), B('house', 1), T(2),
  B('quarry', 1), B('barracks', 1), B('storehouse', 1), L('lumber_camp', 2), T(3),
  B('house', 2), B('farm', 3), B('lumber_camp', 3), B('quarry', 2), B('storehouse', 2), B('house', 3), T(4),
  B('mine', 1), B('academy', 1), L('academy', 2), B('builders_hut', 1), L('barracks', 3), B('archery_range', 1), L('farm', 3), L('lumber_camp', 3),
  T(5), ...eco(3), L('archery_range', 3), L('stable', 3), B('barracks', 2), B('archery_range', 2), B('infirmary', 1),
  B('watchtower', 2), B('house', 4), B('farm', 4), B('lumber_camp', 4), B('quarry', 2),
  B('tavern', 1), B('archery_range', 1), B('stable', 1), B('infirmary', 1), L('barracks', 3), B('mine', 2), ...eco(4), B('watchtower', 3), B('barracks', 2), B('wall', 4), L('academy', 4), L('watchtower', 4), L('infirmary', 3), L('barracks', 4),
  B('house', 6), B('farm', 5), B('storehouse', 3), B('builders_hut', 2), T(6),
  ...eco(5), B('archery_range', 2), B('stable', 2), B('watchtower', 5), B('wall', 8), L('barracks', 5), L('archery_range', 5), L('stable', 5), L('academy', 5), L('infirmary', 5), L('watchtower', 5),
  B('house', 8), B('farm', 6), B('quarry', 3), B('storehouse', 4), T(7),
  B('builders_hut', 3),
  B('mine', 3), ...eco(6), B('siege_workshop', 1), L('barracks', 6), L('academy', 7),
  B('house', 10), B('farm', 8), T(8),
  ...eco(7), ...eco(8), L('academy', 10),
];

/** Free cell: best adjacency, then nearest the hall (ring 1 kept free), lowest index. */
export function bestCell(state: GameState, type: string, taken: ReadonlySet<string> = new Set()): number | null {
  const th = state.city.buildings[state.city.townHall];
  if (!th) return null;
  const g = baseGrid(state.city.radius);
  let best = -1;
  let bestScore = -Infinity;
  for (let c = 0; c < g.count; c++) {
    if (cellError(state, c) || taken.has(`c${c}`)) continue;
    const d = cellDistance(state.city.radius, th.cell, c);
    if (d < 2) continue;
    const score = adjacencyBonus(state, type, c) * 10 - d;
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return best < 0 ? null : best;
}

export interface Step { cmd: Command; cost: Res }

/** The next concrete command for a goal, or null if the goal is satisfied / unavailable right now. */
export function stepFor(state: GameState, goal: Goal, maxTH: number, taken: ReadonlySet<string> = new Set()): Step | null {
  const th = townHallLevel(state);
  const thId = state.city.townHall;
  const jobs = state.city.queue;
  if (goal.k === 'th') {
    if (th >= goal.level || goal.level > maxTH || jobs.some((j) => j.building === thId) || taken.has('th')) return null;
    return { cmd: { t: 'upgrade', building: thId }, cost: buildingCost('town_hall', th + 1) };
  }
  const def = BUILDINGS[goal.type];
  if (!def) return null;
  if (goal.k === 'build') {
    const want = Math.min(goal.n, maxCountAt(goal.type, th));
    let have = 0;
    for (const id of Object.keys(state.city.buildings)) if (state.city.buildings[id]!.type === goal.type) have++;
    if (have >= want || def.unlockTH > th) return null;
    const cell = bestCell(state, goal.type, taken);
    if (cell === null) return null;
    return { cmd: { t: 'build', building: goal.type, cell }, cost: buildingCost(goal.type, 1) };
  }
  // level goal: the lowest-level instance below min(goal, TH level) that is not being worked on
  const cap = Math.min(goal.level, th, def.maxLevel);
  let pick: { id: string; level: number } | null = null;
  for (const id of Object.keys(state.city.buildings)) {
    const b = state.city.buildings[id]!;
    if (b.type !== goal.type || b.level < 1 || b.level >= cap || jobs.some((j) => j.building === id) || taken.has(`i${id}`)) continue;
    if (!pick || b.level < pick.level) pick = { id, level: b.level };
  }
  if (!pick) return null;
  return { cmd: { t: 'upgrade', building: pick.id }, cost: buildingCost(goal.type, pick.level + 1) };
}

/** Walks the goals; returns commands plus the reservation that other planners (research, training) must respect. */
export function planBuild(state: GameState, avail: Res, maxTH: number, goals: readonly Goal[] = GOALS): { cmds: Command[]; reserve: Res | null } {
  const cmds: Command[] = [];
  let reserve: Res | null = null;
  let room = getBuilders(state) - state.city.queue.length; // concurrent jobs: one per builder (costs are paid up front)
  const left = { ...avail };
  const taken = new Set<string>();
  for (const goal of goals) {
    const step = stepFor(state, goal, maxTH, taken);
    if (!step) continue;
    const cost = step.cost;
    const pay = reserve ? addRes(reserve, cost) : cost;
    if (!canAffordRes(left, pay)) {
      if (!reserve) {
        // the first blocked goal reserves the resources it is short of (a gold shortage must not freeze wood and stone spending)
        reserve = {};
        for (const k of Object.keys(cost) as (keyof Res)[]) if ((left[k] ?? 0) < (cost[k] ?? 0)) reserve[k] = cost[k];
      }
      continue;
    }
    if (room <= 0) { if (!reserve) reserve = cost; continue; }
    const err = validateCommand(state, step.cmd);
    if (err && err !== 'cost') continue;
    cmds.push(step.cmd);
    for (const k of Object.keys(cost) as (keyof Res)[]) left[k] = (left[k] ?? 0) - (cost[k] ?? 0);
    room--;
    if (step.cmd.t === 'build') taken.add(`c${step.cmd.cell}`);
    else if (step.cmd.t === 'upgrade') taken.add(step.cmd.building === state.city.townHall ? 'th' : `i${step.cmd.building}`);
  }
  return { cmds, reserve };
}

function addRes(a: Res, b: Res): Res {
  const out: Res = { ...a };
  for (const k of Object.keys(b) as (keyof Res)[]) out[k] = (out[k] ?? 0) + (b[k] ?? 0);
  return out;
}
function canAffordRes(have: Res, cost: Res): boolean {
  for (const k of Object.keys(cost) as (keyof Res)[]) if ((cost[k] ?? 0) > (have[k] ?? 0)) return false;
  return true;
}
