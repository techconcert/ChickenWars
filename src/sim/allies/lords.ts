// Lord reputation, gifts and trade (docs/systems/allies.md).
import type { TickCtx } from '../ctx';
import { BALANCE, LORDS } from '../data/registry';
import { tradeSteps } from '../city/modifiers';
import type { GameState, LordState, Res, ResourceId } from '../state';
import { clamp, repStage } from '../util';
import type { RepStage } from '../util';

export type LordStage = RepStage;
export const STAGE_ORDER: readonly LordStage[] = ['hostile', 'wary', 'friendly', 'allied'];
export const REP_MIN = -100;
export const REP_MAX = 100;
export const FRIENDLY_REP = 25;
export const ALLIED_REP = 65;

/** hostile (< -25), wary (-25..24), friendly (25..64), allied (65+). */
export function lordStage(rep: number): LordStage {
  return repStage(rep);
}

export function stageIndex(s: LordStage): number {
  return STAGE_ORDER.indexOf(s);
}

/** Allied lords sorted by reputation (high first), ties by id. */
export function alliedLords(state: GameState): LordState[] {
  return Object.keys(state.lords).map((id) => state.lords[id]!).filter((l) => lordStage(l.rep) === 'allied')
    .sort((a, b) => b.rep - a.rep || (a.id < b.id ? -1 : 1));
}

/** Changes reputation (clamped), emits LordRepChanged; returns the applied delta. Stage perks are applied by syncStage. */
export function changeRep(state: GameState, ctx: TickCtx, lordId: string, delta: number): number {
  const l = state.lords[lordId];
  if (!l || delta === 0) return 0;
  const next = clamp(l.rep + delta, REP_MIN, REP_MAX);
  const applied = next - l.rep;
  if (applied === 0) return 0;
  l.rep = next;
  ctx.events.push({ t: 'LordRepChanged', tick: state.tick, lord: lordId, rep: next, delta: applied });
  return applied;
}

/** Trade value of a resource bundle (balance.allies.giftValue). */
export function bundleValue(res: Res): number {
  let v = 0;
  for (const k of Object.keys(res).sort() as ResourceId[]) v += (res[k] ?? 0) * (BALANCE.allies.giftValue[k] ?? 0);
  return v;
}

/** Day counter used for per-day limits. */
function today(state: GameState): number {
  return state.season.day;
}

/** Rep a gift would earn right now: value x factor, likes x1.5 / dislikes x0.5, diminishing by gifts already given today. */
export function giftRep(state: GameState, lordId: string, gift: Res): number {
  const l = state.lords[lordId];
  const def = LORDS[lordId];
  if (!l || !def) return 0;
  const A = BALANCE.allies;
  let v = 0;
  for (const k of Object.keys(gift).sort() as ResourceId[]) {
    const mult = def.likes.includes(k) ? A.likeMult : def.dislikes.includes(k) ? A.dislikeMult : 1;
    v += (gift[k] ?? 0) * (A.giftValue[k] ?? 0) * mult;
  }
  const given = l.giftDay === today(state) ? l.giftsToday : 0;
  let dim = 1;
  for (let i = 0; i < given; i++) dim *= A.giftDiminish;
  const raw = v * A.giftRepPerValue * dim;
  return raw > 0 ? Math.max(1, Math.round(raw)) : 0;
}

export function giftError(state: GameState, lordId: string, gift: Res): string | null {
  const l = state.lords[lordId];
  if (!l) return 'unknown_lord';
  let any = false;
  for (const k of Object.keys(gift)) {
    if (!['food', 'wood', 'stone', 'gold', 'ember'].includes(k)) return 'bad_gift';
    const n = gift[k as ResourceId] ?? 0;
    if (!Number.isInteger(n) || n < 0) return 'bad_gift';
    if (n > 0) any = true;
    if (n > state.resources[k as ResourceId]) return 'cost';
  }
  if (!any) return 'bad_gift';
  if (l.rep >= REP_MAX) return 'max_rep';
  return null;
}

export function applyGift(state: GameState, ctx: TickCtx, lordId: string, gift: Res): void {
  const l = state.lords[lordId]!;
  const gain = giftRep(state, lordId, gift);
  const paid: Res = {};
  for (const k of Object.keys(gift).sort() as ResourceId[]) {
    const n = gift[k] ?? 0;
    if (n > 0) { state.resources[k] -= n; paid[k] = n; }
  }
  if (l.giftDay !== today(state)) { l.giftDay = today(state); l.giftsToday = 0; }
  l.giftsToday += 1;
  changeRep(state, ctx, lordId, gain);
  state.quests.counters.giftGiven = (state.quests.counters.giftGiven ?? 0) + 1;
  ctx.events.push({ t: 'LordGift', tick: state.tick, lord: lordId, gift: paid, kind: 'player' });
}

/** Trades per day allowed at a stage (0 = refuses). */
export function tradeLimit(stage: LordStage): number {
  return stage === 'hostile' ? 0 : BALANCE.allies.tradeLimits[stage];
}

/** Permille of `lot` the player gets back: wary 1000, friendly 1250..1480 with rep, allied 1500, +100 per clan tradeStep, +-50 for likes. */
export function tradeRatioPm(state: GameState, lordId: string, give: ResourceId): number {
  const l = state.lords[lordId];
  const def = LORDS[lordId];
  if (!l || !def) return 0;
  const stage = lordStage(l.rep);
  if (stage === 'hostile') return 0;
  let pm = 1000;
  if (stage === 'friendly') pm = 1250 + Math.floor(((l.rep - FRIENDLY_REP) * 250) / (ALLIED_REP - FRIENDLY_REP));
  else if (stage === 'allied') pm = 1500;
  pm += 100 * tradeSteps(state);
  if (def.likes.includes(give)) pm += BALANCE.allies.tradeLikePm;
  else if (def.dislikes.includes(give)) pm -= BALANCE.allies.tradeLikePm;
  return pm;
}

export function tradeYield(state: GameState, lordId: string, give: ResourceId): number {
  return Math.floor((BALANCE.allies.tradeLot * tradeRatioPm(state, lordId, give)) / 1000);
}

export function tradesLeft(state: GameState, lordId: string): number {
  const l = state.lords[lordId];
  if (!l) return 0;
  const done = l.tradeDay === today(state) ? (l.tradesToday ?? 0) : 0;
  return Math.max(0, tradeLimit(lordStage(l.rep)) - done);
}
