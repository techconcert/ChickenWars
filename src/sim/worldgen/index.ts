// Gameplay overlay on the terrain logic layer (docs/systems/world.md): region tiers, resource nodes, POIs, bosses, lords.
// Deterministic: every random choice is a hash32 of (seed, feature tag, ids). No shared RNG stream is consumed.
import { LORD_LIST, WORLD } from '../data/registry';
import type { WorldData } from '../data/schema';
import {
  CAPITAL_GUARANTEE_RADIUS, canMove, cellDistance, gridFor, reachableFrom,
} from '../nav';
import { recomputeFog } from '../nav/fog';
import { hash32 } from '../rng';
import type { GameState, NodeState, PoiKind, ResourceId } from '../state';
import { sortedKeys } from '../util';
import { nodeFits, isPlaceable, poiFits } from './place';
import { campTier, makeBoss, makeCamp, makeLair, makeSimplePoi } from './spawn';

const BIOME_NAMES = ['beach', 'meadow', 'forest', 'highland', 'snow'] as const;
type NodeType = WorldData['nodeTypes'][number];

/** Region danger tiers by walkable-graph distance from the capital region; unreachable regions get tier 6, locked, empty. */
export function assignRegionTiers(state: GameState): Set<number> {
  const w = state.world;
  const g = gridFor(w.radius);
  const adj: Set<number>[] = w.regions.map(() => new Set<number>());
  for (let c = 0; c < g.count; c++) {
    const a = w.regionOf[c] ?? -1;
    if (a < 0) continue;
    for (let k = 0; k < 6; k++) {
      const b = g.nb[c * 6 + k]!;
      if (b < 0) continue;
      const rb = w.regionOf[b] ?? -1;
      if (rb >= 0 && rb !== a && canMove(w, c, b)) { adj[a]!.add(rb); adj[rb]!.add(a); }
    }
  }
  const home = w.regionOf[w.capitalCell] ?? 0;
  const dist = new Map<number, number>([[home, 0]]);
  const q = [home];
  for (let h = 0; h < q.length; h++) {
    const r = q[h]!;
    for (const n of [...adj[r]!].sort((x, y) => x - y)) if (!dist.has(n)) { dist.set(n, dist.get(r)! + 1); q.push(n); }
  }
  const reachable = new Set<number>();
  for (const reg of w.regions) {
    const d = dist.get(reg.id);
    if (d === undefined) { reg.dangerTier = 6; reg.unlocked = false; continue; }
    reachable.add(reg.id);
    reg.dangerTier = Math.min(6, d + 1);
    reg.unlocked = reg.dangerTier <= 2;
    reg.boss = null;
    reg.lord = null;
  }
  return reachable;
}

const hashOrder = (state: GameState, tag: string, region: number, cells: readonly number[]): number[] =>
  cells.map((c) => ({ c, h: hash32(state.seed, tag, region, c) })).sort((a, b) => a.h - b.h || a.c - b.c).map((x) => x.c);

function nodeTypesFor(biome: number, tier: number): NodeType[] {
  const name = BIOME_NAMES[biome] ?? 'meadow';
  return WORLD.nodeTypes.filter((t) => t.biomes.includes(name) && tier >= (t.minTier ?? 1) && (t.amountByTier[Math.min(5, tier - 1)] ?? 0) > 0);
}

function addNode(state: GameState, type: NodeType, cell: number): NodeState {
  const tier = state.world.regions[state.world.regionOf[cell] ?? 0]?.dangerTier ?? 1;
  const base = type.amountByTier[Math.min(5, tier - 1)] ?? 0;
  const amount = Math.max(1, Math.round((base * (90 + (hash32(state.seed, 'nodeamt', cell) % 21))) / 100));
  const id = `node_${state.nextId++}`;
  const node: NodeState = {
    id, type: type.id, resource: type.resource as ResourceId, cell, region: state.world.regionOf[cell] ?? -1, tier,
    amount, maxAmount: amount, respawnAt: null, gatherer: null, blockedUntil: 0,
  };
  state.world.nodes[id] = node;
  return node;
}

