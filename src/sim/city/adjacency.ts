// Adjacency bonuses (docs/systems/city.md): farm-farm +5% each (max 20), lumber camp per forest cell +10% (max 30),
// quarry per rock or cliff cell +10% (max 30). Clan/tech `adjacency` effects scale the result.
import type { GameState } from '../state';
import { cellNeighbours } from './grid';
import { adjacencyExtraPct } from './modifiers';

interface Rule { source: 'building' | 'terrain'; match: readonly (string | number)[]; per: number; max: number }

const RULES: Record<string, Rule> = {
  farm: { source: 'building', match: ['farm'], per: 5, max: 20 },
  lumber_camp: { source: 'terrain', match: [1], per: 10, max: 30 },
  quarry: { source: 'terrain', match: [2, 4], per: 10, max: 30 },
};

/** Which building types have an adjacency rule (for the placement ghost). */
export function hasAdjacency(type: string): boolean {
  return type in RULES;
}

/** Adjacency bonus in percent for a building of `type` standing on `cell` (completed neighbours only). */
export function adjacencyBonus(state: GameState, type: string, cell: number): number {
  const rule = RULES[type];
  if (!rule || cell < 0 || cell >= state.city.terrain.length) return 0;
  const nbs = cellNeighbours(state.city.radius, cell);
  let n = 0;
  if (rule.source === 'terrain') {
    for (const c of nbs) if (c >= 0 && rule.match.includes(state.city.terrain[c] ?? 0)) n++;
  } else {
    const set = new Set(nbs);
    for (const id of Object.keys(state.city.buildings)) {
      const b = state.city.buildings[id];
      if (b && b.level >= 1 && set.has(b.cell) && rule.match.includes(b.type)) n++;
    }
  }
  const base = Math.min(rule.max, n * rule.per);
  return base * (1 + adjacencyExtraPct(state, type) / 100);
}
