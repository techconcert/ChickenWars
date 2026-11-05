// Progression per tick: counters from events, win check, milestone chronicle. Called from systems/quests.ts.
import type { TickCtx } from '../ctx';
import type { GameEvent } from '../events';
import type { GameState } from '../state';
import { addChronicle } from './chronicle';
import { checkWin } from './win';

export * from './chronicle';
export * from './clan';
export * from './daily';
export * from './profile';
export * from './score';
export * from './win';

const TH_MILESTONES = [2, 3, 5, 10, 15, 20, 25];

function milestones(state: GameState, events: readonly GameEvent[]): void {
  for (const e of events) {
    if (e.t === 'BuildingUpgraded' && e.type === 'town_hall' && TH_MILESTONES.includes(e.level)) {
      addChronicle(state, `The Grand Coop rises to level ${e.level}.`);
    } else if (e.t === 'RaidResolved') {
      addChronicle(state, e.won ? 'A human raid was thrown back from the pickets.' : 'Humans plundered the outskirts of the farm.');
    } else if (e.t === 'HeroRecruited') {
      addChronicle(state, `A new hero chicken answers the call (${e.hero}).`);
    }
  }
}

export function tickProgression(state: GameState, ctx: TickCtx, events: readonly GameEvent[]): void {
  milestones(state, events);
  checkWin(state, ctx);
}
