import type { Noise } from '../noise';
import type { FieldRamp } from './fieldTypes';
import { clamp, lerp, smoothstep } from './sdf';
import { STEP } from './types';
import type { TerrainLogic } from './types';

export const RAMP_W0 = 2.6;
export const RAMP_R = 2.3;
export const SLOPE_LIMIT = 0.6;
const WIDEN_CAP = 5.5;
const LENGTHEN_CAP = 9;

export interface Box {
  i0: number;
  i1: number;
  j0: number;
  j1: number;
}

/** Shared sampling context between field.ts and the ramp passes. */
export interface RampCtx {
  x0: number;
  z0: number;
  h: number;
  GW: number;
  GH: number;
  noise: Noise;
  Lg: Int8Array;
  sdfs: Float32Array[];
  rampM: Float32Array;
  rampSideM: Float32Array;
  /** forced-linear override weight / target height per sample (last-resort slope guarantee) */
  ovW: Float32Array;
  ovY: Float32Array;
  wG: Float32Array;
  cliffW: number;
  /** recompute heights; with boxes only inside them (sample index ranges), else everywhere */
  computeH(boxes?: Box[]): void;
  hAt(x: number, z: number): number;
  bil(arr: Float32Array, x: number, z: number): number;
  nearestL(x: number, z: number): number;
  /** per-sample cache of the ramp-edge noise n2(x*0.5+3, z*0.5) (float64, so cached values are exactly the computed ones) */
  edgeNoise: Float64Array;
  edgeNoiseSet: Uint8Array;
}

/** The ramp-edge noise at sample k = (i, j) with x = x0 + i*h, z = z0 + j*h; computed once per sample across all passes. */
function edgeNoiseAt(ctx: RampCtx, k: number, x: number, z: number): number {
  if (ctx.edgeNoiseSet[k]) return ctx.edgeNoise[k]!;
  const v = ctx.noise.n2(x * 0.5 + 3, z * 0.5);
  ctx.edgeNoise[k] = v;
  ctx.edgeNoiseSet[k] = 1;
  return v;
}

interface Cand {
  px: number;
  pz: number;
  ax: number;
  az: number;
  score: number;
  valid: boolean;
}

const halfOf = (rp: FieldRamp): number => Math.max(3.6, rp.w * 1.35);

function mkCand(l: TerrainLogic, a: number, b: number): Cand {
  const g = l.grid;
  const dx = g.x[a]! - g.x[b]!;
  const dz = g.z[a]! - g.z[b]!;
  const len = Math.sqrt(dx * dx + dz * dz);
  return { px: (g.x[a]! + g.x[b]!) / 2, pz: (g.z[a]! + g.z[b]!) / 2, ax: dx / len, az: dz / len, score: -9, valid: false };
}

/** Rank candidate border edges: the warped field must show a clean +1 step across the axis; deepest SDF margin wins. */
function rankCands(ctx: RampCtx, l: TerrainLogic, rampIdx: number): Cand[] {
  const rp = l.ramps[rampIdx]!;
  const out: Cand[] = [];
  for (let i = 0; i + 2 < rp.cands.length; i += 3) {
    const c = mkCand(l, rp.cands[i]!, rp.cands[i + 2]!);
    const up = ctx.nearestL(c.px + c.ax * 3.2, c.pz + c.az * 3.2);
    const dn = ctx.nearestL(c.px - c.ax * 3.2, c.pz - c.az * 3.2);
    const up2 = ctx.nearestL(c.px + c.ax * 2, c.pz + c.az * 2);
    const dn2 = ctx.nearestL(c.px - c.ax * 2, c.pz - c.az * 2);
    if (up - dn === 1 && up2 === up && dn2 === dn && up >= 1) {
      const sd = ctx.sdfs[up]!;
      c.score = Math.min(ctx.bil(sd, c.px + c.ax * 3.2, c.pz + c.az * 3.2), -ctx.bil(sd, c.px - c.ax * 3.2, c.pz - c.az * 3.2));
      c.valid = true;
    }
    out.push(c);
  }
  const valid = out.filter((c) => c.valid).sort((a, b) => b.score - a.score);
  return [...valid, ...out.filter((c) => !c.valid)];
}

