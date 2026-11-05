import { emit } from '../ctx';
import type { TickCtx } from '../ctx';
import { HEROES } from '../data/registry';
import type { QuestDef } from '../data/schema';
import { depositResources } from '../nav/marchCore';
import { addChronicle } from '../progression/chronicle';
import { grantHero } from '../systems/heroes';
import type { GameState } from '../state';
import { sortedKeys } from '../util';

/** Pays a quest's rewards once (the caller guarantees once-only by moving the quest to `completed`). */
export function grantRewards(state: GameState, ctx: TickCtx, def: QuestDef): void {
  const r = def.rewards;
  if (r.resources) {
    const { lost } = depositResources(state, r.resources);
    for (const k of sortedKeys(lost as Record<string, number>) as (keyof typeof lost)[]) {
      emit(ctx, { t: 'ResourceOverflow', tick: state.tick, res: k, lost: lost[k] ?? 0 });
    }
  }
  if (r.item) {
    const id = String(state.nextId++);
    state.inventory[id] = { id, def: r.item, upgrade: 0 };
    emit(ctx, { t: 'ItemDropped', tick: state.tick, item: id, def: r.item });
  }
  if (r.troops) {
    for (const t of sortedKeys(r.troops)) {
      const pool = state.troops[t];
      if (pool) pool.healthy += r.troops[t] ?? 0;
    }
  }
  if (r.xp) {
    const first = sortedKeys(state.heroes)[0];
    if (first) state.heroes[first]!.xp += r.xp;
  }
  if (r.hero && grantHero(state, r.hero, ctx)) addChronicle(state, `${HEROES[r.hero]?.name ?? r.hero} joins your flock.`);
}
