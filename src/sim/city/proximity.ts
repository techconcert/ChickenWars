// Proximity bonus (docs/systems/city.md): resource buildings produce more with their resource nearby.
// Counts matching terrain cells at hex distance 2..radius (distance 1 is the adjacency bonus). Numbers: balance.json `proximity`.
import { BALANCE } from '../data/registry';
import type { GameState } from '../state';
import { baseGrid } from './grid';

export interface ProximityInfo { pct: number; cells: number; max: number; label: string }

const offsets = new Map<number, [number, number][]>();

/** Axial offsets (dq, dr) with hex distance 2..radius. */
function ring(radius: number): [number, number][] {
  let o = offsets.get(radius);
  if (!o) {
    o = [];
    for (let dq = -radius; dq <= radius; dq++) {
      for (let dr = -radius; dr <= radius; dr++) {
        const d = Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
        if (d >= 2 && d <= radius) o.push([dq, dr]);
      }
    }
    offsets.set(radius, o);
  }
  return o;
}

export function hasProximity(type: string): boolean {
  return type in BALANCE.proximity;
}

/** Proximity details for a building type standing on `cell`; null when the type has no rule. */
export function proximityInfo(state: GameState, type: string, cell: number): ProximityInfo | null {
  const rule = BALANCE.proximity[type];
  if (!rule) return null;
  if (cell < 0 || cell >= state.city.terrain.length) return { pct: 0, cells: 0, max: rule.max, label: rule.label };
  const g = baseGrid(state.city.radius);
  const q0 = g.q[cell] ?? 0, r0 = g.r[cell] ?? 0;
  let n = 0;
  for (const [dq, dr] of ring(rule.radius)) {
    const c = g.idxOf(q0 + dq, r0 + dr);
    if (c >= 0 && rule.terrain.includes(state.city.terrain[c] ?? 0)) n++;
  }
  return { pct: Math.min(rule.max, n * rule.perCell), cells: n, max: rule.max, label: rule.label };
}

/** Proximity bonus in percent (0 when the type has no rule). */
export function proximityBonus(state: GameState, type: string, cell: number): number {
  return proximityInfo(state, type, cell)?.pct ?? 0;
}
