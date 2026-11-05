import { SQ3, makeHexGrid, worldToCell } from '../hex';
import { makeNoise } from '../noise';
import { BASE_CLIFF, BASE_WATER } from './constants';

export interface BaseHeightField {
  radius: number;
  x0: number;
  z0: number;
  h: number;
  GW: number;
  GH: number;
  H: Float32Array;
  /** plateau reference height, pond surface and sea level */
  plateauY: number;
  pondY: number;
  seaY: number;
  /** bilinear ground height at world x,z (clamped to the grid) */
  heightAt(x: number, z: number): number;
  /** ground height at a base cell centre, for placing buildings */
  cellHeight(cell: number): number;
}

const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const smooth = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

function blur(a: Float32Array, GW: number, GH: number, passes: number, rad: number): void {
  const t = new Float32Array(a.length);
  const inv = 1 / (2 * rad + 1);
  for (let p = 0; p < passes; p++) {
    for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
      let s = 0;
      for (let q = -rad; q <= rad; q++) s += a[j * GW + clamp(i + q, 0, GW - 1)]!;
      t[j * GW + i] = s * inv;
    }
    for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
      let s = 0;
      for (let q = -rad; q <= rad; q++) s += t[clamp(j + q, 0, GH - 1) * GW + i]!;
      a[j * GW + i] = s * inv;
    }
  }
}

/** A gently rolling plateau; cliff cells at the rim fall away to water; water cells form a shallow pond. */
export function buildBaseHeightField(terrain: number[], radius: number, seed = 0): BaseHeightField {
  const g = makeHexGrid(radius);
  const noise = makeNoise(seed ^ 0x2545f491);
  const h = 0.35;
  const ex = (radius + 1.5) * SQ3 + 6;
  const ez = (radius + 1) * 1.5 + 6;
  const x0 = -ex;
  const z0 = -ez;
  const GW = Math.floor((2 * ex) / h) + 1;
  const GH = Math.floor((2 * ez) / h) + 1;
  const n = GW * GH;
  const land = new Float32Array(n);
  const pond = new Float32Array(n);
  const roll = new Float32Array(n);
  for (let j = 0; j < GH; j++) {
    for (let i = 0; i < GW; i++) {
      const k = j * GW + i;
      const x = x0 + i * h;
      const z = z0 + j * h;
      const wx = x + 0.35 * noise.n2(x * 0.3, z * 0.3);
      const wz = z + 0.35 * noise.n2(x * 0.3 + 9, z * 0.3 + 4);
      const c = worldToCell(g, wx, wz);
      const t = c < 0 ? BASE_CLIFF : terrain[c]!;
      land[k] = t === BASE_CLIFF ? 0 : 1;
      pond[k] = t === BASE_WATER ? 1 : 0;
      roll[k] = 0.16 * noise.n2(x * 0.09, z * 0.09) + 0.07 * noise.n2(x * 0.21 + 5, z * 0.21);
    }
  }
  blur(land, GW, GH, 2, 2);
  blur(pond, GW, GH, 2, 2);
  const plateauY = 0;
  const seaY = -2.4;
  const H = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    let y = plateauY + roll[k]!;
    y -= 0.8 * smooth(0.55, 0.9, pond[k]!);
    H[k] = seaY + (y - seaY) * smooth(0.3, 0.62, land[k]!);
  }
  const heightAt = (x: number, z: number): number => {
    const fx = clamp((x - x0) / h, 0, GW - 1.001);
    const fz = clamp((z - z0) / h, 0, GH - 1.001);
    const i = fx | 0;
    const j = fz | 0;
    const tx = fx - i;
    const tz = fz - j;
    const k = j * GW + i;
    return (H[k]! * (1 - tx) + H[k + 1]! * tx) * (1 - tz) + (H[k + GW]! * (1 - tx) + H[k + GW + 1]! * tx) * tz;
  };
  return { radius, x0, z0, h, GW, GH, H, plateauY, pondY: -0.3, seaY, heightAt, cellHeight: (cell) => heightAt(g.x[cell]!, g.z[cell]!) };
}
