// GameClient: holds GameState, the command queue and the fixed-step loop. No DOM, no three.js.
import { advance } from '@sim/tick';
import { validateCommand } from '@sim/commands';
import type { Command } from '@sim/commands';
import { TICKS_PER_SECOND } from '@sim/constants';
import type { GameEvent } from '@sim/events';
import { createInitialState } from '@sim/init';
import type { InitDeps } from '@sim/init';
import type { GameOptions, GameState, Speed } from '@sim/state';
import type { ClientView, SceneId, Selection } from './clientView';

export const TICK_MS = 1000 / TICKS_PER_SECOND;
export const MAX_TICKS_PER_FRAME = 8;

export class GameClient implements ClientView {
  private state: GameState;
  private queue: Command[] = [];
  private acc = 0;
  private eventSubs = new Set<(events: GameEvent[]) => void>();
  private changeSubs = new Set<() => void>();
  private focusFn: ((scene: SceneId, cell: number) => void) | null = null;
  scene: SceneId = 'base';
  selection: Selection = null;
  placing: string | null = null;
  /** Id of the building being moved (placing then holds its type). */
  moving: string | null = null;
  speed: Speed = 1;

  constructor(state: GameState, readonly maxTicksPerFrame = MAX_TICKS_PER_FRAME) {
    this.state = state;
  }

  static create(seed: number, options: Partial<GameOptions>, deps: InitDeps): GameClient {
    return new GameClient(createInitialState(seed, options, deps));
  }

  getState(): Readonly<GameState> { return this.state; }
  getAlpha(): number { return this.speed === 0 ? 0 : Math.min(0.999, this.acc / TICK_MS); }

  /** Replace the whole state (load game, new game). */
  setState(state: GameState): void {
    this.state = state;
    this.queue = [];
    this.acc = 0;
    this.selection = null;
    this.placing = null;
    this.moving = null;
    this.notify();
  }

  dispatch(cmd: Command): string | null {
    const code = validateCommand(this.state, cmd);
    if (code) return code;
    this.queue.push(cmd);
    return null;
  }

  setScene(s: SceneId): void { if (this.scene !== s) { this.scene = s; this.notify(); } }
  select(s: Selection): void { this.selection = s; this.notify(); }
  setPlacing(type: string | null): void { this.placing = type; this.moving = null; this.notify(); }
  /** Starts moving a finished building: the ghost follows the cursor and a click on a free tile relocates it. */
  startMove(building: string): void {
    const b = this.state.city.buildings[building];
    if (!b) return;
    this.placing = b.type;
    this.moving = building;
    this.notify();
  }
  setSpeed(s: Speed): void {
    if (this.speed === s) return;
    this.speed = s;
    this.queue.push({ t: 'setSpeed', speed: s }); // recorded for replay; no sim effect
    this.notify();
  }

  on(fn: (events: GameEvent[]) => void): () => void { this.eventSubs.add(fn); return () => { this.eventSubs.delete(fn); }; }
  subscribe(fn: () => void): () => void { this.changeSubs.add(fn); return () => { this.changeSubs.delete(fn); }; }
  registerFocus(fn: (scene: SceneId, cell: number) => void): void { this.focusFn = fn; }
  focusCell(scene: SceneId, cell: number): void { this.focusFn?.(scene, cell); }

  /** Run exactly n ticks now (dev hook, tests, scripted runs). */
  advanceTicks(n: number): GameEvent[] {
    const all: GameEvent[] = [];
    for (let i = 0; i < n; i++) all.push(...advance(this.state, this.queue.splice(0)));
    this.emitBatch(all);
    return all;
  }

  /** Per-render-frame driver. Accumulates real time x speed and runs whole ticks. Returns ticks run. */
  frame(dtMs: number): number {
    const all: GameEvent[] = [];
    let ran = 0;
    if (this.speed === 0) {
      // Paused: still flush queued commands with a single tick so the player can act while paused.
      if (this.queue.some((c) => c.t !== 'setSpeed')) { all.push(...advance(this.state, this.queue.splice(0))); ran = 1; }
      else this.queue.length = 0;
    } else {
      this.acc += Math.min(dtMs, 1000) * this.speed;
      while (this.acc >= TICK_MS && ran < this.maxTicksPerFrame) {
        all.push(...advance(this.state, this.queue.splice(0)));
        this.acc -= TICK_MS;
        ran++;
      }
      if (this.acc >= TICK_MS) this.acc = this.acc % TICK_MS; // drop backlog beyond the per-frame clamp
    }
    if (ran > 0) this.emitBatch(all);
    return ran;
  }

  private emitBatch(events: GameEvent[]): void {
    if (events.length) for (const fn of [...this.eventSubs]) fn(events);
    this.notify();
  }
  private notify(): void { for (const fn of [...this.changeSubs]) fn(); }
}
