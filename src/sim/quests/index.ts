// Quest runner: the main chain (state.quests.active) plus triggered side quests (state.quests.side).
import { emit } from '../ctx';
import type { TickCtx } from '../ctx';
import { BOUNTIES, QUEST_LIST, QUESTS } from '../data/registry';
import { DAY_TICKS } from '../constants';
import type { QuestDef } from '../data/schema';
import { addChronicle } from '../progression/chronicle';
import type { GameState } from '../state';
import { counterOf, stepBase, stepLabel, stepNeed, stepProgress } from './steps';
import { grantRewards } from './rewards';
import { boardState, isBounty, pickBounty } from './board';

function baseFor(state: GameState, def: QuestDef): number[] {
  const q = state.quests;
  q.base ??= {};
  let b = q.base[def.id];
  if (!b || b.length !== def.steps.length) {
    b = def.steps.map((s) => stepBase(state, s));
    q.base[def.id] = b;
  }
  return b;
}

/** Recomputes progress; emits QuestAdvanced for each step that newly completed. Returns true when every step is done. */
function evaluate(state: GameState, ctx: TickCtx, def: QuestDef, progress: number[]): boolean {
  const base = baseFor(state, def);
  let all = true;
  for (let i = 0; i < def.steps.length; i++) {
    const step = def.steps[i]!;
    const need = stepNeed(step);
    const was = (progress[i] ?? 0) >= need;
    const now = stepProgress(state, step, base[i] ?? 0);
    progress[i] = now;
    if (now >= need) { if (!was) emit(ctx, { t: 'QuestAdvanced', tick: state.tick, quest: def.id, step: i }); } else all = false;
  }
  return all;
}

function complete(state: GameState, ctx: TickCtx, def: QuestDef): void {
  if (state.quests.completed.includes(def.id)) return;
  // bounties are tracked on the board so the 800-entry pool does not inflate the completed list or the score
  if (isBounty(def.id)) { const b = boardState(state); b.seen.push(def.id); b.done++; delete b.due[def.id]; } else state.quests.completed.push(def.id);
  emit(ctx, { t: 'QuestCompleted', tick: state.tick, quest: def.id });
  addChronicle(state, `Quest complete: ${def.title}.`);
  grantRewards(state, ctx, def);
}

function startMain(state: GameState, ctx: TickCtx, id: string | null): void {
  const def = id ? QUESTS[id] : undefined;
  const q = state.quests;
  if (!def || q.completed.includes(def.id)) { q.active = null; q.stepProgress = []; return; }
  q.active = def.id;
  q.stepProgress = def.steps.map(() => 0);
  if (q.base) delete q.base[def.id];
  baseFor(state, def);
  emit(ctx, { t: 'QuestStarted', tick: state.tick, quest: def.id });
}

/** Records the active quest's baselines before this tick's events are counted (first tick of a new game or a loaded save). */
export function ensureActiveBase(state: GameState): void {
  const def = state.quests.active ? QUESTS[state.quests.active] : undefined;
  if (def) baseFor(state, def);
}

/** Bounty board: evaluates active bounties, drops expired ones and adds one bounty per refill period while a slot is free. */
function runBoard(state: GameState, ctx: TickCtx): void {
  const q = state.quests;
  if (!q.completed.includes(BOUNTIES.startAfter)) return;
  const board = boardState(state);
  q.side ??= {};
  for (const id of Object.keys(q.side).filter(isBounty).sort()) {
    const def = QUESTS[id];
    const prog = q.side[id];
    if (!def || !prog) { delete q.side[id]; delete board.due[id]; continue; }
    if (evaluate(state, ctx, def, prog)) { delete q.side[id]; complete(state, ctx, def); continue; }
    if ((board.due[id] ?? Infinity) <= state.tick) {
      delete q.side[id]; delete board.due[id]; board.seen.push(id);
      if (q.base) delete q.base[id];
      addChronicle(state, `The bounty "${def.title}" lapsed.`);
    }
  }
  if (board.nextAt === 0) { board.nextAt = state.tick + BOUNTIES.refillDays * DAY_TICKS; return; } // first offer after one refill period
  if (state.tick < board.nextAt) return;
  const free = BOUNTIES.slots - Object.keys(q.side).filter(isBounty).length;
  if (free <= 0) return;
  board.nextAt = state.tick + BOUNTIES.refillDays * DAY_TICKS;
  // one new bounty per refill period keeps them rare
  for (let slot = 0; slot < 1; slot++) {
    const def = pickBounty(state, slot);
    if (!def) break;
    q.side[def.id] = def.steps.map(() => 0);
    board.due[def.id] = state.tick + BOUNTIES.lifeDays * DAY_TICKS;
    if (q.base) delete q.base[def.id];
    baseFor(state, def);
    emit(ctx, { t: 'QuestStarted', tick: state.tick, quest: def.id });
  }
}

export function runQuests(state: GameState, ctx: TickCtx): void {
  const q = state.quests;
  // main chain: may advance several quests in one tick when later ones are already satisfied
  for (let guard = 0; q.active && guard < QUEST_LIST.length; guard++) {
    const def = QUESTS[q.active];
    if (!def) { q.active = null; q.stepProgress = []; break; }
    if (q.stepProgress.length !== def.steps.length) q.stepProgress = def.steps.map(() => 0);
    if (!evaluate(state, ctx, def, q.stepProgress)) break;
    complete(state, ctx, def);
    startMain(state, ctx, def.next);
  }
  runBoard(state, ctx);
  // side quests: offered once when their trigger counter is reached
  for (const def of QUEST_LIST) {
    if (!def.trigger || q.completed.includes(def.id)) continue;
    q.side ??= {};
    if (!q.side[def.id] && counterOf(state, def.trigger.counter) >= def.trigger.value) {
      q.side[def.id] = def.steps.map(() => 0);
      if (q.base) delete q.base[def.id];
      baseFor(state, def);
      emit(ctx, { t: 'QuestStarted', tick: state.tick, quest: def.id });
      addChronicle(state, `${def.title}: ${def.text}`);
    }
    const prog = q.side[def.id];
    if (prog && evaluate(state, ctx, def, prog)) {
      delete q.side[def.id];
      complete(state, ctx, def);
    }
  }
}

export interface QuestStepView { label: string; have: number; need: number; done: boolean }
export interface QuestView { id: string; title: string; text: string; side: boolean; bounty?: boolean; daysLeft?: number; steps: QuestStepView[] }

/** UI hook: active quests (main first, then side quests) with per-step progress. */
export function activeQuests(state: GameState): QuestView[] {
  const out: QuestView[] = [];
  const view = (def: QuestDef, progress: number[], side: boolean): QuestView => ({
    id: def.id, title: def.title, text: def.text, side, ...(isBounty(def.id) ? { bounty: true, daysLeft: Math.max(0, Math.ceil(((state.quests.board?.due[def.id] ?? state.tick) - state.tick) / DAY_TICKS)) } : {}),
    steps: def.steps.map((s, i) => ({ label: stepLabel(s), have: progress[i] ?? 0, need: stepNeed(s), done: (progress[i] ?? 0) >= stepNeed(s) })),
  });
  const main = state.quests.active ? QUESTS[state.quests.active] : undefined;
  if (main) out.push(view(main, state.quests.stepProgress, false));
  for (const id of Object.keys(state.quests.side ?? {}).sort()) {
    const def = QUESTS[id];
    if (def) out.push(view(def, state.quests.side![id]!, true));
  }
  return out;
}
