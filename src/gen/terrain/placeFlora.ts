import { makeNoise, mulberry32 } from '../noise';
import type { HeightField } from './fieldTypes';
import type { PropPlacement, TreePlacement } from './placeTypes';
import { biomeAt, distanceToCliff, heightAt, lakeNearAt, levelAt, nearestIdx, pathAt, rampAt, rampSideAt, sdf0At, slopeAt } from './queries';

const OFF: readonly (readonly [number, number])[] = [[0, 0], [1.6, 0], [-1.6, 0], [0, 1.6], [0, -1.6], [1.1, 1.1], [-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1]];

/** Trees: forest density feathers across region borders into meadow; meadows get low-frequency clumps. */
export function placeTrees(F: HeightField): TreePlacement[] {
  const r = mulberry32(F.seed * 104729 + 7);
  const noise = makeNoise(F.seed);
  const trees: TreePlacement[] = [];
  const hashG = new Map<number, [number, number, number][]>();
  const near = (x: number, z: number, rad: number): boolean => {
    const gx = Math.floor(x / 1.8);
    const gz = Math.floor(z / 1.8);
    for (let a = -1; a <= 1; a++) {
      for (let b = -1; b <= 1; b++) {
        const l = hashG.get((gx + a) * 10007 + (gz + b));
        if (l) for (const o of l) if (Math.hypot(x - o[0], z - o[1]) < Math.max(rad, o[2])) return true;
      }
    }
    return false;
  };
  const frac = (x: number, z: number, b: number): number => {
    let n = 0;
    for (const o of OFF) if (biomeAt(F, x + o[0], z + o[1]) === b) n++;
    return n / OFF.length;
  };
  const step = 0.85;
  for (let z = F.z0; z < F.z0 + F.GH * F.h; z += step) {
    for (let x = F.x0; x < F.x0 + F.GW * F.h; x += step) {
      const px = x + (r() - 0.5) * step * 1.4;
      const pz = z + (r() - 0.5) * step * 1.4;
      const b = biomeAt(F, px, pz);
      if (b < 1 || levelAt(F, px, pz) < 0) continue;
      // biome ids: 1 meadow, 2 forest, 3 highland, 4 snow
      const wF = frac(px, pz, 2);
      const wM = frac(px, pz, 1);
      const wH = frac(px, pz, 3);
      const wS = frac(px, pz, 4);
      const nz = noise.n2(px * 0.09 + 3, pz * 0.09) * 0.5 + 0.5;
      const p = wF * 0.85 * (0.5 + 0.5 * nz) + wM * (nz > 0.62 ? 0.55 : 0.03) + wH * 0.2 + wS * 0.14;
      if (r() > p) continue;
      if (sdf0At(F, px, pz) < 2.2 || lakeNearAt(F, px, pz) > 0.05 || rampAt(F, px, pz) > 0.02 || rampSideAt(F, px, pz) > 0.12 || pathAt(F, px, pz) > 0.15) continue;
      if (slopeAt(F, px, pz) > 0.28 || distanceToCliff(F, px, pz) < 0.55) continue;
      const minD = wF > 0.5 ? 0.85 : wH + wS > 0.5 ? 1.5 : 1.1;
      if (near(px, pz, minD)) continue;
      const lv = levelAt(F, px, pz);
      let type: number;
      if (b === 4) type = 8 + Math.floor(r() * 2);
      else if (b === 3) type = Math.floor(r() * 3);
      else type = r() < (lv >= 2 ? 0.65 : 0.3) ? Math.floor(r() * 3) : 3 + Math.floor(r() * 3);
      const sc = (wF > 0.5 ? 1.0 : 0.85) * (0.8 + 0.5 * r());
      trees.push({ x: px, y: heightAt(F, px, pz) - 0.03, z: pz, variant: type, scale: sc, rot: r() * 6.283, tint: 0.9 + 0.2 * r() });
      const kk = Math.floor(px / 1.8) * 10007 + Math.floor(pz / 1.8);
      const l = hashG.get(kk);
      if (l) l.push([px, pz, minD]);
      else hashG.set(kk, [[px, pz, minD]]);
    }
  }
  return trees;
}

/** Grass tufts and stones in meadow/forest, reeds and shore stones around lakes and the river. */
export function placeProps(F: HeightField): { tufts: PropPlacement[]; stones: PropPlacement[]; reeds: PropPlacement[] } {
  const r = mulberry32(F.seed * 31337 + 1);
  const tufts: PropPlacement[] = [];
  const stones: PropPlacement[] = [];
  const reeds: PropPlacement[] = [];
  for (let z = F.z0; z < F.z0 + F.GH * F.h; z += 0.75) {
    for (let x = F.x0; x < F.x0 + F.GW * F.h; x += 0.75) {
      const px = x + r() * 0.75;
      const pz = z + r() * 0.75;
      const b = biomeAt(F, px, pz);
      if ((b === 1 || b === 2) && levelAt(F, px, pz) >= 0) {
        const q = b === 1 ? 0.3 : 0.12;
        if (r() > q) continue;
        if (sdf0At(F, px, pz) < 1.8 || lakeNearAt(F, px, pz) > 0.05 || rampAt(F, px, pz) > 0.1 || rampSideAt(F, px, pz) > 0.2 || pathAt(F, px, pz) > 0.3 || slopeAt(F, px, pz) > 0.35 || distanceToCliff(F, px, pz) < 0.4) continue;
        const y = heightAt(F, px, pz);
        if (r() < 0.1) stones.push({ x: px, y, z: pz, scale: 0.2 + 0.22 * r(), rot: r() * 6.28, tint: 1 });
        else tufts.push({ x: px, y, z: pz, scale: 0.8 + 0.7 * r(), rot: r() * 6.28, tint: 0.9 + 0.2 * r() });
      } else if (lakeNearAt(F, px, pz) > 0.3) {
        const y = heightAt(F, px, pz);
        const wl = F.wl[nearestIdx(F, px, pz)]!;
        if (Math.abs(y - wl) < 0.12 && r() < 0.35) reeds.push({ x: px, y, z: pz, scale: 1.1 + 0.8 * r(), rot: r() * 6.28, tint: 1 });
        else if (y < wl && y > wl - 0.4 && r() < 0.04) stones.push({ x: px, y, z: pz, scale: 0.25 + 0.2 * r(), rot: r() * 6.28, tint: 1 });
        else if (y > wl && y < wl + 0.35 && r() < 0.05) stones.push({ x: px, y, z: pz, scale: 0.2 + 0.2 * r(), rot: r() * 6.28, tint: 1 });
      }
    }
  }
  return { tufts, stones, reeds };
}

