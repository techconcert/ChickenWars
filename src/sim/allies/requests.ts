// Lord requests: posting (every 1..3 days, seeded), readiness, rewards, expiry (docs/systems/allies.md).
import { DAY_TICKS } from '../constants';
import type { TickCtx } from '../ctx';
import { BALANCE, LORDS, REQUESTS, REQUEST_LIST } from '../data/registry';
import type { RequestDef } from '../data/schema';
import { cellDistance, gridFor } from '../nav';
import { depositResources } from '../nav/marchCore';
import { hashRand } from '../rng';
import type { GameState, LordRequest, LordState, ResourceId } from '../state';
import { sortedKeys } from '../util';
import { changeRep, lordStage } from './lords';

/** Search radius (cells) for a camp to ask the player to clear. */
export const REQUEST_CAMP_RADIUS = 10;

function villageCell(state: GameState, l: LordState): number {
  return state.world.pois[l.poi]?.cell ?? -1;
}

/** Nearest active camp near the village (ties by id), or null. */
function nearestCamp(state: GameState, l: LordState, maxTier: number): string | null {
  const c0 = villageCell(state, l);
  if (c0 < 0) return null;
  const g = gridFor(state.world.radius);
  let best: string | null = null;
  let bestD = Infinity;
  for (const id of sortedKeys(state.world.pois)) {
    const p = state.world.pois[id]!;
    if (p.kind !== 'bandit_camp' || !p.active || p.tier > maxTier + 1) continue;
    const d = cellDistance(g, p.cell, c0);
    if (d <= REQUEST_CAMP_RADIUS && d < bestD) { best = id; bestD = d; }
  }
  return best;
}

function feasible(state: GameState, l: LordState, t: RequestDef): boolean {
  const def = LORDS[l.id];
  if (!def) return false;
  if (t.personalities && !t.personalities.includes(def.personality)) return false;
  if (t.kind === 'clearCamp') return nearestCamp(state, l, Number(t.data.tier ?? 1)) !== null;
  return true;
}

/** Picks a template by weight with hashRand (deterministic), or null. */
export function pickTemplate(state: GameState, l: LordState): RequestDef | null {
  const pool = REQUEST_LIST.filter((t) => feasible(state, l, t));
  let total = 0;
  for (const t of pool) total += t.weight;
  if (!pool.length) return null;
  let r = hashRand(state.seed, 'reqPick', state.tick, l.id) * total;
  for (const t of pool) {
    if (r < t.weight) return t;
    r -= t.weight;
  }
  return pool[pool.length - 1]!;
}

function nextDelay(state: GameState, l: LordState): number {
  const A = BALANCE.allies;
  const days = A.requestMinDays + Math.floor(hashRand(state.seed, 'reqNext', state.tick, l.id) * (A.requestMaxDays - A.requestMinDays + 1));
  return days * DAY_TICKS;
}

export function postRequest(state: GameState, ctx: TickCtx, l: LordState, t: RequestDef): LordRequest {
  const data: Record<string, number | string> = { ...t.data };
  if (t.kind === 'clearCamp') data.camp = nearestCamp(state, l, Number(t.data.tier ?? 1)) ?? '';
  const req: LordRequest = {
    id: `rq_${state.nextId++}`, kind: t.kind, data, expiresAt: state.tick + t.expiresTicks, urgent: t.urgent,
    template: t.id, postedAt: state.tick, accepted: false,
  };
  l.requests.push(req);
  ctx.events.push({ t: 'RequestPosted', tick: state.tick, lord: l.id, request: req.id });
  return req;
}

/** Day-boundary posting. Nothing is posted in safe mode (offline) or by hostile lords. */
export function tickRequestPosting(state: GameState, ctx: TickCtx): void {
  if (state.tick === 0 || state.tick % DAY_TICKS !== 0) return;
  for (const id of sortedKeys(state.lords)) {
    const l = state.lords[id]!;
    if (l.nextRequestAt === undefined) { l.nextRequestAt = state.tick + nextDelay(state, l); continue; }
    if (state.tick < l.nextRequestAt || ctx.safeMode) continue; // due requests wait for the player's return
    l.nextRequestAt = state.tick + nextDelay(state, l);
    if (lordStage(l.rep) === 'hostile' || l.requests.length >= BALANCE.allies.requestsMax) continue;
    const t = pickTemplate(state, l);
    if (t) postRequest(state, ctx, l, t);
  }
}

