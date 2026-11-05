// Storage caps: resources.baseCap + town hall cap effect + storehouse effects, times research capMult.
import { RESOURCE_LIST, effectsAt } from '../data/registry';
import type { GameState, ResourceId } from '../state';
import { sortedKeys } from '../util';
import { capMultPct } from './modifiers';

/** Storage cap per resource (ember is only raised by its own base cap, never by 'all' effects). */
export function getCaps(state: GameState): Record<ResourceId, number> {
  const out = {} as Record<ResourceId, number>;
  const ids = sortedKeys(state.city.buildings);
  for (const r of RESOURCE_LIST) {
    let cap = r.baseCap;
    for (const id of ids) {
      const b = state.city.buildings[id];
      if (!b) continue;
      for (const e of effectsAt(b.type, 'cap', b.level)) {
        if (e.res === r.id || (e.res === 'all' && r.id !== 'ember')) cap += e.amount;
      }
    }
    out[r.id] = Math.floor(cap * (1 + capMultPct(state, r.id) / 100));
  }
  return out;
}
