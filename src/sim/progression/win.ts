// Win "Reign": defeat the final region's boss AND Town Hall at its max level (25). No lose state in v1 (decision D28).
import type { CommandOf } from '../commands';
import { emit } from '../ctx';
import type { Handler, TickCtx } from '../ctx';
import { BUILDINGS } from '../data/registry';
import type { GameState } from '../state';
import { addChronicle } from './chronicle';
import { computeScore } from './score';

/** Highest boss tier present on the map (6 on a full map; fewer tiers on small maps). */
export function finalBossTier(state: GameState): number {
  let t = 0;
  for (const id of Object.keys(state.world.pois)) {
    const p = state.world.pois[id]!;
    if (p.kind === 'boss' && p.tier > t) t = p.tier;
  }
  return t || 6;
}

export interface ReignProgress { bossTier: number; bossDefeated: boolean; thLevel: number; thNeeded: number; met: boolean }

/** UI hook: progress of the Reign condition. */
export function reignProgress(state: GameState): ReignProgress {
  const bossTier = finalBossTier(state);
  const bossDefeated = (state.quests.counters[`bossKilled_t${bossTier}`] ?? 0) >= 1;
  const thLevel = state.city.buildings[state.city.townHall]?.level ?? 1;
  const thNeeded = BUILDINGS['town_hall']?.maxLevel ?? 25;
  return { bossTier, bossDefeated, thLevel, thNeeded, met: bossDefeated && thLevel >= thNeeded };
}

/** Sets flags.won once, emits Won, writes the chronicle and the `reign` counter (completes the Reign quest). */
export function checkWin(state: GameState, ctx: TickCtx): void {
  if (state.flags.won) return;
  if (!reignProgress(state).met) return;
  state.flags.won = true;
  state.quests.counters.reign = 1;
  emit(ctx, { t: 'Won', tick: state.tick });
  addChronicle(state, `You rule the roost. The final human city has fallen and the Grand Coop stands at its height (score ${computeScore(state)}).`);
}

export const handlers: { [K in 'continueSandbox']: Handler<CommandOf<K>> } = {
  continueSandbox: {
    validate: (state) => (!state.flags.won ? 'not_won' : state.flags.sandbox ? 'already' : null),
    apply(state) {
      state.flags.sandbox = true;
      addChronicle(state, 'The farm plays on in sandbox.');
    },
  },
};
