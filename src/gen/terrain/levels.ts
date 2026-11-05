import { cellDistance } from '../hex';
import { hash3i } from '../noise';
import { settleLevels } from './patches';
import type { LakeInfo, World } from './types';

/** Hex distance from every land cell to the sea (non-land) via multi-source BFS. */
function computeDsea(w: World): void {
  const { N, grid, isLand, dsea } = w;
  dsea.fill(9999);
  const q: number[] = [];
  for (let c = 0; c < N; c++) if (!isLand[c]) { dsea[c] = 0; q.push(c); }
  for (let h = 0; h < q.length; h++) {
    const c = q[h]!;
    for (let k = 0; k < 6; k++) {
      const b = grid.nb[c * 6 + k]!;
      if (b >= 0 && dsea[b]! > dsea[c]! + 1) { dsea[b] = dsea[c]! + 1; q.push(b); }
    }
  }
}

/** Region depth and terrace level (0 beach, 1..4 inland). */
export function assignRegionLevels(w: World): void {
  const { NRg, landList, radj, isCoastR, rcx, rcz, noise, rCells } = w;
  computeDsea(w);
  const depth = new Int16Array(NRg).fill(-1);
  const q: number[] = [];
  for (const r of landList) if (isCoastR[r]) { depth[r] = 0; q.push(r); }
  for (let h = 0; h < q.length; h++) {
    const a = q[h]!;
    for (const b of radj[a]!) if (depth[b]! < 0) { depth[b] = depth[a]! + 1; q.push(b); }
  }
  for (const r of landList) if (depth[r]! < 0) depth[r] = 0;
  const rLevel = new Int8Array(NRg);
  if (w.R <= 34) {
    for (const r of landList) rLevel[r] = depth[r] === 0 ? 0 : Math.min(4, depth[r]!);
  } else {
    // bigger worlds: levels follow the mean distance to the sea, neighbours differ by at most 1
    for (const r of landList) {
      let s = 0;
      for (const c of rCells[r]!) s += w.dsea[c]!;
      rLevel[r] = Math.min(4, Math.floor(s / rCells[r]!.length / 6.5));
    }
    for (let it = 0; it < 12; it++) {
      let ch = false;
      for (const r of landList) {
        for (const b of radj[r]!) if (rLevel[r]! > rLevel[b]! + 1) { rLevel[r] = rLevel[b]! + 1; ch = true; }
      }
      if (!ch) break;
    }
  }
  let peak = -1;
  let bs = -1e18;
  for (const r of landList) {
    const sc = (w.R <= 34 ? depth[r]! : rLevel[r]!) * 1000 - Math.sqrt(rcx[r]! * rcx[r]! + rcz[r]! * rcz[r]!);
    if (sc > bs) { bs = sc; peak = r; }
  }
  if (peak >= 0 && rLevel[peak]! > 0 && rLevel[peak]! < 4) rLevel[peak] = rLevel[peak]! + 1;
  if (w.R <= 34) {
    for (const r of landList) {
      if (depth[r]! >= 2 && r !== peak && rLevel[r]! < 4 && noise.n2(rcx[r]! * 0.1 + 3, rcz[r]! * 0.1) > 0.1) rLevel[r] = rLevel[r]! + 1;
    }
  }
  let maxL = 0;
  for (const r of landList) if (rLevel[r]! > maxL) maxL = rLevel[r]!;
  w.depth = depth;
  w.rLevel = rLevel;
  w.peak = peak;
  w.maxL = maxL;
}

/** River start type: a descending water channel from the peak to the sea, with 4-cell fords. */
export function carveRiver(w: World): void {
  if (!w.start.river || w.peak < 0) return;
  const { grid, dsea, rnd, bridge, isLand } = w;
  let cur = w.rCenterCell[w.peak]!;
  if (cur < 0) return;
  const path = [cur];
  const seen = new Set<number>([cur]);
  let sideways = 0;
  for (let guard = 0; guard < 400 && dsea[cur]! > 1; guard++) {
    const down: number[] = [];
    const side: number[] = [];
    for (let k = 0; k < 6; k++) {
      const n = grid.nb[cur * 6 + k]!;
      if (n < 0 || !isLand[n] || seen.has(n) || bridge[n]) continue;
      if (dsea[n]! < dsea[cur]!) down.push(n);
      else if (dsea[n] === dsea[cur]) side.push(n);
    }
    let next = -1;
    if (side.length && sideways < 2 && rnd() < 0.3) { next = side[Math.floor(rnd() * side.length)]!; sideways++; }
    else if (down.length) { next = down[Math.floor(rnd() * down.length)]!; sideways = 0; }
    else if (side.length) next = side[Math.floor(rnd() * side.length)]!;
    if (next < 0) break;
    path.push(next);
    seen.add(next);
    cur = next;
  }
  if (path.length < 8) return;
  for (const c of path) w.river[c] = 1;
  const fordAt: number[] = [Math.round(path.length * 0.3)];
  for (let i = fordAt[0]! + 12; i < path.length - 6; i += 12) fordAt.push(i);
  for (const s of fordAt) for (let i = s; i < s + 4 && i < path.length - 2; i++) w.river[path[i]!] = 2;
  w.riverPath = path;
}

