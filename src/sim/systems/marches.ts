// Marches system (docs/systems/marches-and-nav.md): commands, movement along A* paths, gathering, scouting, return.
// Conventions: path[0] is the capital cell for outbound marches; `step` indexes the cell the march stands on and
// `progress` (0..1000) is how far it is along the edge to path[step+1]. Garrison marches wait in phase 'done'.
// Attack marches wait in phase 'fighting' for tickCombat, which sets 'returning' with path [] (a home path is computed here).
import type { CommandOf } from '../commands';
import { emit } from '../ctx';
import type { Handler, TickCtx } from '../ctx';
import { BALANCE, TROOPS } from '../data/registry';
import { heroStats } from '../heroStats';
import {
  SCOUT_EXPLORE_RADIUS, cellDistance, cellUnlocked, findPath, gridFor,
} from '../nav';
import { marchHasCavalry, recomputeFog } from '../nav/fog';
import {
  carriedTotal, carryCap, depositResources, ensureHomePath, gatherPerTick, nodeRespawnTicks, progressPerTick,
  reverseFromHere, rollSimpleLoot, upkeepPerMinute,
} from '../nav/marchCore';
import { fogRevealBonus, marchSlots } from '../nav/modifiers';
import { researchBonus } from '../research/bonus';
import type { GameState, MarchState, ResourceId, Res, Target } from '../state';
import { hashRand } from '../rng';
import { sortedKeys } from '../util';
import { SUPPLY_MINUTES } from '../nav/constants';
import { addWounded } from './military';

type Resolved = { cell: number } | { error: string };

/**
 * Picks where a random scout goes next: one of the `pickFrom` nearest reachable unexplored cells (seeded by tick and `salt`),
 * at least `minDistance` away so each leg uncovers something. Null when no unexplored reachable land is left.
 */
function nextFogTarget(state: GameState, from: number, salt: string): number | null {
  const w = state.world;
  const g = gridFor(w.radius);
  const cfg = BALANCE.autoScout;
  const cands: { c: number; d: number }[] = [];
  for (let c = 0; c < g.count; c++) {
    if ((w.fog[c] ?? 0) !== 0 || (w.navCost[c] ?? 0) <= 0 || !cellUnlocked(w, c)) continue;
    const d = cellDistance(g, from, c);
    if (d >= cfg.minDistance) cands.push({ c, d });
  }
  cands.sort((a, b) => a.d - b.d || a.c - b.c);
  const reach: number[] = [];
  for (let i = 0; i < cands.length && i < 40 && reach.length < cfg.pickFrom; i++) {
    if (findPath(w, from, cands[i]!.c)) reach.push(cands[i]!.c);
  }
  if (!reach.length) return null;
  return reach[Math.floor(hashRand(state.seed, 'autoScout', state.tick, salt) * reach.length)]!;
}

/** Resolves the destination cell for a march request or returns an error code. */
function resolveTarget(state: GameState, kind: string, target: Target, troops: Record<string, number>): Resolved {
  const w = state.world;
  const g = gridFor(w.radius);
  switch (kind) {
    case 'gather': {
      const n = target.node ? w.nodes[target.node] : undefined;
      if (!n) return { error: 'bad_target' };
      if (n.amount <= 0 || n.respawnAt !== null) return { error: 'node_depleted' };
      if (n.blockedUntil > state.tick) return { error: 'node_blocked' };
      if (n.gatherer) return { error: 'node_taken' };
      if (carryCap(troops) <= 0) return { error: 'no_gatherers' };
      return { cell: n.cell };
    }
    case 'attack':
    case 'rally': {
      const p = target.poi ? w.pois[target.poi] : undefined;
      if (!p || !p.active || !(p.kind === 'bandit_camp' || p.kind === 'lair' || p.kind === 'boss')) return { error: 'bad_target' };
      return { cell: p.cell };
    }
    case 'scout': {
      if (target.auto) {
        const c = nextFogTarget(state, w.capitalCell, 'start');
        return c === null ? { error: 'nothing_to_scout' } : { cell: c };
      }
      if (target.poi) {
        const p = w.pois[target.poi];
        if (!p) return { error: 'bad_target' };
        let hasCav = false;
        for (const t of Object.keys(troops)) if (TROOPS[t]?.class === 'cavalry' && (troops[t] ?? 0) > 0) hasCav = true;
        if (p.kind === 'ruin' && !hasCav) return { error: 'no_cavalry' };
        return { cell: p.cell };
      }
      if (target.cell === undefined || target.cell < 0 || target.cell >= g.count || (w.navCost[target.cell] ?? 0) <= 0) return { error: 'bad_target' };
      return { cell: target.cell };
    }
    case 'garrison': {
      if (target.lord) {
        const l = state.lords[target.lord];
        const p = l ? w.pois[l.poi] : undefined;
        return p ? { cell: p.cell } : { error: 'bad_target' };
      }
      if (target.poi) {
        const p = w.pois[target.poi];
        return p && p.kind === 'village' ? { cell: p.cell } : { error: 'bad_target' };
      }
      if (target.cell === w.capitalCell) return { cell: w.capitalCell };
      return { error: 'bad_target' };
    }
    default:
      return { error: 'bad_kind' };
  }
}

