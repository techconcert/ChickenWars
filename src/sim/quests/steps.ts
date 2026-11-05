// Quest step evaluation. Building steps read the city (absolute); everything else reads state.quests.counters and counts
// from the value recorded when the quest started (delta), except `counter` steps without `delta` (absolute).
import type { QuestStepData } from '../data/schema';
import type { GameState } from '../state';

export function counterOf(state: GameState, key: string): number {
  const c = state.quests.counters;
  // Gifts: the allies system bumps `giftGiven`; `giftGivenEv` is derived from reputation events as a fallback.
  if (key === 'giftGiven') return Math.max(c.giftGiven ?? 0, c.giftGivenEv ?? 0);
  return c[key] ?? 0;
}

/** Counter key a delta-style step reads, or null for absolute steps (buildings, plain counter). */
export function stepKey(step: QuestStepData): string | null {
  switch (step.kind) {
    case 'trained': return `trained_${step.troop}`;
    case 'gathered': return 'gathered';
    case 'cellsExplored': return 'cellsExplored';
    case 'campCleared': return `campCleared_t${step.tier}`;
    case 'ruinExplored': return 'ruinExplored';
    case 'researchDone': return 'researchDone';
    case 'giftGiven': return 'giftGiven';
    case 'heroRecruited': return 'heroRecruited';
    case 'bossKilled': return `bossKilled_t${step.tier}`;
    case 'counter': return step.delta ? step.key : null;
    default: return null;
  }
}

export function stepNeed(step: QuestStepData): number {
  switch (step.kind) {
    case 'buildingBuilt': case 'trained': case 'cellsExplored': case 'campCleared': case 'ruinExplored':
    case 'researchDone': case 'giftGiven': case 'heroRecruited': case 'bossKilled': return step.count;
    case 'buildingLevel': return step.level;
    case 'gathered': return step.amount;
    case 'counter': return step.value;
  }
}

/** Reading of the underlying quantity right now (before subtracting the baseline). */
export function stepRaw(state: GameState, step: QuestStepData): number {
  switch (step.kind) {
    case 'buildingBuilt': {
      let n = 0;
      for (const id of Object.keys(state.city.buildings)) {
        const b = state.city.buildings[id]!;
        if (b.type === step.building && b.level >= 1) n += 1;
      }
      return n;
    }
    case 'buildingLevel': {
      let lv = 0;
      for (const id of Object.keys(state.city.buildings)) {
        const b = state.city.buildings[id]!;
        if (b.type === step.building && b.level > lv) lv = b.level;
      }
      return lv;
    }
    case 'counter': return counterOf(state, step.key);
    default: {
      const k = stepKey(step);
      return k ? counterOf(state, k) : 0;
    }
  }
}

/** Baseline to remember when a quest starts: current counter for delta steps, 0 for absolute ones. */
export function stepBase(state: GameState, step: QuestStepData): number {
  return stepKey(step) ? stepRaw(state, step) : 0;
}

/** Progress of one step, clamped to [0, need]. */
export function stepProgress(state: GameState, step: QuestStepData, base: number): number {
  const need = stepNeed(step);
  return Math.max(0, Math.min(need, stepRaw(state, step) - base));
}

/** Short label for the UI ("Train militia", ...). */
export function stepLabel(step: QuestStepData): string {
  switch (step.kind) {
    case 'buildingBuilt': return `Build ${step.building.replace(/_/g, ' ')}`;
    case 'buildingLevel': return `Upgrade ${step.building.replace(/_/g, ' ')} to level ${step.level}`;
    case 'trained': return `Train ${step.troop}`;
    case 'gathered': return 'Gather resources';
    case 'cellsExplored': return 'Explore the map';
    case 'campCleared': return `Clear a tier-${step.tier} camp`;
    case 'ruinExplored': return 'Explore ruins';
    case 'researchDone': return 'Finish research';
    case 'giftGiven': return 'Give a gift to a lord';
    case 'heroRecruited': return 'Recruit a hero';
    case 'bossKilled': return `Defeat a tier-${step.tier} boss`;
    case 'counter': return step.label ?? step.key;
  }
}