function countOf(kind: PoiKind, tier: number): number {
  return WORLD.poiTypes.find((p) => p.id === kind)?.countPerRegionByTier[Math.min(5, tier - 1)] ?? 0;
}

export function generateWorldOverlay(state: GameState): void {
  const w = state.world;
  const g = gridFor(w.radius);
  const cap = w.capitalCell;
  w.nodes = {};
  w.pois = {};
  state.lords = {};
  const reachRegions = assignRegionTiers(state);
  const reach = reachableFrom(w, cap);
  const homeRegion = w.regionOf[cap] ?? 0;

  const cand = new Map<number, number[]>();
  for (let c = 0; c < g.count; c++) {
    const r = w.regionOf[c] ?? -1;
    if (r < 0 || !reachRegions.has(r) || !reach[c] || !isPlaceable(state, c)) continue;
    let l = cand.get(r);
    if (!l) { l = []; cand.set(r, l); }
    l.push(c);
  }
  const usedLords = new Set<string>();

  for (const reg of w.regions) {
    const cells = cand.get(reg.id);
    if (!cells || !cells.length) continue;
    const tier = reg.dangerTier;
    const isHome = reg.id === homeRegion;
    const near = (lo: number, hi: number) => (order: number[]): number[] => {
      const a: number[] = [];
      const b: number[] = [];
      for (const c of order) { const d = cellDistance(g, cap, c); (d >= lo && d <= hi ? a : b).push(c); }
      return a.concat(b);
    };
    const pickFrom = (order: readonly number[], kind: PoiKind): number => {
      for (const c of order) if (poiFits(state, c, kind)) return c;
      return -1;
    };

    // boss at the most central valid cell
    if (countOf('boss', tier) > 0 && (tier >= 2 || WORLD.poiTypes.find((p) => p.id === 'boss')?.homeBoss)) {
      const centre = reg.centroidCell;
      const order = [...cells].sort((a, b) => cellDistance(g, a, centre) - cellDistance(g, b, centre) || a - b);
      const c = pickFrom(order, 'boss');
      if (c >= 0) {
        const boss = makeBoss(state, c, tier);
        if (boss) reg.boss = boss.id;
      }
    }
    // village + lord
    for (let i = 0; i < countOf('village', tier); i++) {
      const lord = LORD_LIST.find((l) => l.regionTier === tier && !usedLords.has(l.id))
        ?? LORD_LIST.find((l) => !usedLords.has(l.id) && !w.regions.some((r) => r.dangerTier === l.regionTier && reachRegions.has(r.id)));
      if (!lord) break;
      const c = pickFrom(hashOrder(state, 'village', reg.id, cells), 'village');
      if (c < 0) break;
      const v = makeSimplePoi(state, 'village', c, tier);
      v.lordId = lord.id;
      usedLords.add(lord.id);
      reg.lord = reg.lord ?? lord.id;
      state.lords[lord.id] = { id: lord.id, poi: v.id, rep: 0, requests: [], giftDay: -1, giftsToday: 0, refusedStreak: 0, tradeDay: -1 };
    }
    for (let i = 0; i < countOf('lair', tier); i++) {
      const c = pickFrom(hashOrder(state, 'lair', reg.id, cells), 'lair');
      if (c >= 0) makeLair(state, c, campTier(tier));
    }
    for (let i = 0; i < countOf('bandit_camp', tier); i++) {
      let order = hashOrder(state, 'camp', reg.id, cells);
      if (isHome) order = near(5, CAPITAL_GUARANTEE_RADIUS)(order);
      const c = pickFrom(order, 'bandit_camp');
      if (c < 0) continue;
      const growth = tier <= 1 ? 0 : (hash32(state.seed, 'campstr', c) % 100) / 100 * 0.35;
      makeCamp(state, c, tier, growth);
    }
    for (const kind of ['shrine', 'ruin', 'cache'] as const) {
      for (let i = 0; i < countOf(kind, tier); i++) {
        const c = pickFrom(hashOrder(state, kind, reg.id, cells), kind);
        if (c >= 0) makeSimplePoi(state, kind, c, tier);
      }
    }
  }

  // nodes
  for (const reg of w.regions) {
    const cells = cand.get(reg.id);
    if (!cells || !cells.length) continue;
    const dens = WORLD.regionTiers.find((t) => t.tier === reg.dangerTier)?.nodeDensity ?? 1;
    const count = Math.max(4, Math.min(30, Math.round((cells.length / 28) * dens)));
    let order = hashOrder(state, 'node', reg.id, cells);
    if (reg.id === homeRegion) {
      const a: number[] = [];
      const b: number[] = [];
      for (const c of order) { const d = cellDistance(g, cap, c); (d >= 3 && d <= CAPITAL_GUARANTEE_RADIUS ? a : b).push(c); }
      order = a.concat(b);
    }
    const counts: Record<string, number> = {};
    // Placing nodes only adds blockers, so a cell rejected (or used) earlier stays rejected: each pass resumes after the
    // previous pick instead of rescanning `order` from the start (same picks, linear instead of quadratic).
    let from = 0;
    for (let i = 0; i < count; i++) {
      for (let j = from; j < order.length; j++) {
        const c = order[j]!;
        from = j + 1;
        if (!nodeFits(state, c)) continue;
        const elig = nodeTypesFor(w.biome[c] ?? 1, reg.dangerTier);
        if (!elig.length) continue;
        let best = elig[0]!;
        for (const t of elig) if ((counts[t.id] ?? 0) < (counts[best.id] ?? 0)) best = t;
        counts[best.id] = (counts[best.id] ?? 0) + 1;
        addNode(state, best, c);
        break;
      }
    }
  }

  guaranteeCapital(state, reach);
  recomputeFog(state);
}