function validateMarch(state: GameState, cmd: CommandOf<'march'>): string | null {
  if (cmd.kind === 'return') return 'bad_kind';
  const hero = state.heroes[cmd.hero];
  if (!hero) return 'no_hero';
  if (hero.march) return 'hero_busy';
  let total = 0;
  for (const t of Object.keys(cmd.troops)) {
    const n = cmd.troops[t] ?? 0;
    if (!Number.isInteger(n) || n < 0) return 'bad_troops';
    if (n === 0) continue;
    if (!TROOPS[t] || TROOPS[t]!.role === 'trader') return 'bad_troops';
    if ((state.troops[t]?.healthy ?? 0) < n) return 'no_troops';
    total += n;
  }
  if (total <= 0) return 'no_troops';
  if (total > heroStats(state, cmd.hero).lead) return 'over_lead';
  if (Object.keys(state.marches).length >= Math.min(marchSlots(state), BALANCE.marchSlotsMax)) return 'no_slot';
  const dest = resolveTarget(state, cmd.kind, cmd.target, cmd.troops);
  if ('error' in dest) return dest.error;
  if (!cellUnlocked(state.world, dest.cell)) return 'locked';
  if (!findPath(state.world, state.world.capitalCell, dest.cell)) {
    return findPath(state.world, state.world.capitalCell, dest.cell, { ignoreBridges: true }) ? 'bridge_locked' : 'no_path';
  }
  return null;
}

function applyMarch(state: GameState, cmd: CommandOf<'march'>, ctx: TickCtx): void {
  const dest = resolveTarget(state, cmd.kind, cmd.target, cmd.troops) as { cell: number };
  const path = findPath(state.world, state.world.capitalCell, dest.cell) ?? [state.world.capitalCell];
  const id = String(state.nextId++);
  const troops: Record<string, number> = {};
  for (const t of sortedKeys(cmd.troops)) {
    const n = cmd.troops[t] ?? 0;
    if (n <= 0) continue;
    troops[t] = n;
    state.troops[t]!.healthy -= n;
  }
  // Supply: two minutes of food upkeep reserved from stock (refunded in full on return; the economy charges marching upkeep).
  // Research supplyMult (negative = leaner supply train, capped at -50%) scales the reserve.
  const supplyScale = Math.max(0.1, 1 + researchBonus(state, 'supplyMult') / 100);
  const supply = Math.min(state.resources.food, Math.ceil(upkeepPerMinute(state, troops) * SUPPLY_MINUTES * supplyScale));
  state.resources.food -= supply;
  const m: MarchState = {
    id, hero: cmd.hero, troops, kind: cmd.kind, target: cmd.target.auto ? { auto: true, cell: dest.cell } : { ...cmd.target }, path, step: 0, progress: 0,
    state: 'moving', carried: {}, supply, startedAt: state.tick,
  };
  state.marches[id] = m;
  state.heroes[cmd.hero]!.march = id;
  if (cmd.kind === 'gather' && cmd.target.node) state.world.nodes[cmd.target.node]!.gatherer = id;
  emit(ctx, { t: 'MarchStarted', tick: state.tick, march: id, kind: cmd.kind });
}

function releaseNode(state: GameState, m: MarchState): void {
  const n = m.target.node ? state.world.nodes[m.target.node] : undefined;
  if (n && n.gatherer === m.id) n.gatherer = null;
}

/** Turns a march around from where it stands (also used by auto-return). */
function startReturn(state: GameState, m: MarchState): void {
  releaseNode(state, m);
  reverseFromHere(m);
  m.state = 'returning';
}

export const handlers: { [K in 'march' | 'recall']: Handler<CommandOf<K>> } = {
  march: { validate: validateMarch, apply: applyMarch },
  recall: {
    validate(state, cmd) {
      const m = state.marches[cmd.march];
      if (!m) return 'no_march';
      if (m.state === 'returning') return 'already_returning';
      if (m.state === 'fighting') return 'in_battle';
      return null;
    },
    apply(state, cmd) {
      const m = state.marches[cmd.march];
      if (m) startReturn(state, m);
    },
  },
};

// ---- arrival handlers

