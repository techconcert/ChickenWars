import { SQ3, cellDistance, makeHexGrid, worldToCell } from '../hex';
import { hash3i, makeNoise, mulberry32 } from '../noise';
import type { StartTypeParams, World } from './types';

const PI = 3.141592653589793;
/** 12 unit directions (every 30 degrees) as literals, so no trig is needed in the logic layer. */
const DIR12: readonly (readonly [number, number])[] = [
  [1, 0], [0.8660254037844386, 0.5], [0.5, 0.8660254037844386], [0, 1], [-0.5, 0.8660254037844386], [-0.8660254037844386, 0.5],
  [-1, 0], [-0.8660254037844386, -0.5], [-0.5, -0.8660254037844386], [0, -1], [0.5, -0.8660254037844386], [0.8660254037844386, -0.5],
];
const SIN_PI_OVER_K = [0, 0, 1, 0.8660254037844386, 0.7071067811865476, 0.5877852522924731, 0.5];

export function createWorld(seed: number, R: number, start: StartTypeParams): World {
  const grid = makeHexGrid(R);
  const N = grid.count;
  const worldR = R * SQ3;
  const IR = (worldR * 26) / 34;
  const islands = Math.max(1, Math.min(6, Math.round(start.islands)));
  let S = 6.2 * SQ3;
  if (R > 34) {
    const target = Math.max(7, 10 + (R - 40) * 0.22);
    S = Math.sqrt((PI * IR * IR * 0.7) / (target * 0.866));
  }
  if (islands > 1) S *= 0.62;
  return {
    seed, R, N, grid, rnd: mulberry32(Math.imul(seed | 0, 0x9e3779b1) ^ 0x9e3779b9), noise: makeNoise(seed), start, worldR, S, IR, islands,
    isLand: new Uint8Array(N), region: new Int16Array(N).fill(-1), NRg: 0,
    rcx: new Float64Array(0), rcz: new Float64Array(0), rCells: [], landR: new Uint8Array(0), radj: [], isCoastR: new Uint8Array(0),
    rCenterCell: new Int32Array(0), landList: [], bridge: new Uint8Array(N), bridgeLinks: [], depth: new Int16Array(0), rLevel: new Int8Array(0),
    peak: -1, maxL: 0, lvl: new Int8Array(N).fill(-9), lakeId: new Int16Array(N).fill(-1), lakes: [], river: new Uint8Array(N), riverPath: [],
    dsea: new Int16Array(N), rBiome: new Uint8Array(0), ramps: [], path: new Uint8Array(N), isRampCell: new Uint8Array(N), merged: 0,
  };
}

