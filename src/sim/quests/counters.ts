// Counters derived from this tick's events, for facts other systems emit as events but do not count themselves.
// Counters the owning systems already write (gathered, cellsExplored, ruinExplored, campCleared*, bossesKilled) are not touched.
import type { GameEvent } from '../events';
import type { GameState } from '../state';

function bump(c: Record<string, number>, key: string, by = 1): void {
  c[key] = (c[key] ?? 0) + by;
}

/**
 * trained_<troop> (TroopsTrained), researchDone (ResearchCompleted), heroRecruited (HeroRecruited), bossKilled_t<tier> (BossDefeated),
 * raidsWon / raidsLost (RaidResolved), upgraded_<type> / upgraded_total (BuildingUpgraded), trained_total, marchesReturned, battlesWon (bounty objectives), giftGivenEv (LordRepChanged with delta > 0; fallback for `giftGiven`).
 */
export function deriveCounters(state: GameState, events: readonly GameEvent[]): void {
  const c = state.quests.counters;
  for (const e of events) {
    switch (e.t) {
      case 'TroopsTrained': bump(c, `trained_${e.troop}`, e.count); bump(c, 'trained_total', e.count); break;
      case 'ResearchCompleted': bump(c, 'researchDone'); break;
      case 'HeroRecruited': bump(c, 'heroRecruited'); break;
      case 'BossDefeated': {
        const tier = state.world.pois[e.poi]?.tier;
        if (tier !== undefined) bump(c, `bossKilled_t${tier}`);
        break;
      }
      case 'BuildingUpgraded': bump(c, 'upgraded_total'); bump(c, `upgraded_${e.type}`); break;
      case 'MarchReturned': bump(c, 'marchesReturned'); break;
      case 'BattleResolved': if (e.winner === 'attacker') bump(c, 'battlesWon'); break;
      case 'RaidResolved': bump(c, e.won ? 'raidsWon' : 'raidsLost'); break;
      case 'LordRepChanged': if (e.delta > 0) bump(c, 'giftGivenEv'); break;
      default: break;
    }
  }
}