/** Hex distance (capped) over land from the given source cells; 99 elsewhere. */
function distFrom(w: World, sources: number[], maxD: number): Int16Array {
  const d = new Int16Array(w.N).fill(99);
  const q: number[] = [];
  for (const c of sources) { d[c] = 0; q.push(c); }
  for (let h = 0; h < q.length; h++) {
    const c = q[h]!;
    if (d[c]! >= maxD) continue;
    for (let k = 0; k < 6; k++) {
      const b = w.grid.nb[c * 6 + k]!;
      if (b >= 0 && w.isLand[b] && d[b]! > d[c]! + 1) { d[b] = d[c]! + 1; q.push(b); }
    }
  }
  return d;
}

/** Small round lakes (basins one level down) inside interior regions. */
export function placeLakes(w: World): void {
  const { grid, rnd } = w;
  const rad = w.R <= 34 ? 2 : 3;
  const rd = w.riverPath.length ? distFrom(w, w.riverPath, rad + 4) : null;
  const want = Math.max(1, Math.min(3, Math.floor(w.landList.length / (w.R <= 34 ? 10 : 6))));
  const cands = w.landList.filter((r) => !w.isCoastR[r] && w.rLevel[r]! >= 1 && r !== w.peak);
  for (let i = cands.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [cands[i], cands[j]] = [cands[j]!, cands[i]!];
  }
  const tryRegion = (r: number): boolean => {
    const c0 = w.rCenterCell[r]!;
    if (c0 < 0 || w.dsea[c0]! < rad + 4) return false;
    if (rd && rd[c0]! <= rad + 3) return false;
    const inside: number[] = [];
    for (let c = 0; c < w.N; c++) {
      if (cellDistance(grid, c, c0) > rad + 2) continue;
      if (!w.isLand[c] || w.region[c] !== r || w.bridge[c] || w.lakeId[c]! >= 0) return false;
      inside.push(c);
    }
    for (const lk of w.lakes) if (cellDistance(grid, lk.cells[0]!, c0) < 2 * rad + 6) return false;
    const cells = inside.filter((c) => {
      const d = cellDistance(grid, c, c0);
      return d <= rad - 1 || (d === rad && hash3i(grid.q[c]!, grid.r[c]!, 9, w.seed) < 0.85) || (d === rad + 1 && hash3i(grid.q[c]!, grid.r[c]!, 10, w.seed) < 0.3);
    });
    // fill pockets so no land cell is left stranded inside the lake
    const set = new Set(cells);
    for (let pass = 0; pass < 3; pass++) {
      for (const c of inside) {
        if (set.has(c)) continue;
        let n = 0;
        for (let k = 0; k < 6; k++) if (set.has(grid.nb[c * 6 + k]!)) n++;
        if (n >= 3) { set.add(c); cells.push(c); }
      }
    }
    const info: LakeInfo = { id: w.lakes.length, region: r, level: w.rLevel[r]! - 1, cells };
    for (const c of cells) w.lakeId[c] = info.id;
    w.lakes.push(info);
    return true;
  };
  for (const r of cands) {
    if (w.lakes.length >= want) break;
    tryRegion(r);
  }
}

/** Cell levels: region level plus noise blobs, lake basins, river valley terraces; then flat-patch clean-up. */
export function assignCellLevels(w: World): void {
  const { N, grid, isLand, region, rLevel, noise } = w;
  // cells near a lake keep their level (clean rim)
  const nearLake = new Uint8Array(N);
  for (let c = 0; c < N; c++) {
    if (!isLand[c]) continue;
    for (const lk of w.lakes) if (cellDistance(grid, c, lk.cells[0]!) <= 8) { nearLake[c] = 1; break; }
  }
  // river valley: 3-hex-wide terraces rising from the water (level 0), and a flat ford plaza of radius 2 around each ford
  const rd = w.riverPath.length ? distFrom(w, w.riverPath, 9) : null;
  const fd = w.riverPath.length ? distFrom(w, w.riverPath.filter((c) => w.river[c] === 2), 5) : null;
  for (let c = 0; c < N; c++) {
    if (!isLand[c]) continue;
    const r = region[c]!;
    let l = rLevel[r]!;
    if (w.lakeId[c]! >= 0) { w.lvl[c] = w.lakes[w.lakeId[c]!]!.level; continue; }
    if (w.river[c]) { w.lvl[c] = 0; continue; }
    if (w.bridge[c]) { w.lvl[c] = 0; continue; }
    if (l >= 1 && !nearLake[c]) {
      let inner = true;
      for (let k = 0; k < 6; k++) {
        const b = grid.nb[c * 6 + k]!;
        if (b < 0 || region[b] !== r || w.bridge[b]) { inner = false; break; }
      }
      if (inner) {
        const v = noise.n2(grid.x[c]! * 0.17 + 7, grid.z[c]! * 0.17);
        if (v > 0.5) l++;
        else if (v < -0.55 && rLevel[r]! >= 2) l--;
      }
    }
    if (rd && rd[c]! >= 1 && rd[c]! <= 9) l = Math.min(l, Math.ceil(rd[c]! / 3));
    if (fd && fd[c]! <= 5) l = Math.min(l, Math.max(0, fd[c]! - 2));
    w.lvl[c] = l;
  }
  settleLevels(w);
  // keep lake surfaces at or below their banks after clean-up
  for (const lk of w.lakes) {
    let lowest = 99;
    for (const c of lk.cells) {
      for (let k = 0; k < 6; k++) {
        const b = grid.nb[c * 6 + k]!;
        if (b >= 0 && isLand[b] && w.lakeId[b]! < 0 && !w.river[b]) lowest = Math.min(lowest, w.lvl[b]!);
      }
    }
    if (lowest < 99 && lowest < lk.level) lk.level = Math.max(0, lowest);
    for (const c of lk.cells) w.lvl[c] = lk.level;
  }
}