/** Macro regions, island mask, coastline wobble, island bridges. Fills region/isLand/bridge and the region tables. */
export function buildRegions(w: World): void {
  const { grid, N, rnd, noise, S, worldR, seed } = w;
  const { x: cx, z: cz, nb } = grid;

  // jittered hex-lattice seeds
  const seeds: [number, number][] = [];
  const L = Math.ceil((1.4 * worldR) / (S * 0.866)) + 2;
  const lim = 1.324 * worldR;
  for (let j = -L; j <= L; j++) {
    for (let i = -L; i <= L; i++) {
      const px = (i + (j & 1 ? 0.5 : 0)) * S;
      const pz = j * S * 0.866;
      if (px * px + pz * pz > lim * lim) continue;
      seeds.push([px + (rnd() - 0.5) * 0.66 * S, pz + (rnd() - 0.5) * 0.66 * S]);
    }
  }
  const wk = Math.sqrt(Math.max(1, S / 10.74));
  const wamp = 1.7 * wk;
  const wf = 0.12 / wk;
  const regionRaw = new Int32Array(N);
  for (let c = 0; c < N; c++) {
    const wx = cx[c]! + noise.n2(cx[c]! * wf, cz[c]! * wf) * wamp;
    const wz = cz[c]! + noise.n2(cx[c]! * wf + 50, cz[c]! * wf) * wamp;
    let best = 1e18;
    let bi = 0;
    for (let s = 0; s < seeds.length; s++) {
      const dx = wx - seeds[s]![0];
      const dz = wz - seeds[s]![1];
      const d = dx * dx + dz * dz;
      if (d < best) {
        best = d;
        bi = s;
      }
    }
    regionRaw[c] = bi;
  }
  const remap = new Map<number, number>();
  let NRg = 0;
  const region = w.region;
  for (let c = 0; c < N; c++) {
    const id = regionRaw[c]!;
    let m = remap.get(id);
    if (m === undefined) {
      m = NRg++;
      remap.set(id, m);
    }
    region[c] = m;
  }
  w.NRg = NRg;
  const rcx = new Float64Array(NRg);
  const rcz = new Float64Array(NRg);
  const rcnt = new Int32Array(NRg);
  const touchEdge = new Uint8Array(NRg);
  for (let c = 0; c < N; c++) {
    const r = region[c]!;
    rcx[r] = rcx[r]! + cx[c]!;
    rcz[r] = rcz[r]! + cz[c]!;
    rcnt[r] = rcnt[r]! + 1;
    for (let k = 0; k < 6; k++) if (nb[c * 6 + k]! < 0) touchEdge[r] = 1;
  }
  for (let r = 0; r < NRg; r++) {
    rcx[r] = rcx[r]! / rcnt[r]!;
    rcz[r] = rcz[r]! / rcnt[r]!;
  }
  const rawAdj: number[][] = Array.from({ length: NRg }, () => []);
  for (let c = 0; c < N; c++) {
    for (let k = 0; k < 6; k++) {
      const b = nb[c * 6 + k]!;
      if (b >= 0 && region[b] !== region[c] && !rawAdj[region[c]!]!.includes(region[b]!)) rawAdj[region[c]!]!.push(region[b]!);
    }
  }

  // island centres: one (map centre) or a ring of K
  const K = w.islands;
  const centres: [number, number, number][] = []; // x, z, radius scale
  if (K === 1) centres.push([0, 0, 1]);
  else {
    const base = Math.floor(hash3i(seed, 7, 7, 3) * 12);
    const stepDir = Math.max(1, Math.floor(12 / K));
    const rho = 0.52 * worldR;
    const chord = 2 * rho * SIN_PI_OVER_K[K]!;
    const isle = Math.min(0.3 * worldR, 0.36 * chord);
    for (let i = 0; i < K; i++) {
      const d = DIR12[(base + i * stepDir) % 12]!;
      const rj = rho * (0.9 + 0.2 * hash3i(seed, i, 11, 5));
      centres.push([d[0] * rj, d[1] * rj, isle / w.IR]);
    }
  }
  const centreRegion = centres.map(([x, z]) => region[worldToCell(grid, x, z)] ?? 0);

  const computeLand = (scale: number): Uint8Array => {
    const land = new Uint8Array(NRg);
    for (let r = 0; r < NRg; r++) {
      let v = 1e9;
      for (const [x, z, rs] of centres) {
        const dx = rcx[r]! - x;
        const dz = rcz[r]! - z;
        v = Math.min(v, Math.sqrt(dx * dx + dz * dz) / (w.IR * rs * scale));
      }
      v += noise.n2(rcx[r]! * 0.045 + 9, rcz[r]! * 0.045) * 0.3;
      land[r] = v < 1 && !touchEdge[r] ? 1 : 0;
    }
    for (const cr of centreRegion) land[cr] = 1;
    // keep connected components (largest only for one island, all with >= 2 regions otherwise)
    const comp = new Int32Array(NRg).fill(-1);
    const sizes: number[] = [];
    for (let r = 0; r < NRg; r++) {
      if (!land[r] || comp[r]! >= 0) continue;
      let n = 0;
      const st = [r];
      comp[r] = sizes.length;
      while (st.length) {
        const a = st.pop()!;
        n++;
        for (const b of rawAdj[a]!) if (land[b] && comp[b]! < 0) { comp[b] = sizes.length; st.push(b); }
      }
      sizes.push(n);
    }
    let bestC = 0;
    sizes.forEach((n, i) => { if (n > sizes[bestC]!) bestC = i; });
    for (let r = 0; r < NRg; r++) {
      if (!land[r]) continue;
      const keep = K === 1 ? comp[r] === bestC : sizes[comp[r]!]! >= 2 || centreRegion.includes(r);
      if (!keep) land[r] = 0;
    }
    // enclosed sea becomes land
    const outer = new Uint8Array(NRg);
    const st: number[] = [];
    for (let r = 0; r < NRg; r++) if (!land[r] && touchEdge[r]) { outer[r] = 1; st.push(r); }
    while (st.length) {
      const a = st.pop()!;
      for (const b of rawAdj[a]!) if (!land[b] && !outer[b]) { outer[b] = 1; st.push(b); }
    }
    for (let r = 0; r < NRg; r++) if (!land[r] && !outer[r]) land[r] = 1;
    return land;
  };
  const minRegions = w.R <= 34 ? 14 : K > 1 ? 3 * K : 8;
  let scale = 1;
  let landR = computeLand(scale);
  for (let it = 0; it < 10; it++) {
    let n = 0;
    for (let r = 0; r < NRg; r++) n += landR[r]!;
    if (n >= minRegions) break;
    scale *= 1.1;
    landR = computeLand(scale);
  }

  const isLand = w.isLand;
  for (let c = 0; c < N; c++) isLand[c] = landR[region[c]!]!;
  // micro-level coastline wobble (accrete beach cells, erode peninsula tips), snapshot so it does not chain
  const snap = isLand.slice();
  for (let c = 0; c < N; c++) {
    let ln = 0;
    let on = 0;
    let lr = -1;
    let full = true;
    for (let k = 0; k < 6; k++) {
      const b = nb[c * 6 + k]!;
      if (b < 0) { on++; full = false; } else if (!snap[b]) on++;
      else { ln++; lr = region[b]!; }
    }
    if (!snap[c]) {
      if (ln >= 2 && full && hash3i(grid.q[c]!, grid.r[c]!, 3, seed) < 0.45) { isLand[c] = 1; region[c] = lr; }
    } else if (on >= 4 && hash3i(grid.q[c]!, grid.r[c]!, 4, seed) < 0.6) isLand[c] = 0;
  }
  for (let c = 0; c < N; c++) if (!isLand[c]) region[c] = -1;

  // cell-level components: drop islets, then bridge the remaining islands
  const comps = landComponents(w);
  const minSize = K === 1 ? 1e9 : 12;
  let keepIdx = comps.map((cc, i) => i);
  if (K === 1) {
    let b = 0;
    comps.forEach((cc, i) => { if (cc.length > comps[b]!.length) b = i; });
    keepIdx = [b];
  } else keepIdx = keepIdx.filter((i) => comps[i]!.length >= minSize);
  const keepSet = new Set(keepIdx);
  comps.forEach((cc, i) => { if (!keepSet.has(i)) for (const c of cc) { isLand[c] = 0; region[c] = -1; } });
  if (keepIdx.length > 1) carveBridges(w, keepIdx.map((i) => comps[i]!));
  finalizeRegions(w);
}

