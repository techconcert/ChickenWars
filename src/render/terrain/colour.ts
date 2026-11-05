// Vertex colouring for the world terrain (port of prototype buildTerrain, with ramp readability fixes T1).
import { blurArr } from '../../gen/terrain/sdf';
import { makeNoise, type Noise } from '../../gen/noise';
import type { HeightField } from '../../gen/terrain/fieldTypes';
import { SEA, STEP, NO_REGION } from '../../gen/terrain/types';
import { PAL, hexRGB, mixRGB, mulRGB, type RGB } from '../meshes/builder';
import { clamp, smooth } from '../view/util';

const SAND = hexRGB(PAL.sand);
const TEAL = hexRGB(0x5f9fa8);
const DIRT = hexRGB(PAL.dirt);
const RAMP_DIRT = hexRGB(0xa9784a);
const LAKE_FLOOR = hexRGB(0xb8a67a);
const ROCK = PAL.boulder.map(hexRGB) as [RGB, RGB, RGB];
const SNOW = hexRGB(PAL.snow[1]!);
const MEADOW = PAL.meadow.map(hexRGB) as [RGB, RGB, RGB];

/** Base colour per biome id (0 beach, 1 meadow, 2 forest, 3 highland, 4 snow). */
function biomeBase(b: number): RGB {
  switch (b) {
    case 1: return MEADOW[1];
    case 2: return mixRGB(MEADOW[0], hexRGB(0x3f7a46), 0.45);
    case 3: return mixRGB(mixRGB(MEADOW[1], ROCK[0], 0.45), MEADOW[0], 0.2);
    case 4: return hexRGB(PAL.snow[0]!);
    default: return SAND;
  }
}

export interface TerrainColourer {
  /** Write the shaded vertex colour for sample (i,j) with surface normal y component `ny` into `out`. */
  shade(i: number, j: number, ny: number, out: Float32Array, o: number): void;
  /** Set which regions are locked (darker). Pass a predicate on region id. */
  setLocked(isLocked: (region: number) => boolean): void;
  lockSig(): string;
  /** Debug paint modes (?debug=terrain): colour by region, highlight ramps. Callers must invalidate chunk colours after. */
  setDebug(d: { region: boolean; ramps: boolean }): void;
}

function hsl(h: number, s: number, l: number): RGB {
  const f = (n: number): number => {
    const k = (n + h * 12) % 12;
    return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
  };
  return [f(0), f(8), f(4)];
}