/** Capsule extents: extend onto thin upper plateaus until a sample of the upper level is reached by >= 1.5 units. */
function reach(ctx: RampCtx, rp: FieldRamp): void {
  const half = halfOf(rp);
  rp.halfLo = half;
  rp.halfHi = half;
  rp.thin = false;
  const scan = (sx: number, sz: number, ok: (lv: number, x: number, z: number) => boolean): number => {
    for (let t = 0; t <= 16; t += 0.25) {
      const xa = rp.px + sx * t;
      const za = rp.pz + sz * t;
      const xb = rp.px + sx * (t + 1.5);
      const zb = rp.pz + sz * (t + 1.5);
      if (ok(ctx.nearestL(xa, za), xa, za) && ok(ctx.nearestL(xb, zb), xb, zb)) return t;
    }
    return -1;
  };
  const need = 0.8 * rp.w;
  const sdUp = ctx.sdfs[rp.upL];
  const tu = scan(rp.ax, rp.az, (lv, x, z) => lv >= rp.upL && (!sdUp || ctx.bil(sdUp, x, z) >= need));
  if (tu < 0) rp.thin = true;
  else rp.halfHi = Math.max(half, tu + 1.5);
  const td = scan(-rp.ax, -rp.az, (lv) => lv <= rp.dnL);
  if (td >= 0) rp.halfLo = Math.max(half, td + 1.5);
}

export function initRamps(ctx: RampCtx, l: TerrainLogic): { ramps: FieldRamp[]; cands: Cand[][] } {
  const ramps: FieldRamp[] = [];
  const cands: Cand[][] = [];
  for (let i = 0; i < l.ramps.length; i++) {
    const cs = rankCands(ctx, l, i);
    cands.push(cs);
    const c = cs[0]!;
    const rp: FieldRamp = {
      id: l.ramps[i]!.id, px: c.px, pz: c.pz, ax: c.ax, az: c.az, w: RAMP_W0, R: RAMP_R, halfLo: 3.6, halfHi: 3.6, upL: 0, dnL: 0,
      maxSlope: 0, rise: 0, ok: false, y: 0, candIdx: 0, thin: false, rerouted: false, lengthened: false, widened: false,
    };
    applyCand(ctx, rp, c);
    ramps.push(rp);
  }
  return { ramps, cands };
}

function applyCand(ctx: RampCtx, rp: FieldRamp, c: Cand): void {
  rp.px = c.px;
  rp.pz = c.pz;
  rp.ax = c.ax;
  rp.az = c.az;
  rp.upL = ctx.nearestL(c.px + c.ax * 3.2, c.pz + c.az * 3.2);
  rp.dnL = ctx.nearestL(c.px - c.ax * 3.2, c.pz - c.az * 3.2);
  reach(ctx, rp);
}

export function rampBox(ctx: RampCtx, rp: FieldRamp): Box {
  const ext = Math.max(rp.halfLo, rp.halfHi) + rp.R + 1;
  return {
    i0: Math.max(0, Math.floor((rp.px - ext - ctx.x0) / ctx.h)),
    i1: Math.min(ctx.GW - 1, Math.ceil((rp.px + ext - ctx.x0) / ctx.h)),
    j0: Math.max(0, Math.floor((rp.pz - ext - ctx.z0) / ctx.h)),
    j1: Math.min(ctx.GH - 1, Math.ceil((rp.pz + ext - ctx.z0) / ctx.h)),
  };
}

export function fillRamps(ctx: RampCtx, ramps: FieldRamp[]): void {
  const { x0, z0, h, GW } = ctx;
  ctx.rampM.fill(0);
  ctx.rampSideM.fill(0);
  ctx.wG.fill(ctx.cliffW);
  for (const rp of ramps) {
    const { i0, i1, j0, j1 } = rampBox(ctx, rp);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const x = x0 + i * h;
        const z = z0 + j * h;
        const tRaw = (x - rp.px) * rp.ax + (z - rp.pz) * rp.az;
        const t = clamp(tRaw, -rp.halfLo, rp.halfHi);
        const ex = x - (rp.px + rp.ax * t);
        const ez = z - (rp.pz + rp.az * t);
        const k = j * GW + i;
        const d = Math.sqrt(ex * ex + ez * ez) + 0.35 * edgeNoiseAt(ctx, k, x, z);
        const m = 1 - smoothstep(rp.R * 0.45, rp.R, d);
        if (m > ctx.rampM[k]!) {
          ctx.rampM[k] = m;
          ctx.wG[k] = lerp(ctx.cliffW, rp.w, m);
        }
        if (m > 0.02 && m < 0.98) {
          const endFade = 1 - Math.max(smoothstep(rp.halfHi - 2, rp.halfHi, tRaw), smoothstep(rp.halfLo - 2, rp.halfLo, -tRaw));
          const side = 4 * m * (1 - m) * endFade;
          if (side > ctx.rampSideM[k]!) ctx.rampSideM[k] = side;
        }
      }
    }
  }
}

function measure(ctx: RampCtx, ramps: FieldRamp[]): void {
  for (const rp of ramps) {
    let ms = 0;
    let prev: number | null = null;
    for (let t = -rp.halfLo; t <= rp.halfHi + 1e-6; t += 0.25) {
      const y = ctx.hAt(rp.px + rp.ax * t, rp.pz + rp.az * t);
      if (prev !== null) ms = Math.max(ms, Math.abs(y - prev) / 0.25);
      prev = y;
    }
    rp.maxSlope = ms;
    rp.rise = ctx.hAt(rp.px + rp.ax * rp.halfHi, rp.pz + rp.az * rp.halfHi) - ctx.hAt(rp.px - rp.ax * rp.halfLo, rp.pz - rp.az * rp.halfLo);
    rp.ok = ms < SLOPE_LIMIT;
    rp.y = ctx.hAt(rp.px, rp.pz);
  }
}

