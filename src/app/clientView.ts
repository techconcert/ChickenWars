// Client seam (docs/07-build-contract.md section 7). Render and UI talk to the game only through this.
import type { Command } from '@sim/commands';
import type { GameEvent } from '@sim/events';
import type { GameState, Speed } from '@sim/state';

export type SceneId = 'base' | 'world';
export type Selection = { kind: 'building' | 'cell' | 'node' | 'poi' | 'march' | 'lord'; id: string } | null;

export interface ClientView {
  getState(): Readonly<GameState>;
  /** Fraction in [0,1) of the way to the next tick, for render interpolation. */
  getAlpha(): number;
  scene: SceneId;
  setScene(s: SceneId): void;
  selection: Selection;
  select(s: Selection): void;
  /** Building type being placed (base scene). */
  placing: string | null;
  setPlacing(type: string | null): void;
  /** Building id being moved, or null. */
  moving: string | null;
  startMove(building: string): void;
  /** Validates and queues a command. Returns the validation error code, or null if accepted. */
  dispatch(cmd: Command): string | null;
  /** Subscribe to events after each tick batch. Returns an unsubscribe function. */
  on(fn: (events: GameEvent[]) => void): () => void;
  /** Ask render to move the camera. */
  focusCell(scene: SceneId, cell: number): void;
  speed: Speed;
  setSpeed(s: Speed): void;
  /** Change notification for UI re-render (scene, selection, placing, speed, tick batches). */
  subscribe(fn: () => void): () => void;
}
