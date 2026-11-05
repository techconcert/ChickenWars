import type { GameEvent } from './events';
import type { GameState } from './state';

/** Per-tick context passed to systems and command handlers. */
export interface TickCtx { events: GameEvent[]; safeMode: boolean }

/** A command handler: pure validation (null = ok, else short error code) and in-place apply. */
export interface Handler<C> {
  validate(state: GameState, cmd: C): string | null;
  apply(state: GameState, cmd: C, ctx: TickCtx): void;
}

/** Placeholder handler used until a system implements the command. */
export function notImplemented<C>(): Handler<C> {
  return { validate: () => 'not_implemented', apply: () => undefined };
}

export function emit(ctx: TickCtx, ev: GameEvent): void {
  ctx.events.push(ev);
}
