// Read-only helpers over march state for the UI (ETA, position, labels).
import { findPath } from '@sim/nav';
import { marchSlots } from '@sim/nav/modifiers';
import { carryCap, gatherPerTick, progressPerTick } from '@sim/nav/marchCore';
import { BALANCE, TROOPS } from '@sim/data/registry';
import { COUNTERED_BY, battlePreview } from '@sim/combat/preview';
import type { ClassId } from '@sim/combat/preview';
import type { GameState, MarchState } from '@sim/state';

/** Ticks until the march reaches the end of its current path (0 when gathering/fighting/done). */
export function marchEta(state: GameState, m: MarchState): number {
  if (m.state !== 'moving' && m.state !== 'returning') return 0;
  const last = m.path.length - 1;
  let total = 0;
  for (let i = m.step; i < last && i < m.step + 400; i++) {
    const p = progressPerTick(state, m, m.path[i]!, m.path[i + 1]!);
    const remaining = i === m.step ? 1000 - m.progress : 1000;
    total += remaining / Math.max(0.01, p);
  }
  return Math.ceil(total);
}

/** Estimated one-way travel ticks for a prospective march. Returns null when no path exists. */
export function estimateTravel(state: GameState, hero: string, troops: Record<string, number>, destCell: number): number | null {
  const path = findPath(state.world, state.world.capitalCell, destCell);
  if (!path) return null;
  const fake = { hero, troops, target: {} } as MarchState;
  let total = 0;
  for (let i = 0; i + 1 < path.length; i++) total += 1000 / Math.max(0.01, progressPerTick(state, fake, path[i]!, path[i + 1]!));
  return Math.ceil(total);
}

export function slotsInfo(state: GameState): { used: number; max: number } {
  return { used: Object.keys(state.marches).length, max: Math.min(marchSlots(state), BALANCE.marchSlotsMax) };
}

export function marchTargetCell(state: GameState, m: MarchState): number {
  if (m.target.node) return state.world.nodes[m.target.node]?.cell ?? state.world.capitalCell;
  if (m.target.poi) return state.world.pois[m.target.poi]?.cell ?? state.world.capitalCell;
  return m.target.cell ?? m.path[m.path.length - 1] ?? state.world.capitalCell;
}

/** Ticks left until a gathering march has loaded up (0 when it is not gathering). */
export function gatherTicksLeft(state: GameState, m: MarchState): number {
  return m.state === 'gathering' && m.gatherEndsAt !== undefined ? Math.max(0, m.gatherEndsAt - state.tick) : 0;
}

/** Estimated ticks to fill the carry capacity (or empty the node) for a prospective gather march; null when it cannot gather. */
export function estimateGather(state: GameState, hero: string, troops: Record<string, number>, nodeId: string): number | null {
  const n = state.world.nodes[nodeId];
  if (!n) return null;
  const rate = gatherPerTick(state, { hero, troops, target: {} } as MarchState);
  const cap = carryCap(troops);
  if (rate <= 0 || cap <= 0) return null;
  return Math.ceil(Math.min(n.amount, cap) / rate);
}

/**
 * Best army for an attack on a bandit camp, lair or boss: troops of the classes that counter what the enemy fields come first
 * (recommended order, higher tier first), neutral classes next, classes the enemy counters last, filled up to `lead`.
 * The counter-first army is compared with the plain strongest-first army through the battle preview and the likelier win is kept.
 */
export function bestAttackTroops(state: GameState, poi: string, hero: string, ids: string[], have: (id: string) => number, lead: number): Record<string, number> {
  const prev = battlePreview(state, null, poi);
  const fill = (order: string[]): Record<string, number> => {
    const out: Record<string, number> = {};
    let room = lead;
    for (const id of order) {
      const n = Math.min(have(id), room);
      if (n > 0) { out[id] = n; room -= n; }
    }
    return out;
  };
  const byPower = [...ids].sort((a, b) => (TROOPS[b]?.tier ?? 0) - (TROOPS[a]?.tier ?? 0) || (a < b ? -1 : 1));
  if (!prev) return fill(byPower);
  const enemy = (Object.keys(prev.enemyByClass) as ClassId[]).filter((c) => prev.enemyByClass[c] > 0);
  const rank = (id: string): number => {
    const cls = (TROOPS[id]?.class ?? 'infantry') as ClassId;
    const i = prev.recommended.indexOf(cls);
    if (i >= 0) return i;
    return enemy.some((e) => COUNTERED_BY[cls] === e) ? 1000 : 100;
  };
  const counters = fill([...ids].sort((a, b) => rank(a) - rank(b) || (TROOPS[b]?.tier ?? 0) - (TROOPS[a]?.tier ?? 0) || (a < b ? -1 : 1)));
  const plain = fill(byPower);
  const score = (t: Record<string, number>): number => {
    if (!Object.keys(t).length) return -1;
    const o = battlePreview(state, { hero, troops: t }, poi)?.outcome;
    return o ? o.winChance - o.lossShare : -1;
  };
  return score(counters) >= score(plain) ? counters : plain;
}
