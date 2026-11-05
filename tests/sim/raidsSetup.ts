import { campLevel } from '@sim/combat/power';
import { cellDistance, gridFor } from '@sim/nav';
import { WORLD } from '@sim/data/registry';
import type { GameState, PoiState } from '@sim/state';
import { makeState } from '../helpers/makeState';
import type { MakeStateOpts } from '../helpers/makeState';

/** Tick after the raid grace period, aligned to the check interval. */
export const RIPE_TICK = 12 * 600 + 600;

/** A walkable land cell `dist` cells from the capital in region `region` (or any region if -1). */
export function cellAt(s: GameState, dist: number, region = -1): number {
  const g = gridFor(s.world.radius);
  for (let c = 0; c < g.count; c++) {
    if ((s.world.navCost[c] ?? 0) <= 0 || ((s.world.flags[c] ?? 0) & 4) === 0 || ((s.world.flags[c] ?? 0) & 16) !== 0) continue;
    if (region >= 0 && s.world.regionOf[c] !== region) continue;
    if (cellDistance(g, c, s.world.capitalCell) === dist) return c;
  }
  throw new Error(`no cell at ${dist}`);
}

export function addCamp(s: GameState, id: string, tier: number, strength: number, dist: number, over: Partial<PoiState> = {}): PoiState {
  const d = WORLD.banditCamps.find((c) => c.tier === tier)!;
  const cell = cellAt(s, dist);
  const p: PoiState = {
    id, kind: 'bandit_camp', cell, region: s.world.regionOf[cell] ?? 0, tier, level: campLevel(tier, strength), active: true,
    troops: d.troops.map((t) => ({ ...t })), strength, respawnAt: null, raidReadyAt: 0, ...over,
  };
  s.world.pois[id] = p;
  return p;
}

/** A state past the grace period with no pre-placed camps and one ripe tier-2 camp 8 cells away. */
export function ripeState(opts: MakeStateOpts = {}, strength = 500): { s: GameState; camp: PoiState } {
  const s = makeState(opts);
  for (const id of Object.keys(s.world.pois)) if (s.world.pois[id]!.kind === 'bandit_camp') delete s.world.pois[id];
  s.tick = RIPE_TICK;
  s.city.buildings[s.city.townHall]!.level = 6; // raids start only past Town Hall 5 (balance.raids.minTownHall)
  const camp = addCamp(s, 'camp1', 2, strength, 8);
  return { s, camp };
}
