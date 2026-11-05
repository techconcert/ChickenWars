// Sea bridges of the Islands start type (docs/systems/start-types.md, decision D33).
// Locked at new game; opened by killing the boss of a region the bridge touches, or by the Shipwright research.
import type { TickCtx } from '../ctx';
import type { GameState } from '../state';

/** Unlocks bridges touching `region` (or every bridge when `region` is undefined). Returns the ids that opened. */
export function unlockBridges(state: GameState, ctx: TickCtx, by: 'boss' | 'research', region?: number): number[] {
  const out: number[] = [];
  for (const b of state.world.bridges ?? []) {
    if (b.unlocked) continue;
    if (region !== undefined && b.regionA !== region && b.regionB !== region) continue;
    b.unlocked = true;
    out.push(b.id);
    ctx.events.push({ t: 'BridgeUnlocked', tick: state.tick, bridge: b.id, by });
  }
  return out;
}

/** Number of bridges still locked (UI hint). */
export function lockedBridgeCount(state: GameState): number {
  let n = 0;
  for (const b of state.world.bridges ?? []) if (!b.unlocked) n++;
  return n;
}