interface PassState {
  prev: Box[];
}
function pass(ctx: RampCtx, ramps: FieldRamp[], st: PassState): void {
  const cur = ramps.map((rp) => rampBox(ctx, rp));
  fillRamps(ctx, ramps);
  ctx.computeH([...st.prev, ...cur]);
  st.prev = cur;
  measure(ctx, ramps);
}

/** Last resort: blend a smooth linear climb along the centreline so the ramp can never exceed the slope limit. */
function forceLinear(ctx: RampCtx, rp: FieldRamp): void {
  const { x0, z0, h, GW } = ctx;
  const yLo = rp.dnL * STEP;
  const yHi = rp.upL * STEP;
  const len = rp.halfLo + rp.halfHi;
  const { i0, i1, j0, j1 } = rampBox(ctx, rp);
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const x = x0 + i * h;
      const z = z0 + j * h;
      const tRaw = (x - rp.px) * rp.ax + (z - rp.pz) * rp.az;
      const t = clamp(tRaw, -rp.halfLo, rp.halfHi);
      const ex = x - (rp.px + rp.ax * t);
      const ez = z - (rp.pz + rp.az * t);
      const k = j * GW + i;
      const d = Math.sqrt(ex * ex + ez * ez) + 0.35 * edgeNoiseAt(ctx, k, x, z);
      const m = 1 - smoothstep(rp.R * 0.45, rp.R, d);
      const wgt = smoothstep(0.1, 0.6, m);
      if (wgt <= 0) continue;
      const s = (t + rp.halfLo) / len;
      if (wgt >= ctx.ovW[k]!) {
        ctx.ovW[k] = wgt;
        ctx.ovY[k] = lerp(yLo, yHi, s * s * (3 - 2 * s));
      }
    }
  }
}

/** Widen over-steep ramps (max `passes`), re-route to other border edges, then lengthen. Leaves the field consistent. */
export function fixRamps(ctx: RampCtx, ramps: FieldRamp[], cands: Cand[][]): void {
  const st: PassState = { prev: [] };
  const widen = (passes: number, cap: number, factor: number, lengthen: boolean): void => {
    for (let it = 0; it < passes; it++) {
      pass(ctx, ramps, st);
      let changed = false;
      for (const rp of ramps) {
        if (rp.maxSlope >= SLOPE_LIMIT && rp.w < cap) {
          rp.w = Math.min(cap, rp.w * factor);
          rp.widened = true;
          if (lengthen) rp.lengthened = true;
          reach(ctx, rp);
          changed = true;
        }
      }
      if (!changed) return;
    }
  };
  widen(5, WIDEN_CAP, 1.2, false);
  pass(ctx, ramps, st);
  // re-route stubborn ramps to other candidate border edges; keep the best attempt
  const best = ramps.map((rp) => ({ idx: rp.candIdx, w: rp.w, ms: rp.maxSlope }));
  for (let round = 0; round < 4; round++) {
    const bad = ramps.filter((rp) => rp.maxSlope >= SLOPE_LIMIT);
    if (!bad.length) break;
    let moved = false;
    for (const rp of bad) {
      const i = ramps.indexOf(rp);
      const cs = cands[i]!;
      if (cs.length < 2) continue;
      rp.candIdx = (rp.candIdx + 1) % Math.min(cs.length, 6);
      rp.w = RAMP_W0;
      rp.rerouted = true;
      applyCand(ctx, rp, cs[rp.candIdx]!);
      moved = true;
    }
    if (!moved) break;
    widen(4, WIDEN_CAP, 1.2, false);
    pass(ctx, ramps, st);
    ramps.forEach((rp, i) => {
      const b = best[i]!;
      if (rp.maxSlope < b.ms) { b.idx = rp.candIdx; b.w = rp.w; b.ms = rp.maxSlope; }
    });
  }
  ramps.forEach((rp, i) => {
    const b = best[i]!;
    if (rp.candIdx !== b.idx || rp.w !== b.w) {
      rp.candIdx = b.idx;
      rp.w = b.w;
      applyCand(ctx, rp, cands[i]![b.idx]!);
    }
  });
  pass(ctx, ramps, st);
  widen(8, LENGTHEN_CAP, 1.25, true);
  pass(ctx, ramps, st);
  const stuck = ramps.filter((rp) => rp.maxSlope >= SLOPE_LIMIT);
  if (stuck.length) {
    for (const rp of stuck) { forceLinear(ctx, rp); rp.lengthened = true; }
    pass(ctx, ramps, st);
  }
}
