// Town life (D48): pure helpers for the ambient NPC chickens of the base scene. No three.js, no sim state writes.
// Schedule, task weights, animation poses and obstacle push-out live here so they can be unit-tested.
import { DAY_TICKS } from '../../sim/constants';

export const ANIM = { idle: 0, peck: 1, dip: 2, chop: 3, hoe: 4, work: 5, sleep: 6, strike: 7, pour: 8, hop: 9, roll: 10, flap: 11 } as const;
export type AnimId = (typeof ANIM)[keyof typeof ANIM];

export const TASK = { wander: 0, peck: 1, water: 2, chop: 3, farm: 4, work: 5, sleep: 6 } as const;
export const ROLE = { rooster: 0, hen: 1, chicken: 2, chick: 3, infantry: 4, archer: 5, cavalry: 6 } as const;
export const PROP = { none: 0, bucket: 1, axe: 2, hoe: 3 } as const;

/** Which points of interest the town offers (bit flags). */
export const HAS = { pond: 1, tree: 2, farm: 4, lumber: 8, work: 16 } as const;

export const CIV_CAP = 24;
/** Soldiers: at most 3 formations (one per military building type) of at most 6 figures (D51). */
export const SOL_CAP = 18;
/** Outskirts chicks (D51) live in their own slots on top of the civilian + soldier budget. */
export const EXP_CAP = 5;
export const NPC_CAP = 30;
export const MAX_FORMATIONS = 3;
export const MAX_PER_FORMATION = 6;

/** Fraction of the day (0 = dawn, 0.5 = dusk, 0.75 = midnight), same convention as view/season.ts. */
export const dayFrac = (tick: number): number => (tick % DAY_TICKS) / DAY_TICKS;

/** Personal bedtime in [0.54, 0.66] and wake time in [0.0, 0.06] from a 0..1 random number. */
export const bedtime = (r: number): number => 0.54 + r * 0.12;
export const waketime = (r: number): number => r * 0.06;

/** True while `f` lies in the personal night window [bed, 1) U [0, wake). */
export function asleepAt(f: number, bed: number, wake: number): boolean {
  return f >= bed || f < wake;
}

/** How many civilians / soldiers to show: scales with the number of buildings and their levels; quality thins the crowd. */
export function population(buildings: number, levelSum: number, soldiers: number, quality: 'low' | 'medium' | 'high'): { civ: number; sol: number } {
  const qk = quality === 'low' ? 0.4 : quality === 'medium' ? 0.75 : 1;
  const cap = quality === 'low' ? 12 : quality === 'medium' ? 20 : NPC_CAP;
  const sol = Math.max(0, Math.min(SOL_CAP, soldiers, Math.floor(cap * 0.6)));
  const civWant = Math.round((2 + buildings * 0.55 + levelSum * 0.04) * qk);
  const civ = buildings > 0 ? Math.max(2, Math.min(civWant, CIV_CAP, cap - sol)) : 0;
  return { civ, sol };
}

/** Number of outskirts chicks by quality (3 to 5). */
export const explorerCount = (quality: 'low' | 'medium' | 'high'): number => (quality === 'low' ? 3 : quality === 'medium' ? 4 : EXP_CAP);

/** Military building types that get a patrol formation, in display order. */
export const MIL_TYPES = ['barracks', 'archery_range', 'stable'] as const;

/**
 * One building per military TYPE (barracks, archery range, stable): the highest level one, ties broken by the smallest id.
 * Ignores unbuilt (level 0) buildings. Never more than MAX_FORMATIONS entries.
 */
export function pickFormationBuildings<T extends { id: string; type: string; level: number }>(buildings: readonly T[]): T[] {
  const out: T[] = [];
  for (const type of MIL_TYPES) {
    let best: T | null = null;
    for (const b of buildings) {
      if (b.type !== type || b.level <= 0) continue;
      if (!best || b.level > best.level || (b.level === best.level && b.id < best.id)) best = b;
    }
    if (best) out.push(best);
  }
  return out.slice(0, MAX_FORMATIONS);
}

export interface TroopLite { id: string; class: string; tier: number; building: string; minBuildingLevel: number; requiresTech?: string | undefined; role?: string | undefined }