/** True when the request's condition is met right now. */
export function requestReady(state: GameState, l: LordState, req: LordRequest): boolean {
  const cell = villageCell(state, l);
  switch (req.kind) {
    case 'deliver': {
      const r = req.data.res as ResourceId;
      return state.resources[r] >= Number(req.data.amount ?? 0);
    }
    case 'clearCamp': {
      const p = state.world.pois[String(req.data.camp)];
      return !p || !p.active;
    }
    case 'defend':
      return Object.keys(state.marches).some((id) => {
        const m = state.marches[id]!;
        return m.kind === 'garrison' && m.state === 'done' && m.path[m.path.length - 1] === cell;
      });
    case 'escort':
      return Object.keys(state.marches).some((id) => {
        const m = state.marches[id]!;
        if (m.startedAt < (req.postedAt ?? 0)) return false;
        if (m.kind === 'garrison') return m.path[m.path.length - 1] === cell || m.path[0] === cell;
        return m.kind === 'scout' && m.state === 'returning' && m.path[0] === cell;
      });
    default:
      return false;
  }
}

/** Pays the reward, removes the request, resets the refusal streak. */
export function completeRequest(state: GameState, ctx: TickCtx, l: LordState, req: LordRequest): void {
  const tpl: RequestDef | undefined = req.template ? REQUESTS[req.template] : undefined;
  if (req.kind === 'deliver') state.resources[req.data.res as ResourceId] -= Number(req.data.amount ?? 0);
  l.requests = l.requests.filter((r) => r.id !== req.id);
  l.refusedStreak = 0;
  if (tpl) {
    if (tpl.reward.resources) depositResources(state, tpl.reward.resources);
    if (tpl.reward.item) {
      const id = String(state.nextId++);
      state.inventory[id] = { id, def: tpl.reward.item, upgrade: 0 };
      ctx.events.push({ t: 'ItemDropped', tick: state.tick, item: id, def: tpl.reward.item });
    }
    changeRep(state, ctx, l.id, tpl.reward.rep);
  }
  state.quests.counters.requestsDone = (state.quests.counters.requestsDone ?? 0) + 1;
  ctx.events.push({ t: 'RequestFulfilled', tick: state.tick, lord: l.id, request: req.id, kind: req.kind });
}

export function refuseRequest(state: GameState, ctx: TickCtx, l: LordState, req: LordRequest): void {
  l.requests = l.requests.filter((r) => r.id !== req.id);
  l.refusedStreak += 1;
  if (l.refusedStreak >= BALANCE.allies.refuseStreak) {
    l.refusedStreak = 0;
    changeRep(state, ctx, l.id, -BALANCE.allies.refuseStreakPenalty);
  }
}

/** Every tick: auto-complete non-deliver requests whose condition is met, then expire. Urgent unanswered requests cost rep. */
export function tickRequests(state: GameState, ctx: TickCtx): void {
  for (const id of sortedKeys(state.lords)) {
    const l = state.lords[id]!;
    for (const req of l.requests.slice()) {
      if (req.kind !== 'deliver' && requestReady(state, l, req)) { completeRequest(state, ctx, l, req); continue; }
      if (state.tick >= req.expiresAt) {
        l.requests = l.requests.filter((r) => r.id !== req.id);
        ctx.events.push({ t: 'RequestExpired', tick: state.tick, lord: id, request: req.id });
        if (req.urgent && !req.accepted) changeRep(state, ctx, id, -BALANCE.allies.urgentIgnoredPenalty);
      }
    }
  }
}

/** Parses 'accept' | 'accept:<id>' etc. */
export function parseChoice(choice: string): { verb: string; id: string | null } {
  const i = choice.indexOf(':');
  return i < 0 ? { verb: choice, id: null } : { verb: choice.slice(0, i), id: choice.slice(i + 1) };
}
