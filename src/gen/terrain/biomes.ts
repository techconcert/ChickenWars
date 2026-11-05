import { B_BEACH, B_FOREST, B_HIGHLAND, B_MEADOW, B_SNOW, F_BUILDABLE, F_COAST, F_LAKE, F_LAND, F_RAMP, F_WALKABLE, isWater, type World } from './types';

/** Region biome. Frozen starts shift effective altitude up with a north bias (north = -z). */
export function assignBiomes(w: World): void {
  const { NRg, landList, rLevel, noise, rcx, rcz } = w;
  const rBiome = new Uint8Array(NRg);
  const sb = w.start.snowBaseline;
  for (const r of landList) {
    const l = rLevel[r]!;
    const north = Math.max(0, Math.min(1, (-rcz[r]! / w.worldR) * 0.5 + 0.5));
    const lEff = l + (sb > 0 ? Math.floor(sb * (1 + 2 * north) + 0.5) : 0);
    if (l === 0 && lEff < 3) rBiome[r] = noise.n2(rcx[r]! * 0.07 + 40, rcz[r]! * 0.07) > 0.35 ? B_FOREST : B_MEADOW;
    else if ((w.maxL >= 3 && l === w.maxL) || lEff >= 4) rBiome[r] = B_SNOW;
    else if (lEff >= 3) rBiome[r] = B_HIGHLAND;
    else rBiome[r] = noise.n2(rcx[r]! * 0.07 + 20, rcz[r]! * 0.07) > -0.05 ? B_FOREST : B_MEADOW;
  }
  let m = 0;
  let f = 0;
  for (const r of landList) {
    if (rBiome[r] === B_MEADOW) m++;
    if (rBiome[r] === B_FOREST) f++;
  }
  for (const r of landList) {
    if (rBiome[r] === B_FOREST && m === 0 && f > 1) { rBiome[r] = B_MEADOW; m++; f--; }
    else if (rBiome[r] === B_MEADOW && f === 0 && m > 1) { rBiome[r] = B_FOREST; f++; m--; }
  }
  w.rBiome = rBiome;
}

export function hasSeaNeighbour(w: World, c: number): boolean {
  for (let k = 0; k < 6; k++) {
    const b = w.grid.nb[c * 6 + k]!;
    if (b < 0 || !w.isLand[b]) return true;
  }
  return false;
}

export function cellBiome(w: World, c: number): number {
  if (!w.isLand[c]) return B_BEACH;
  if (isWater(w, c) || w.bridge[c] || w.river[c] === 2) return B_BEACH;
  if (w.lvl[c] === 0 && hasSeaNeighbour(w, c)) return B_BEACH;
  return w.rBiome[w.region[c]!]!;
}

export function cellFlags(w: World, c: number): number {
  if (!w.isLand[c]) return 0;
  let f = F_LAND;
  const water = isWater(w, c);
  if (water) f |= F_LAKE;
  else {
    f |= F_WALKABLE;
    if (!w.isRampCell[c] && !w.bridge[c] && w.river[c] !== 2) f |= F_BUILDABLE;
  }
  if (w.isRampCell[c] || w.bridge[c]) f |= F_RAMP;
  if (hasSeaNeighbour(w, c)) f |= F_COAST;
  return f;
}

const BIOME_COST = [1, 1, 3, 3, 4];
export function cellNavCost(w: World, c: number, biome: number, flags: number): number {
  if (!(flags & F_WALKABLE)) return 0;
  let cost = BIOME_COST[biome] ?? 1;
  if (w.bridge[c] || w.river[c] === 2 || w.isRampCell[c]) cost += 1;
  return Math.min(9, Math.max(1, cost));
}