/**
 * The best (highest tier) player troop a building of `type` at `level` can train given the finished research.
 * Enemy troops are ignored. Falls back to the lowest tier when nothing is unlocked (should not happen: tier 1 is free).
 */
export function bestTroopFor(type: string, level: number, troops: readonly TroopLite[], done: readonly string[]): TroopLite | null {
  let best: TroopLite | null = null, low: TroopLite | null = null;
  for (const t of troops) {
    if (t.building !== type || t.role === 'enemy') continue;
    if (!low || t.tier < low.tier) low = t;
    if (level < t.minBuildingLevel) continue;
    if (t.requiresTech && !done.includes(t.requiresTech)) continue;
    if (!best || t.tier > best.tier) best = t;
  }
  return best ?? low;
}

/** Figures shown for `owned` troops: 2 for few, +1 per 6 owned, capped by `max` (quality) and MAX_PER_FORMATION. */
export function formationSize(owned: number, max = MAX_PER_FORMATION): number {
  return Math.max(2, Math.min(max, MAX_PER_FORMATION, 2 + Math.floor(Math.max(0, owned) / 6)));
}

/** Shrinks the biggest formations (never below 2) until the total fits `budget`. */
export function fitSizes(sizes: readonly number[], budget: number): number[] {
  const out = sizes.slice();
  let tot = out.reduce((a, b) => a + b, 0);
  while (tot > budget) {
    let k = -1;
    for (let i = 0; i < out.length; i++) if (out[i]! > 2 && (k < 0 || out[i]! > out[k]!)) k = i;
    if (k < 0) break;
    out[k]!--; tot--;
  }
  return out;
}

/** A point of the annulus rIn..rOut around (cx, cz) from two uniform randoms (area-uniform). Writes out[0], out[1]. */
export function outskirtsSpot(r1: number, r2: number, cx: number, cz: number, rIn: number, rOut: number, out: number[]): void {
  const a = r1 * Math.PI * 2;
  const r = Math.sqrt(rIn * rIn + r2 * (rOut * rOut - rIn * rIn));
  out[0] = cx + Math.sin(a) * r;
  out[1] = cz + Math.cos(a) * r;
}

/** True when a cell at hex distance `dist` from the town hall lies just past a territory of radius `territory`. */
export const inOutskirtsBand = (dist: number, territory: number): boolean => dist > territory && dist <= territory + 2;

/** Repeating role pattern for civilians (index -> role). Chicks follow the nearest hen before them. */
const PATTERN = [ROLE.hen, ROLE.rooster, ROLE.chick, ROLE.chicken, ROLE.hen, ROLE.chick, ROLE.chicken, ROLE.hen];
export const civRole = (i: number): number => PATTERN[i % PATTERN.length]!;

/** Pick a task for a civilian role. `flags` is a HAS bitmask; `r` in [0,1). Always returns something doable. */
export function pickTask(role: number, flags: number, r: number): number {
  const wRooster = role === ROLE.rooster;
  const wChick = role === ROLE.chick;
  const w: number[] = [wChick ? 2 : 1.2, 1.4, 0, 0, 0, 0];
  if (flags & HAS.pond && !wRooster) w[TASK.water] = wChick ? 0 : 2.2;
  if (flags & HAS.tree) w[TASK.chop] = wRooster ? 2.4 : role === ROLE.chicken ? 1.6 : 0.5;
  if (flags & HAS.farm) w[TASK.farm] = role === ROLE.hen ? 2.8 : role === ROLE.chicken ? 2 : 0.8;
  if (flags & HAS.work) w[TASK.work] = wRooster ? 2.2 : 1.4;
  let tot = 0;
  for (let i = 0; i < 6; i++) tot += w[i]!;
  let x = r * tot;
  for (let i = 0; i < 6; i++) {
    x -= w[i]!;
    if (x < 0) return i;
  }
  return TASK.wander;
}

export interface Pose { pitch: number; bob: number; fwd: number; swing: number; yaw: number }

const TAU = Math.PI * 2;
const frac = (x: number): number => x - Math.floor(x);

