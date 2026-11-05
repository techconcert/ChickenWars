import { FP, TICKS_PER_MINUTE } from './constants';
import type { Res, ResourceId } from './state';

/** True for a non-empty string of ASCII digits (same as /^\d+$/, without the regex cost on this hot path). */
function isNum(s: string): boolean {
  const n = s.length;
  if (n === 0) return false;
  for (let i = 0; i < n; i++) {
    const c = s.charCodeAt(i);
    if (c < 48 || c > 57) return false;
  }
  return true;
}

/** Numeric-aware key comparison: numeric keys by value first, then others by code unit. */
export function compareKeys(a: string, b: string): number {
  const an = isNum(a);
  const bn = isNum(b);
  if (an && bn) return Number(a) - Number(b) || (a < b ? -1 : a > b ? 1 : 0);
  if (an) return -1;
  if (bn) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Last sort per record (raw Object.keys sequence -> sorted keys). A cache only: never part of GameState, invisible to results. */
const sortCache = new WeakMap<object, { raw: string[]; sorted: string[] }>();

function sameKeys(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Object keys in compareKeys order. compareKeys is a strict total order on distinct keys (0 only for equal strings), so the
 * result depends only on the key set: when Object.keys already returns them in order (integer ids come out ascending) the
 * sort is skipped, and when the key sequence is unchanged since the last call the previous result is reused (as a copy).
 */
export function sortedKeys(rec: Record<string, unknown>): string[] {
  const keys = Object.keys(rec);
  let i = 1;
  while (i < keys.length && compareKeys(keys[i - 1]!, keys[i]!) < 0) i++;
  if (i >= keys.length) return keys;
  const hit = sortCache.get(rec);
  if (hit && sameKeys(hit.raw, keys)) return hit.sorted.slice();
  const sorted = keys.slice().sort(compareKeys);
  sortCache.set(rec, { raw: keys, sorted });
  return sorted.slice();
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Per-minute rate to fixed-point (x1000) units per tick. */
export function perMinuteToFp(perMinute: number): number {
  return Math.round((perMinute * FP) / TICKS_PER_MINUTE);
}

/** Add a fixed-point amount to an accumulator; returns whole units and the new remainder. */
export function fpDrain(acc: number, addFp: number): { whole: number; rem: number } {
  const total = acc + addFp;
  const whole = Math.floor(total / FP);
  return { whole, rem: total - whole * FP };
}

/** growth^(level-1) by repeated multiplication (only IEEE-exact operations; no Math.pow). */
function growthPow(growth: number, level: number): number {
  let m = 1;
  for (let i = 1; i < level; i++) m *= growth;
  return m;
}

/** Cost of building/upgrading TO `level` (1 = initial construction). */
export function costAtLevel(def: { baseCost: Res; costGrowth: number }, level: number): Res {
  const m = growthPow(def.costGrowth, level);
  const out: Res = {};
  for (const k of Object.keys(def.baseCost).sort() as ResourceId[]) {
    out[k] = Math.round((def.baseCost[k] ?? 0) * m);
  }
  return out;
}

/** Build duration in ticks to reach `level`. */
export function ticksAtLevel(def: { baseTicks: number; timeGrowth: number }, level: number): number {
  return Math.round(def.baseTicks * growthPow(def.timeGrowth, level));
}

export function addRes(a: Res, b: Res, sign = 1): Res {
  const out: Res = { ...a };
  for (const k of Object.keys(b) as ResourceId[]) out[k] = (out[k] ?? 0) + sign * (b[k] ?? 0);
  return out;
}

/** Number of cells in a hex map of the given radius. */
export function hexCellCount(radius: number): number {
  return 3 * radius * radius + 3 * radius + 1;
}

/** Inverse of hexCellCount; -1 if len is not a valid count. */
export function radiusFromCellCount(len: number): number {
  for (let r = 0; r < 200; r++) {
    const c = hexCellCount(r);
    if (c === len) return r;
    if (c > len) return -1;
  }
  return -1;
}

/** Index of cell (0,0) in the contract ordering (for q in -R..R, for r in -R..R if |q+r|<=R). */
export function centreCellIndex(radius: number): number {
  return radius * (2 * radius + 1) - (radius * (radius + 1)) / 2 + radius;
}

export type RepStage = 'hostile' | 'wary' | 'friendly' | 'allied';
export function repStage(rep: number): RepStage {
  return rep < -25 ? 'hostile' : rep < 25 ? 'wary' : rep < 65 ? 'friendly' : 'allied';
}