function landComponents(w: World): number[][] {
  const { N, grid, isLand } = w;
  const seen = new Uint8Array(N);
  const comps: number[][] = [];
  for (let c = 0; c < N; c++) {
    if (!isLand[c] || seen[c]) continue;
    const cc = [c];
    seen[c] = 1;
    for (let h = 0; h < cc.length; h++) {
      const a = cc[h]!;
      for (let k = 0; k < 6; k++) {
        const b = grid.nb[a * 6 + k]!;
        if (b >= 0 && isLand[b] && !seen[b]) { seen[b] = 1; cc.push(b); }
      }
    }
    comps.push(cc);
  }
  return comps;
}

function coastalCells(w: World, cells: number[]): number[] {
  const out: number[] = [];
  for (const c of cells) {
    for (let k = 0; k < 6; k++) {
      const b = w.grid.nb[c * 6 + k]!;
      if (b >= 0 && !w.isLand[b]) { out.push(c); break; }
    }
  }
  const stride = Math.max(1, Math.floor(out.length / 500));
  return out.filter((_, i) => i % stride === 0);
}

/** Prim over island components with straight bridge strips (3 cells wide) across the sea. */
function carveBridges(w: World, comps: number[][]): void {
  const { grid, isLand, region, bridge } = w;
  const coast = comps.map((cc) => coastalCells(w, cc));
  const joined = new Set<number>([0]);
  while (joined.size < comps.length) {
    let best = 1e9;
    let bA = -1;
    let bB = -1;
    for (const x of joined) {
      for (let y = 0; y < comps.length; y++) {
        if (joined.has(y)) continue;
        for (const a of coast[x]!) for (const b of coast[y]!) {
          const d = cellDistance(grid, a, b);
          if (d < best) { best = d; bA = a; bB = b; }
        }
      }
    }
    if (bA < 0) break;
    const ya = comps.findIndex((cc, i) => !joined.has(i) && coast[i]!.includes(bB));
    joined.add(ya);
    const aq = grid.q[bA]!;
    const ar = grid.r[bA]!;
    const bq = grid.q[bB]!;
    const br = grid.r[bB]!;
    const n = Math.max(1, best);
    const added: number[] = [];
    const add = (c: number): void => {
      if (c < 0 || isLand[c]) return;
      isLand[c] = 1;
      bridge[c] = 1;
      added.push(c);
      region[c] = cellDistance(grid, c, bA) <= cellDistance(grid, c, bB) ? region[bA]! : region[bB]!;
    };
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const fq = aq + (bq - aq) * t;
      const fr = ar + (br - ar) * t;
      const fs = -fq - fr;
      let rq = Math.round(fq);
      let rr = Math.round(fr);
      const rs = Math.round(fs);
      const dq = Math.abs(rq - fq);
      const dr = Math.abs(rr - fr);
      const ds = Math.abs(rs - fs);
      if (dq > dr && dq > ds) rq = -rr - rs;
      else if (dr > ds) rr = -rq - rs;
      const c = grid.idxOf(rq, rr);
      if (c < 0) continue;
      const wasLand = isLand[c] === 1;
      add(c);
      if (!wasLand || bridge[c]) for (let k = 0; k < 6; k++) {
        const nbk = grid.nb[c * 6 + k]!;
        if (nbk >= 0) add(nbk);
      }
    }
    w.bridgeLinks.push({ a: region[bA]!, b: region[bB]!, cells: added });
  }
}

