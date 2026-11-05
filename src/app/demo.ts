// Dev tool for `?demo=1`: plays a deterministic scripted opening through real commands to reach a mid-game state
// (Town Hall 3, a small town, three troop types, one gather march and one attack march under way).
// Resources are topped up directly here (and only here) so the script never stalls; the sim itself is untouched.
import { validateCommand } from '@sim/commands';
import type { Command } from '@sim/commands';
import { getCaps } from '@sim/city/caps';
import { cellDistance, baseGrid } from '@sim/city/grid';
import { adjacencyBonus } from '@sim/city/adjacency';
import { placementError } from '@sim/city/territory';
import { getPopulation } from '@sim/city/pop';
import { EVENTS, RESOURCE_LIST, TROOPS } from '@sim/data/registry';
import { findPath, cellUnlocked } from '@sim/nav';
import { advance } from '@sim/tick';
import { seasonId } from '@sim/systems/seasons';
import type { GameState, HeroState } from '@sim/state';

const WAIT_CODES = new Set(['queue_full', 'busy', 'locked', 'th_level', 'max_count', 'under_construction', 'no_building', 'queue_full']);

function topUp(s: GameState): void {
  const caps = getCaps(s);
  for (const r of RESOURCE_LIST) if (r.id !== 'ember') s.resources[r.id] = Math.max(s.resources[r.id], caps[r.id] * 0.9);
}

function run(s: GameState, n: number): void { for (let i = 0; i < n; i++) advance(s); }

/** Issue a command, waiting (in 20-tick steps) while the sim says it is not possible yet. Returns the final code. */
function issue(s: GameState, cmd: Command, maxWaitTicks = 4000): string | null {
  let code: string | null = null;
  for (let w = 0; w <= maxWaitTicks; w += 20) {
    topUp(s);
    code = validateCommand(s, cmd);
    if (!code) { advance(s, [cmd]); return null; }
    if (!WAIT_CODES.has(code)) return code;
    run(s, 20);
  }
  return code;
}

/** Best free cell for a building type: adjacency bonus first, then close to the Town Hall (but not touching it). */
function bestCell(s: GameState, type: string): number {
  const th = s.city.buildings[s.city.townHall]!;
  let best = -1;
  let bs = -Infinity;
  for (let c = 0; c < s.city.terrain.length; c++) {
    const d = cellDistance(s.city.radius, th.cell, c);
    if (d < 2 || d > 6 || placementError(s, type, c) !== null) continue;
    const score = adjacencyBonus(s, type, c) * 4 - d * 3 - ((c * 7919) % 5) * 0.1;
    if (score > bs) { bs = score; best = c; }
  }
  return best;
}

function build(s: GameState, type: string): void {
  // Wait for the unlock/count first (placementError needs a valid cell, so probe with any cell once it is possible).
  for (let i = 0; i < 400; i++) {
    const cell = bestCell(s, type);
    if (cell >= 0) { if (issue(s, { t: 'build', building: type, cell }, 400) === null) return; }
    run(s, 20);
  }
}

function nearest<T extends { cell: number }>(s: GameState, list: T[]): T | undefined {
  let best: T | undefined;
  let bl = Infinity;
  for (const o of list) {
    if (!cellUnlocked(s.world, o.cell)) continue;
    const p = findPath(s.world, s.world.capitalCell, o.cell);
    if (p && p.length < bl) { bl = p.length; best = o; }
  }
  return best;
}

export function buildDemoState(state: GameState): GameState {
  const s = state;
  void baseGrid;
  const th = s.city.townHall;
  issue(s, { t: 'upgrade', building: th });
  for (const type of ['farm', 'lumber_camp', 'house', 'storehouse']) build(s, type);
  issue(s, { t: 'upgrade', building: th });
  for (const type of ['builders_hut', 'barracks', 'archery_range', 'farm', 'lumber_camp', 'house', 'house', 'house', 'house', 'quarry', 'stable', 'farm', 'house', 'tavern', 'infirmary', 'watchtower']) build(s, type);
  // let everything finish
  for (let i = 0; i < 60 && s.city.queue.length > 0; i++) run(s, 100);
  // train three troop types, bounded by free population
  const plan: [string, number][] = [['rider', 6], ['bowman', 20], ['militia', 32]];
  for (const [troop, want] of plan) {
    const free = getPopulation(s).free;
    const n = Math.min(want, Math.floor(free / (TROOPS[troop]?.popCost ?? 1)));
    if (n > 0) issue(s, { t: 'train', troop, count: n });
  }
  for (let i = 0; i < 80 && s.training.length > 0; i++) run(s, 50);
  // a second hero so both marches can leave (recruiting is a later milestone; demo-only direct state edit)
  const second: HeroState = { id: 'mira', level: 2, xp: 0, talents: {}, equipment: { weapon: null, armour: null, banner: null, trinket: null }, march: null, skillRank: 1 };
  s.heroes['mira'] = second;
  const node = nearest(s, Object.values(s.world.nodes).filter((n) => n.resource === 'wood' && n.amount > 0 && !n.gatherer));
  const camp = nearest(s, Object.values(s.world.pois).filter((p) => p.kind === 'bandit_camp' && p.tier === 1 && p.active));
  const have = (t: string): number => s.troops[t]?.healthy ?? 0;
  if (node) {
    const g = Math.min(4, have('militia'));
    issue(s, { t: 'march', hero: 'mira', troops: { militia: g }, target: { node: node.id }, kind: 'gather' }, 0);
    run(s, 60);
  }
  if (camp) {
    // Everything not on the gather march, except ~4 militia kept home: a decisive, deterministic win over a tier-1 camp.
    const troops: Record<string, number> = {};
    for (const t of ['militia', 'bowman', 'rider']) {
      const n = t === 'militia' ? have(t) - 4 : have(t);
      if (n > 0) troops[t] = n;
    }
    issue(s, { t: 'march', hero: 'aldric', troops, target: { poi: camp.id }, kind: 'attack' }, 0);
    run(s, 120);
  }
  // Never leave a stale or off-season event card on screen after the scripted opening.
  if (s.pendingEvent) {
    const ev = EVENTS[s.pendingEvent?.id ?? ''];
    if (!ev || (ev.season && ev.season !== seasonId(s))) s.pendingEvent = null;
  }
  s.flags.sandbox = false;
  return s;
}