function scoutArrive(state: GameState, ctx: TickCtx, m: MarchState): void {
  const w = state.world;
  const g = gridFor(w.radius);
  const here = m.path[m.path.length - 1] ?? w.capitalCell;
  const cav = marchHasCavalry(m);
  const found: Res = {};
  for (const id of sortedKeys(w.pois)) {
    const p = w.pois[id]!;
    if (p.kind !== 'ruin' && p.kind !== 'cache') continue;
    if (!p.active || p.explored) continue;
    if (cellDistance(g, p.cell, here) > SCOUT_EXPLORE_RADIUS + fogRevealBonus(state) && m.target.poi !== p.id) continue;
    if (p.kind === 'ruin' && !cav) continue;
    p.explored = true;
    p.active = false;
    const loot = rollSimpleLoot(state, p, p.kind === 'ruin' ? 0.5 : 1);
    for (const r of Object.keys(loot) as ResourceId[]) {
      found[r] = (found[r] ?? 0) + (loot[r] ?? 0);
      m.carried[r] = (m.carried[r] ?? 0) + (loot[r] ?? 0);
    }
    if (p.kind === 'ruin') state.quests.counters.ruinExplored = (state.quests.counters.ruinExplored ?? 0) + 1;
    else state.quests.counters.cachesFound = (state.quests.counters.cachesFound ?? 0) + 1;
  }
  // shrines: a one-time blessing (production, gathering or healing buff for two days, rarely hero experience)
  for (const id of sortedKeys(w.pois)) {
    const p = w.pois[id]!;
    if (p.kind !== 'shrine' || !p.active || p.explored) continue;
    if (cellDistance(g, p.cell, here) > SCOUT_EXPLORE_RADIUS + fogRevealBonus(state) && m.target.poi !== p.id) continue;
    p.explored = true;
    p.active = false;
    const roll = hashRand(state.seed, 'shrine', state.tick, p.id);
    const day = 600;
    if (roll < 0.4) { state.buffs.push({ stat: 'prod_all', pct: 25, until: state.tick + 2 * day }); emit(ctx, { t: 'ShrineBlessing', tick: state.tick, poi: p.id, boon: 'prod', amount: 25 }); }
    else if (roll < 0.7) { state.buffs.push({ stat: 'gatherMult', pct: 40, until: state.tick + 2 * day }); emit(ctx, { t: 'ShrineBlessing', tick: state.tick, poi: p.id, boon: 'gather', amount: 40 }); }
    else if (roll < 0.85) { state.buffs.push({ stat: 'healMult', pct: 60, until: state.tick + 2 * day }); emit(ctx, { t: 'ShrineBlessing', tick: state.tick, poi: p.id, boon: 'heal', amount: 60 }); }
    else {
      const xp = 150 * Math.max(1, p.tier);
      const h = state.heroes[m.hero];
      if (h) h.xp += xp;
      emit(ctx, { t: 'ShrineBlessing', tick: state.tick, poi: p.id, boon: 'xp', amount: xp });
    }
    state.chronicle.push({ tick: state.tick, text: 'A shrine grants its blessing to the travellers.' });
  }
  const fresh = recomputeFog(state);
  if (fresh > 0) emit(ctx, { t: 'FogRevealed', tick: state.tick, cells: fresh });
}

/** Random scout: heads for the next unexplored place instead of going home. False when it is done (nothing left or too many legs). */
function continueAutoScout(state: GameState, m: MarchState): boolean {
  const legs = (m.legs ?? 0) + 1;
  if (legs >= BALANCE.autoScout.maxLegs) return false;
  const here = m.path[m.path.length - 1] ?? state.world.capitalCell;
  const next = nextFogTarget(state, here, m.id);
  if (next === null) return false;
  const path = findPath(state.world, here, next);
  if (!path) return false;
  m.path = path; m.step = 0; m.progress = 0; m.legs = legs; m.target.cell = next;
  return true;
}

function arrive(state: GameState, ctx: TickCtx, m: MarchState): void {
  emit(ctx, { t: 'MarchArrived', tick: state.tick, march: m.id, kind: m.kind });
  const w = state.world;
  switch (m.kind) {
    case 'gather': {
      const n = m.target.node ? w.nodes[m.target.node] : undefined;
      if (!n || n.gatherer !== m.id || n.amount <= 0 || n.blockedUntil > state.tick || carryCap(m.troops) <= 0) {
        startReturn(state, m);
        return;
      }
      m.state = 'gathering';
      m.gatherAcc = 0;
      const rate = gatherPerTick(state, m);
      m.gatherEndsAt = rate > 0 ? state.tick + Math.ceil(Math.min(n.amount, carryCap(m.troops)) / rate) : undefined;
      return;
    }
    case 'attack':
    case 'rally': {
      const p = m.target.poi ? w.pois[m.target.poi] : undefined;
      if (!p || !p.active) startReturn(state, m);
      else m.state = 'fighting';
      return;
    }
    case 'scout':
      scoutArrive(state, ctx, m);
      if (!(m.target.auto && continueAutoScout(state, m))) startReturn(state, m);
      return;
    default:
      m.state = 'done';
  }
}