export function createTerrainColourer(F: HeightField, regionOfCell: ArrayLike<number>): TerrainColourer {
  const { GW, GH, n } = F;
  const noise: Noise = makeNoise(F.seed ^ 0x51ed27);
  const cr = new Float32Array(n);
  const cg = new Float32Array(n);
  const cb = new Float32Array(n);
  const base: RGB[] = [0, 1, 2, 3, 4, 5, 6].map(biomeBase);
  for (let k = 0; k < n; k++) {
    const c = base[F.bioG[k]!] ?? SAND;
    cr[k] = c[0];
    cg[k] = c[1];
    cb[k] = c[2];
  }
  // soft biome blending across region borders
  blurArr(cr, GW, GH, 2, 4);
  blurArr(cg, GW, GH, 2, 4);
  blurArr(cb, GW, GH, 2, 4);
  let locked: (r: number) => boolean = () => false;
  const dbg = { region: false, ramps: false };
  const regionCol = (r: number): RGB => hsl(((r * 0.6180339) % 1 + 1) % 1, 0.55, 0.58);
  const sig = '';
  const lockCache = new Map<number, boolean>();
  const c: RGB = [0, 0, 0];

  return {
    setLocked(fn) {
      locked = fn;
      lockCache.clear();
    },
    lockSig: () => sig,
    setDebug(d) {
      dbg.region = d.region;
      dbg.ramps = d.ramps;
    },
    shade(i, j, ny, out, o) {
      const k = j * GW + i;
      const x = F.x0 + i * F.h;
      const z = F.z0 + j * F.h;
      const y = F.H[k]!;
      let col: RGB = [cr[k]!, cg[k]!, cb[k]!];
      const pa = noise.n2(x * 0.06 + 13, z * 0.06);
      const pb = noise.n2(x * 0.19, z * 0.19 + 4);
      const tone = 1 + 0.07 * pa + 0.035 * pb;
      col = [col[0] * tone * (1 + 0.03 * pa), col[1] * tone, col[2] * tone * (1 - 0.04 * pa)];
      const bio = F.bioG[k]!;
      if (bio === 4) col = mixRGB(col, SNOW, 0.5 + 0.5 * pb);
      else if (F.maxLv >= 3 && F.Lg[k]! >= F.maxLv && ny > 0.85) col = mixRGB(col, SNOW, 0.28);
      // coast: narrow noisy sand rim, sea floor tint
      const s0 = F.sdfs[0]![k]!;
      const beachW = 1.3 + 0.9 * F.bnG[k]!;
      const sandA = 1 - smooth(beachW - 0.5, beachW + 0.4, s0);
      const under = smooth(SEA + 0.1, -1.9, y);
      if (sandA > 0) col = mixRGB(col, mixRGB(SAND, TEAL, under * 0.85), sandA);
      if (bio === 0 && F.Lg[k]! < 0) col = mixRGB(SAND, TEAL, under * 0.85);
      // lake shore
      const ln = F.lakeNear[k]!;
      if (ln > 0.3 && y < F.wl[k]! + 0.4) col = mixRGB(col, mixRGB(LAKE_FLOOR, SAND, 0.5), smooth(0.3, 0.8, ln));
      // dirt: paths stay soft; ramps get a deeper, redder dirt with tread stripes and dark rocky side banks so they read from far away
      const rm = F.rampM[k]!;
      const pm = F.pathM[k]! * 0.9;
      if (pm > 0.2) col = mixRGB(col, mulRGB(DIRT, 0.97 + 0.1 * pb), smooth(0.25, 0.65, pm) * 0.9);
      if (rm > 0.25) {
        const tread = 0.5 + 0.5 * Math.sin(y * 17);
        const rc = mulRGB(RAMP_DIRT, 0.9 + 0.12 * pb - 0.1 * tread);
        col = mixRGB(col, rc, smooth(0.2, 0.55, rm) * 0.95);
      }
      const side = F.rampSideM[k]!;
      if (side > 0.05) col = mixRGB(col, mulRGB(mixRGB(col, ROCK[0], 0.4), 0.55), clamp(side * 1.5, 0, 0.92));
      // slope -> cliff rock with strata
      let rk = 1 - smooth(0.58, 0.74, ny);
      rk *= 1 - smooth(0.3, 0.7, rm);
      rk *= s0 > -0.5 ? 1 : 0.4;
      if (rk > 0) {
        const st = 0.5 + 0.5 * Math.sin(y * 5.5 + pb * 2.5);
        const fr = (((y / STEP) % 1) + 1) % 1;
        let rc = mixRGB(ROCK[0], ROCK[2], clamp(st * 0.7 + 0.15 * pa + 0.15, 0, 1));
        rc = mulRGB(rc, 0.78 + 0.22 * smooth(0, 0.35, fr));
        col = mixRGB(col, rc, rk);
      }
      // locked regions: slightly darker, muted
      const reg = regionOfCell[F.cellG[k]!] ?? NO_REGION;
      if (reg >= 0 && reg !== NO_REGION) {
        let l = lockCache.get(reg);
        if (l === undefined) {
          l = locked(reg);
          lockCache.set(reg, l);
        }
        if (l) {
          const g = col[0] * 0.3 + col[1] * 0.59 + col[2] * 0.11;
          const keep = clamp(rm * 1.4, 0, 0.75); // ramps stay readable inside locked regions
          const lk = mulRGB(mixRGB(col, [g, g, g], 0.24), 0.88);
          col = mixRGB(lk, col, keep);
        }
      }
      if (dbg.region && reg >= 0 && reg !== NO_REGION) col = mixRGB(col, regionCol(reg), 0.8);
      if (dbg.ramps && rm > 0.15) col = mixRGB(col, [1, 0.2, 0.85], smooth(0.15, 0.5, rm) * 0.85);
      c[0] = col[0];
      c[1] = col[1];
      c[2] = col[2];
      out[o] = c[0];
      out[o + 1] = c[1];
      out[o + 2] = c[2];
    },
  };
}
