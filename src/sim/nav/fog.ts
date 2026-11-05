// Fog of war (docs/systems/world.md): 0 unexplored, 1 explored, 2 visible. Explored persists.
import { TROOPS, effectsAt } from '../data/registry';
import { heroStats } from '../heroStats';
import type { GameState } from '../state';
import { sortedKeys } from '../util';
import { CAPITAL_VISION, MARCH_VISION, SCOUT_VISION } from './constants';
import { gridFor } from './hex';
import { fogRevealBonus, visionBonus } from './modifiers';
import { marchCell } from './position';

export interface VisionSource { cell: number; radius: number }

/** Radius of the city's vision: Town Hall 6, or the best watchtower, plus research. */
export function capitalVision(state: GameState): number {
  let r = CAPITAL_VISION;
  for (const id of sortedKeys(state.city.buildings)) {
    const b = state.city.buildings[id]!;
    for (const e of effectsAt(b.type, 'vision', b.level)) if (e.radius > r) r = e.radius;
  }
  return r + visionBonus(state);
}

export function marchHasCavalry(m: { troops: Record<string, number> }): boolean {
  for (const t of Object.keys(m.troops)) if ((m.troops[t] ?? 0) > 0 && TROOPS[t]?.class === 'cavalry') return true;
  return false;
}

export function marchVision(state: GameState, m: GameState['marches'][string]): number {
  const scout = m.kind === 'scout';
  const base = scout && marchHasCavalry(m) ? SCOUT_VISION : MARCH_VISION;
  return base + visionBonus(state) + (scout ? fogRevealBonus(state) : 0) + heroStats(state, m.hero).vision;
}

export function visionSources(state: GameState): VisionSource[] {
  const out: VisionSource[] = [{ cell: state.world.capitalCell, radius: capitalVision(state) }];
  for (const id of sortedKeys(state.marches)) {
    const m = state.marches[id]!;
    const cell = marchCell(m);
    if (cell >= 0) out.push({ cell, radius: marchVision(state, m) });
  }
  return out;
}

/** Marks `radius` around `cell` visible in `vis`. */
function mark(radiusOf: number, state: GameState, vis: Uint8Array, cell: number): void {
  const g = gridFor(state.world.radius);
  const q0 = g.q[cell]!;
  const r0 = g.r[cell]!;
  for (let dq = -radiusOf; dq <= radiusOf; dq++) {
    for (let dr = Math.max(-radiusOf, -dq - radiusOf); dr <= Math.min(radiusOf, -dq + radiusOf); dr++) {
      const id = g.idxOf(q0 + dq, r0 + dr);
      if (id >= 0) vis[id] = 1;
    }
  }
}

/** Recomputes the visible set from all sources. Returns the number of cells explored for the first time. */
export function recomputeFog(state: GameState, extra: readonly VisionSource[] = []): number {
  const w = state.world;
  const vis = new Uint8Array(w.fog.length);
  for (const s of visionSources(state)) mark(s.radius, state, vis, s.cell);
  for (const s of extra) mark(s.radius, state, vis, s.cell);
  let fresh = 0;
  for (let c = 0; c < w.fog.length; c++) {
    const old = w.fog[c]!;
    if (vis[c]) {
      if (old === 0) fresh++;
      w.fog[c] = 2;
    } else if (old === 2) w.fog[c] = 1;
  }
  if (fresh) state.quests.counters.cellsExplored = (state.quests.counters.cellsExplored ?? 0) + fresh;
  return fresh;
}