function completeReturn(state: GameState, ctx: TickCtx, m: MarchState): void {
  const { stored, lost } = depositResources(state, m.carried);
  depositResources(state, { food: m.supply });
  for (const r of sortedKeys(lost as Record<string, number>) as ResourceId[]) {
    emit(ctx, { t: 'ResourceOverflow', tick: state.tick, res: r, lost: lost[r] ?? 0 });
  }
  if (m.kind === 'gather') {
    const got = carriedTotal(stored);
    state.stats.gathered += got;
    state.quests.counters.gathered = (state.quests.counters.gathered ?? 0) + got;
  }
  for (const t of sortedKeys(m.troops)) {
    const pool = state.troops[t];
    if (pool) pool.healthy += m.troops[t] ?? 0;
  }
  if (m.wounded) {
    for (const t of sortedKeys(m.wounded)) addWounded(state, t, m.wounded[t] ?? 0);
  }
  const hero = state.heroes[m.hero];
  if (hero && hero.march === m.id) hero.march = null;
  releaseNode(state, m);
  delete state.marches[m.id];
  emit(ctx, { t: 'MarchReturned', tick: state.tick, march: m.id, carried: { ...m.carried } });
}

/**
 * Offline fast-forward: every march that is out gets settled at once. Gatherers fill their load from the node (as far as it lasts)
 * and everyone comes home and deposits; attack, rally and scout marches simply come home (no battles while away, D12).
 */
export function settleMarchesOffline(state: GameState, ctx: TickCtx): void {
  for (const id of sortedKeys(state.marches)) {
    const m = state.marches[id];
    if (!m) continue;
    if (m.kind === 'gather' && m.target.node) {
      const n = state.world.nodes[m.target.node];
      if (n && n.gatherer === m.id && n.amount > 0) {
        const room = Math.max(0, carryCap(m.troops) - carriedTotal(m.carried));
        const got = Math.min(room, Math.floor(n.amount));
        if (got > 0) {
          n.amount -= got;
          m.carried[n.resource] = (m.carried[n.resource] ?? 0) + got;
        }
        if (n.amount <= 0) { n.amount = 0; n.respawnAt = state.tick + nodeRespawnTicks(n.type); }
      }
    }
    completeReturn(state, ctx, m);
  }
}

// ---- per-tick behaviour

function move(state: GameState, ctx: TickCtx, m: MarchState): void {
  const last = m.path.length - 1;
  if (last >= 0 && m.step < last) {
    m.progress += progressPerTick(state, m, m.path[m.step]!, m.path[m.step + 1]!);
    while (m.progress >= 1000 && m.step < last) {
      m.progress -= 1000;
      m.step += 1;
    }
  }
  if (m.step >= last) {
    m.step = Math.max(0, last);
    m.progress = 0;
    if (m.state === 'returning') completeReturn(state, ctx, m);
    else arrive(state, ctx, m);
  }
}

function gatherTick(state: GameState, ctx: TickCtx, m: MarchState): void {
  const node = m.target.node ? state.world.nodes[m.target.node] : undefined;
  if (!node || node.gatherer !== m.id) { startReturn(state, m); return; }
  const cap = carryCap(m.troops);
  const res = node.resource;
  let acc = (m.gatherAcc ?? 0) + gatherPerTick(state, m);
  const whole = Math.floor(acc + 1e-9);
  if (whole > 0) {
    acc -= whole;
    const room = Math.max(0, cap - carriedTotal(m.carried));
    const take = Math.min(whole, room, node.amount);
    if (take > 0) {
      node.amount -= take;
      m.carried[res] = (m.carried[res] ?? 0) + take;
    }
  }
  m.gatherAcc = acc;
  const depleted = node.amount <= 0;
  if (depleted) {
    node.amount = 0;
    node.respawnAt = state.tick + nodeRespawnTicks(node.type);
    emit(ctx, { t: 'NodeDepleted', tick: state.tick, node: node.id });
  }
  if (depleted || carriedTotal(m.carried) >= cap || node.blockedUntil > state.tick) startReturn(state, m);
}

export function tickMarches(state: GameState, ctx: TickCtx): void {
  for (const id of sortedKeys(state.marches)) {
    const m = state.marches[id];
    if (!m) continue;
    switch (m.state) {
      case 'moving':
        move(state, ctx, m);
        break;
      case 'returning':
        ensureHomePath(state, m);
        move(state, ctx, m);
        break;
      case 'gathering':
        gatherTick(state, ctx, m);
        break;
      default:
        break; // fighting: tickCombat; done: garrison waits for recall
    }
  }
}