/** Looping pose for an animation at time `t` (seconds) with a per-NPC phase offset `ph` (radians). Writes into `o`. */
export function poseFor(anim: number, t: number, ph: number, o: Pose): Pose {
  o.pitch = 0; o.bob = 0; o.fwd = 0; o.swing = 0; o.yaw = 0;
  switch (anim) {
    case ANIM.peck: {
      const s = Math.sin(t * 5 + ph);
      o.pitch = 0.62 * (s > 0 ? s : 0);
      break;
    }
    case ANIM.dip:
      o.pitch = 0.75 + 0.1 * Math.sin(t * 3 + ph);
      o.swing = 0.5;
      break;
    case ANIM.chop:
    case ANIM.hoe: {
      const u = frac((t * (anim === ANIM.chop ? 1.05 : 0.8)) + ph / TAU);
      // slow wind-up (raise), fast strike (down)
      if (u < 0.68) { const k = u / 0.68; o.swing = -0.15 - 1.25 * k; o.pitch = -0.05 * k; } else { const k = (u - 0.68) / 0.32; o.swing = -1.4 + 2.3 * k; o.pitch = 0.1 + 0.3 * k; }
      break;
    }
    case ANIM.work: {
      const s = Math.sin(t * 9 + ph);
      o.bob = 0.03 * Math.abs(s);
      o.pitch = 0.12 * s;
      break;
    }
    case ANIM.strike: {
      const s = Math.sin(t * 5.2 + ph);
      const p = s > 0 ? s : 0;
      o.fwd = 0.12 * p;
      o.pitch = 0.4 * p;
      break;
    }
    case ANIM.pour:
      o.pitch = 0.5;
      o.yaw = 0.35 * Math.sin(t * 8 + ph);
      o.swing = 0.9 + 0.3 * Math.sin(t * 8 + ph);
      break;
    case ANIM.hop:
      o.bob = 0.13 * Math.abs(Math.sin(t * 7 + ph));
      o.pitch = 0.12 * Math.sin(t * 7 + ph);
      break;
    case ANIM.roll: { // tiny tumble: rock far forward and back with a little lift
      const s = Math.sin(t * 4.5 + ph);
      o.pitch = 1.05 * s;
      o.bob = 0.04 * Math.abs(s);
      o.yaw = 0.3 * Math.sin(t * 2.2 + ph);
      break;
    }
    case ANIM.flap: // quick excited little bounces
      o.bob = 0.07 * Math.abs(Math.sin(t * 15 + ph));
      o.pitch = 0.18 * Math.sin(t * 15 + ph);
      o.yaw = 0.25 * Math.sin(t * 6 + ph);
      break;
    default:
  }
  return o;
}

/**
 * Pushes (x, z) out of any circle obstacle it is inside (flat arrays), writing the result to `out[0], out[1]`.
 * Returns true when it moved the point.
 */
export function pushOut(x: number, z: number, ox: ArrayLike<number>, oz: ArrayLike<number>, or: ArrayLike<number>, n: number, margin: number, out: number[]): boolean {
  let moved = false;
  for (let k = 0; k < n; k++) {
    const dx = x - ox[k]!;
    const dz = z - oz[k]!;
    const r = or[k]! + margin;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    const d = Math.sqrt(d2) || 1e-4;
    x = ox[k]! + (dx / d) * r;
    z = oz[k]! + (dz / d) * r;
    moved = true;
  }
  out[0] = x;
  out[1] = z;
  return moved;
}

/** Formation slot offset (local frame, +z is forward) for member j of n. kind 0 = line, 1 = wedge, 2 = drill rows. */
export function formationSlot(kind: number, j: number, n: number, out: number[]): void {
  if (kind === 0) { out[0] = (j - (n - 1) / 2) * 0.36; out[1] = 0; } else if (kind === 1) {
    const side = j % 2 === 0 ? 1 : -1;
    const rank = Math.ceil(j / 2);
    out[0] = side * rank * 0.3; out[1] = -rank * 0.3;
  } else {
    const cols = 2;
    out[0] = ((j % cols) - (cols - 1) / 2) * 0.42; out[1] = -Math.floor(j / cols) * 0.4;
  }
}
