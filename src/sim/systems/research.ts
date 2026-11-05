// Research system: Academy-gated tech queue (docs/systems/research.md).
import type { CommandOf } from '../commands';
import { canAfford, pay } from '../city/cost';
import type { Handler, TickCtx } from '../ctx';
import { BUILDINGS, RESEARCH, effectsAt } from '../data/registry';
import { unlockBridges } from './bridges';
import type { GameState } from '../state';
import { researchBonus } from '../research/bonus';
import { sortedKeys } from '../util';

export const ACADEMY = 'academy';

/** Highest academy level among completed academies (0 if none). */
export function academyLevel(state: GameState): number {
  let best = 0;
  for (const id of sortedKeys(state.city.buildings)) {
    const b = state.city.buildings[id];
    if (b && b.type === ACADEMY && BUILDINGS[ACADEMY] && b.level > best) best = b.level;
  }
  return best;
}

/** Simultaneous research slots from the Academy `researchSlots` effect. */
export function researchSlots(state: GameState): number {
  const lvl = academyLevel(state);
  if (lvl < 1) return 0;
  let n = 0;
  for (const e of effectsAt(ACADEMY, 'researchSlots', lvl)) n += e.count;
  // D50: a mid-game tech (Second Roost Shift) adds one more slot; it still needs an Academy to use any slot
  return n + researchBonus(state, 'researchSlots');
}

/** Why a tech cannot be started right now (short code), or null if it can. */
export function researchError(state: GameState, tech: string): string | null {
  const def = RESEARCH[tech];
  if (!def) return 'unknown_tech';
  if (state.research.done.includes(tech)) return 'done';
  if (state.research.active.some((a) => a.tech === tech)) return 'active';
  const lvl = academyLevel(state);
  if (lvl < 1) return 'no_academy';
  if (lvl < def.academyLevel) return 'academy_level';
  for (const q of def.requires) if (!state.research.done.includes(q)) return 'requires';
  if (def.requiresFlag && (state.quests.counters[def.requiresFlag] ?? 0) < 1) return 'flag';
  if (state.research.active.length >= researchSlots(state)) return 'no_slot';
  if (!canAfford(state, def.cost)) return 'cost';
  return null;
}

export function tickResearch(state: GameState, ctx: TickCtx): void {
  const active = state.research.active;
  if (!active.length) return;
  const still: typeof active = [];
  for (const a of active) {
    if (state.tick < a.endTick) { still.push(a); continue; }
    if (!state.research.done.includes(a.tech)) state.research.done.push(a.tech);
    // The quests system derives the 'researchDone' counter from this event.
    ctx.events.push({ t: 'ResearchCompleted', tick: state.tick, tech: a.tech });
    if (RESEARCH[a.tech]?.effects.some((e) => e.kind === 'unlockBridges')) unlockBridges(state, ctx, 'research');
  }
  state.research.active = still;
}

export const handlers: { [K in 'research']: Handler<CommandOf<K>> } = {
  research: {
    validate: (state, cmd) => researchError(state, cmd.tech),
    apply(state, cmd) {
      const def = RESEARCH[cmd.tech];
      if (!def) return;
      pay(state, def.cost);
      state.research.active.push({ tech: def.id, endTick: state.tick + def.ticks });
    },
  },
};
