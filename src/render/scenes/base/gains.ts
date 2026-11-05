// Floating "+N" resource labels above buildings in the base scene: production batches and returning marches.
import type { GameEvent } from '../../../sim/events';
import type { GameState, ResourceId } from '../../../sim/state';
import { computeProduction } from '../../../sim/city/production';
import { BUILDINGS } from '../../../sim/data/registry';
import { getCaps } from '../../../sim/city/caps';
import { TICKS_PER_MINUTE } from '../../../sim/constants';
import { FloatTexts } from '../../fx/floatText';
import type { BuildingViews } from '../../view/buildings';

const GAIN_COL: Record<string, string> = { food: '#f4e07a', wood: '#e0b97e', stone: '#dcd9d2', gold: '#ffd84d', ember: '#ff9a63' };
/** Sim ticks between production labels per building (10 ticks = 1 s at 1x). */
const EMIT_TICKS = 120;
const MAX_JUMP = 1200;
/** Smallest amount worth a label (it keeps accumulating below this). */
const MIN_SHOWN = 3;
const ANCHOR_H: Record<string, number> = { hall: 2.9, farm: 0.9, house: 1.5 };

export class GainLabels {
  readonly floats = new FloatTexts();
  private acc = new Map<string, number>();
  private last = new Map<string, number>();
  private lastTick = -1;
  private recent = new Map<string, number>();

  private active = false;

  constructor(private views: BuildingViews) {}

  /** Labels are only spawned while the base scene is shown; leaving clears them. */
  setActive(on: boolean): void {
    this.active = on;
    this.lastTick = -1;
    this.acc.clear();
    if (!on) this.floats.clear();
  }

  private spot(id: string, now: number): [number, number, number, number] | null {
    const v = this.views.views.get(id);
    if (!v) return null;
    // stack labels that arrive close together on one building
    const n = (this.recent.get(id) ?? 0);
    const stacked = now - n < 1.2 ? 1 : 0;
    this.recent.set(id, now);
    // the pick box is generous; anchor labels just above the roof line instead
    const top = v.root.position.y + (ANCHOR_H[BUILDINGS[v.type]?.mesh ?? ''] ?? 1.8);
    return [v.root.position.x, top + 0.35 + stacked * 0.5, v.root.position.z, stacked];
  }

  /** Call every frame with the live state and a monotonic clock in seconds. */
  update(state: GameState, dt: number, now: number): void {
    this.floats.update(dt);
    const dTicks = this.lastTick < 0 ? 0 : state.tick - this.lastTick;
    this.lastTick = state.tick;
    if (dTicks <= 0) return;
    if (dTicks > MAX_JUMP) { this.acc.clear(); return; }
    const prod = computeProduction(state).byBuilding;
    let caps: Record<ResourceId, number> | null = null;
    for (const id of Object.keys(prod)) {
      const b = state.city.buildings[id];
      if (!b || b.level < 1) continue;
      for (const r of prod[id]!) {
        const key = `${id}:${r.res}`;
        const a = (this.acc.get(key) ?? 0) + (r.perMinute * dTicks) / TICKS_PER_MINUTE;
        const prev = this.last.get(key) ?? state.tick - ((b.cell * 37) % EMIT_TICKS);
        this.last.set(key, prev);
        if (state.tick - prev < EMIT_TICKS || a < MIN_SHOWN) { this.acc.set(key, a); continue; }
        this.acc.set(key, 0);
        this.last.set(key, state.tick);
        caps ??= getCaps(state);
        if (state.resources[r.res] >= caps[r.res] - 0.5) continue; // storage full: nothing was added
        const at = this.spot(id, now);
        if (at) this.floats.addGain(Math.floor(a), r.res, GAIN_COL[r.res] ?? '#fff', at[0], at[1], at[2]);
      }
    }
  }

  onEvents(evs: GameEvent[], state: GameState, now: number): void {
    if (!this.active) return;
    for (const e of evs) {
      if (e.t !== 'MarchReturned') continue;
      const th = state.city.townHall;
      let i = 0;
      for (const k of Object.keys(e.carried)) {
        const v = Math.round((e.carried as Record<string, number>)[k] ?? 0);
        if (v <= 0) continue;
        const at = this.spot(th, now + i);
        if (at) this.floats.addGain(v, k, GAIN_COL[k] ?? '#fff', at[0], at[1] + i * 0.5, at[2], 3);
        i++;
      }
    }
  }

  dispose(): void {
    this.floats.dispose();
  }
}
