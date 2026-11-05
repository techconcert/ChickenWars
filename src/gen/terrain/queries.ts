import type { FieldRamp, HeightField } from './fieldTypes';
import { clamp } from './sdf';

/** Placement queries on the height field (docs/04-terrain.md T6). All take world x,z. */
export function bil(F: HeightField, arr: Float32Array, x: number, z: number): number {
  let fx = (x - F.x0) / F.h;
  let fz = (z - F.z0) / F.h;
  fx = clamp(fx, 0, F.GW - 1.001);
  fz = clamp(fz, 0, F.GH - 1.001);
  const i = fx | 0;
  const j = fz | 0;
  const tx = fx - i;
  const tz = fz - j;
  const k = j * F.GW + i;
  return (arr[k]! * (1 - tx) + arr[k + 1]! * tx) * (1 - tz) + (arr[k + F.GW]! * (1 - tx) + arr[k + F.GW + 1]! * tx) * tz;
}

export function nearestIdx(F: HeightField, x: number, z: number): number {
  return clamp(Math.round((z - F.z0) / F.h), 0, F.GH - 1) * F.GW + clamp(Math.round((x - F.x0) / F.h), 0, F.GW - 1);
}

export const heightAt = (F: HeightField, x: number, z: number): number => bil(F, F.H, x, z);

export function slopeAt(F: HeightField, x: number, z: number): number {
  const e = 0.3;
  const gx = (heightAt(F, x + e, z) - heightAt(F, x - e, z)) / (2 * e);
  const gz = (heightAt(F, x, z + e) - heightAt(F, x, z - e)) / (2 * e);
  return Math.sqrt(gx * gx + gz * gz);
}

export const rampAt = (F: HeightField, x: number, z: number): number => bil(F, F.rampM, x, z);
export const rampSideAt = (F: HeightField, x: number, z: number): number => bil(F, F.rampSideM, x, z);
export const pathAt = (F: HeightField, x: number, z: number): number => bil(F, F.pathM, x, z);
export const lakeNearAt = (F: HeightField, x: number, z: number): number => bil(F, F.lakeNear, x, z);
export const sdf0At = (F: HeightField, x: number, z: number): number => bil(F, F.sdfs[0]!, x, z);
export const levelAt = (F: HeightField, x: number, z: number): number => F.Lg[nearestIdx(F, x, z)]!;
export const biomeAt = (F: HeightField, x: number, z: number): number => F.bioG[nearestIdx(F, x, z)]!;

/** Distance to the nearest terrace cliff line (min |sdf| over levels >= 1). */
export function distanceToCliff(F: HeightField, x: number, z: number): number {
  let d = 1e9;
  for (let k = 1; k <= F.maxLv; k++) d = Math.min(d, Math.abs(bil(F, F.sdfs[k]!, x, z)));
  return d;
}

/** Land, dry, and either gentle ground or on a ramp. */
export function isWalkableAt(F: HeightField, x: number, z: number): boolean {
  if (levelAt(F, x, z) < 0 || sdf0At(F, x, z) < 0.2) return false;
  if (lakeNearAt(F, x, z) > 0.3) return false;
  return rampAt(F, x, z) > 0.3 || slopeAt(F, x, z) < 0.75;
}

/** Nearest ramp by distance to its centreline segment. */
export function nearestRamp(F: HeightField, x: number, z: number): { ramp: FieldRamp; dist: number } | null {
  let best: FieldRamp | null = null;
  let bd = 1e18;
  for (const r of F.ramps) {
    const t = clamp((x - r.px) * r.ax + (z - r.pz) * r.az, -r.halfLo, r.halfHi);
    const dx = x - (r.px + r.ax * t);
    const dz = z - (r.pz + r.az * t);
    const d = dx * dx + dz * dz;
    if (d < bd) { bd = d; best = r; }
  }
  return best ? { ramp: best, dist: Math.sqrt(bd) } : null;
}
