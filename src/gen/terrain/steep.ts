// Cells where a world marker would sink into a slope or hide behind a ledge, judged on the real height field.
import type { HeightField } from './fieldTypes';
import { heightAt } from './queries';

const MODEL_MID = 0.8;
const PITCH = Math.tan((35 * Math.PI) / 180);
const FOOT_R = 0.8;
const FOOT_TOL = 0.35;
const REACH = 8;

/** Why a model standing at (x, z) would look wrong, or '' when it is fine. Checks 8 directions: footprint slope, then any ledge above the sight line from a camera at the flattest accepted pitch. */
export function clipReason(field: HeightField, x: number, z: number): string {
  const h0 = heightAt(field, x, z);
  for (let a = 0; a < 8; a++) {
    const fx = Math.cos((a * Math.PI) / 4), fz = Math.sin((a * Math.PI) / 4);
    if (Math.abs(heightAt(field, x + fx * FOOT_R, z + fz * FOOT_R) - h0) > FOOT_TOL) return 'slope under footprint';
    for (let d = 0.6; d <= REACH; d += 0.4) {
      if (heightAt(field, x + fx * d, z + fz * d) > h0 + MODEL_MID + d * PITCH) return `ledge ${d.toFixed(1)} away at ${a * 45} deg`;
    }
  }
  return '';
}