/** Vertical slice guarantee: at least 2 tier-1 camps and 4 mixed nodes within ~12 cells of the capital. */
function guaranteeCapital(state: GameState, reach: Uint8Array): void {
  const w = state.world;
  const g = gridFor(w.radius);
  const cap = w.capitalCell;
  const R = CAPITAL_GUARANTEE_RADIUS;
  const nearCells: number[] = [];
  for (let c = 0; c < g.count; c++) {
    const d = cellDistance(g, cap, c);
    if (d <= R && d >= 3 && reach[c] && isPlaceable(state, c)) nearCells.push(c);
  }
  const order = nearCells.map((c) => ({ c, h: hash32(state.seed, 'guarantee', c) })).sort((a, b) => a.h - b.h || a.c - b.c).map((x) => x.c);
  const campsNear = (): number => Object.values(w.pois).filter((p) => p.kind === 'bandit_camp' && cellDistance(g, cap, p.cell) <= R).length;
  for (let guard = 0; guard < 4 && campsNear() < 2; guard++) {
    const farFirst = order.filter((c) => cellDistance(g, cap, c) >= 5);
    const c = farFirst.find((x) => poiFits(state, x, 'bandit_camp'));
    if (c === undefined) break;
    makeCamp(state, c, 1, 0);
  }
  const nodesNear = (): NodeState[] => sortedKeys(w.nodes).map((id) => w.nodes[id]!).filter((n) => cellDistance(g, cap, n.cell) <= R);
  for (let guard = 0; guard < 16; guard++) {
    const near = nodesNear();
    const have: Record<string, number> = {};
    for (const n of near) have[n.type] = (have[n.type] ?? 0) + 1;
    const distinct = Object.keys(have).length;
    let best: { c: number; t: NodeType; score: number } | null = null;
    for (const c of order) {
      if (!nodeFits(state, c)) continue;
      const tier = w.regions[w.regionOf[c] ?? 0]?.dangerTier ?? 1;
      for (const t of nodeTypesFor(w.biome[c] ?? 1, tier)) {
        const score = have[t.id] ?? 0;
        if (!best || score < best.score) best = { c, t, score };
      }
      if (best && best.score === 0) break;
    }
    if (!best) break;
    if (near.length >= 4 && !(best.score === 0 && distinct < 3)) break;
    addNode(state, best.t, best.c);
  }
}