/** Compute the per-region tables from isLand/region (called after the final land mask). */
export function finalizeRegions(w: World): void {
  const { N, grid, NRg, isLand, region } = w;
  const { x: cx, z: cz, nb } = grid;
  const rCells: number[][] = Array.from({ length: NRg }, () => []);
  for (let c = 0; c < N; c++) if (isLand[c]) rCells[region[c]!]!.push(c);
  const landR = new Uint8Array(NRg);
  for (let r = 0; r < NRg; r++) landR[r] = rCells[r]!.length > 0 ? 1 : 0;
  const radj: Set<number>[] = Array.from({ length: NRg }, () => new Set<number>());
  const isCoastR = new Uint8Array(NRg);
  for (let c = 0; c < N; c++) {
    if (!isLand[c]) continue;
    for (let k = 0; k < 6; k++) {
      const b = nb[c * 6 + k]!;
      if (b < 0 || !isLand[b]) isCoastR[region[c]!] = 1;
      else if (region[b] !== region[c]) radj[region[c]!]!.add(region[b]!);
    }
  }
  const rcx = new Float64Array(NRg);
  const rcz = new Float64Array(NRg);
  const rCenterCell = new Int32Array(NRg).fill(-1);
  const landList: number[] = [];
  for (let r = 0; r < NRg; r++) {
    if (!landR[r]) continue;
    landList.push(r);
    let sx = 0;
    let sz = 0;
    for (const c of rCells[r]!) { sx += cx[c]!; sz += cz[c]!; }
    rcx[r] = sx / rCells[r]!.length;
    rcz[r] = sz / rCells[r]!.length;
    let bd = 1e18;
    for (const c of rCells[r]!) {
      const dx = cx[c]! - rcx[r]!;
      const dz = cz[c]! - rcz[r]!;
      const d = dx * dx + dz * dz;
      if (d < bd) { bd = d; rCenterCell[r] = c; }
    }
  }
  w.rCells = rCells;
  w.landR = landR;
  w.radj = radj;
  w.isCoastR = isCoastR;
  w.rcx = rcx;
  w.rcz = rcz;
  w.rCenterCell = rCenterCell;
  w.landList = landList;
}
