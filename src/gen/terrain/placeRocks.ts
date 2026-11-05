import { makeNoise, mulberry32 } from '../noise';
import { chainPoint, extractContours } from './contours';
import type { HeightField } from './fieldTypes';
import type { RockPlacement } from './placeTypes';
import { biomeAt, bil, distanceToCliff, heightAt, lakeNearAt, pathAt, rampAt, rampSideAt, sdf0At, slopeAt } from './queries';
import { clamp, lerp } from './sdf';

type Q = [number, number, number, number];
function qmul(a: Q, b: Q): Q {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}
function qaxis(ax: number, ay: number, az: number, ang: number): Q {
  const s = Math.sin(ang / 2);
  return [ax * s, ay * s, az * s, Math.cos(ang / 2)];
}

/**
 * Rocks: rows along cliff contours (sized by drop, leaning back), loose boulders, boulders on highland/snow,
 * and a few lining rocks along ramp side banks for readability (T1). Ramps and lake shores stay clean.
 */
export function placeRocks(F: HeightField, variants: number): { rocks: RockPlacement[]; contourLength: number } {
  const r = mulberry32(F.seed * 7919 + 13);
  const noise = makeNoise(F.seed);
  const rocks: RockPlacement[] = [];
  const grid = new Map<number, RockPlacement[]>();
  const add = (x: number, y: number, z: number, sx: number, sy: number, sz: number, nx: number, nz: number, lean: number, tint: number, kind: RockPlacement['kind']): boolean => {
    const gx = Math.floor(x / 1.2);
    const gz = Math.floor(z / 1.2);
    for (let a = -1; a <= 1; a++) {
      for (let b = -1; b <= 1; b++) {
        const l = grid.get((gx + a) * 10007 + (gz + b));
        if (!l) continue;
        for (const o of l) {
          const dd = Math.hypot(x - o.x, z - o.z);
          const dy = (y - o.y) * 1.6;
          if (Math.hypot(dd, dy) < 0.27 * (sx + o.sx)) return false;
        }
      }
    }
    let q = qaxis(0, 1, 0, Math.atan2(nx, nz));
    q = qmul(q, qaxis(0, 1, 0, (r() - 0.5) * 0.6));
    q = qmul(q, qaxis(1, 0, 0, -lean + (r() - 0.5) * 0.25));
    q = qmul(q, qaxis(0, 0, 1, (r() - 0.5) * 0.3));
    const rec: RockPlacement = { x, y, z, sx, sy, sz, qx: q[0], qy: q[1], qz: q[2], qw: q[3], variant: Math.floor(r() * variants), tint, kind };
    rocks.push(rec);
    const k = gx * 10007 + gz;
    const l = grid.get(k);
    if (l) l.push(rec);
    else grid.set(k, [rec]);
    return true;
  };
  const tintOf = (): number => 0.9 + 0.2 * r();
  const column = (px: number, pz: number, nx: number, nz: number, top: number, bot: number, rows: number, sizeMul: number, widthMul: number, corner: boolean): void => {
    const drop = Math.max(0.1, top - bot);
    for (let i = 0; i < rows; i++) {
      const f = (i + 0.5) / rows;
      const rowH = drop / rows;
      const w = lerp(1.05, 0.72, f) * sizeMul * widthMul * (0.85 + 0.3 * r());
      const sy = Math.max(0.3 * sizeMul, rowH * 1.45) * (0.85 + 0.3 * r());
      const sz = w * (0.62 + 0.18 * r());
      let yc = bot + f * drop;
      if (i === 0) yc = bot + sy * 0.28;
      if (i === rows - 1) yc = Math.max(yc, top - sy * 0.3);
      const off = lerp(0.22, -0.2, f) * sizeMul + (r() - 0.5) * 0.1 + (corner ? 0.1 : 0);
      add(px + nx * off, yc, pz + nz * off, w, sy, sz, nx, nz, lerp(0.05, 0.28, f), tintOf(), 'cliff');
    }
  };
  const normalAt = (x: number, z: number, k: number): [number, number] => {
    const s = F.sdfs[k]!;
    const e = F.h;
    const gx = bil(F, s, x + e, z) - bil(F, s, x - e, z);
    const gz = bil(F, s, x, z + e) - bil(F, s, x, z - e);
    const l = Math.hypot(gx, gz) || 1;
    return [-gx / l, -gz / l];
  };
  let contourLen = 0;
  for (let k = 1; k <= F.maxLv; k++) {
    for (const ch of extractContours(F.sdfs[k]!, F)) {
      contourLen += ch.len;
      let s = r() * 0.4;
      while (s < ch.len) {
        const [px, pz] = chainPoint(ch, s);
        const rm = rampAt(F, px, pz);
        if (rm > 0.3 || (rm > 0.1 && r() < (rm - 0.1) / 0.2) || lakeNearAt(F, px, pz) > 0.15) { s += 0.6; continue; }
        if (k >= 2 && Math.abs(bil(F, F.sdfs[k - 1]!, px, pz)) < 0.7) { s += 0.6; continue; }
        if (noise.n2(px * 0.11 + 5, pz * 0.11) > 0.36) { s += 0.7; continue; }
        const [nx, nz] = normalAt(px, pz, k);
        const top = heightAt(F, px - nx * 0.7, pz - nz * 0.7);
        const bot = heightAt(F, px + nx * 0.7, pz + nz * 0.7);
        const drop = top - bot;
        if (drop < 0.6) { s += 0.6; continue; }
        const e = 0.5;
        const a1 = normalAt(px + e, pz, k);
        const b1 = normalAt(px - e, pz, k);
        const c1 = normalAt(px, pz + e, k);
        const d1 = normalAt(px, pz - e, k);
        const div = (a1[0] - b1[0] + (c1[1] - d1[1])) / (2 * e);
        let sizeMul = clamp(0.85 + 0.1 * drop, 0.9, 1.7);
        let corner = false;
        if (div > 0.45) { sizeMul *= 1.18; corner = true; } else if (div < -0.45 && r() < 0.5) { s += 0.5; continue; }
        const rows = clamp(Math.ceil(drop / 0.9), 1, 8);
        const wmul = 0.9 + 0.2 * r();
        column(px, pz, nx, nz, top, bot, rows, sizeMul, wmul, corner);
        if (r() < 0.12) {
          const d = 0.9 + 0.6 * r();
          const bx = px + nx * d;
          const bz = pz + nz * d;
          const gy = heightAt(F, bx, bz);
          if (Math.abs(gy - bot) < 0.35 && slopeAt(F, bx, bz) < 0.4) {
            const sc = 0.35 + 0.4 * r();
            add(bx, gy + sc * 0.12, bz, sc * 1.15, sc * 0.8, sc, nx, nz, 0.05, tintOf(), 'boulder');
          }
        }
        s += 0.9 * sizeMul * wmul * (0.55 + 0.25 * r());
      }
    }
  }
  // boulders on highland / snow tops, a few elsewhere
  const rr = mulberry32(F.seed * 55 + 1);
  for (let z = F.z0; z < F.z0 + F.GH * F.h; z += 1.3) {
    for (let x = F.x0; x < F.x0 + F.GW * F.h; x += 1.3) {
      const px = x + rr() * 1.3;
      const pz = z + rr() * 1.3;
      const b = biomeAt(F, px, pz);
      const p = b === 3 ? 0.3 : b === 4 ? 0.18 : b === 1 || b === 2 ? 0.025 : 0;
      if (p === 0 || rr() > p) continue;
      if (distanceToCliff(F, px, pz) < 0.9 || rampAt(F, px, pz) > 0.1 || pathAt(F, px, pz) > 0.2 || slopeAt(F, px, pz) > 0.35 || lakeNearAt(F, px, pz) > 0.05 || sdf0At(F, px, pz) < 2) continue;
      if (rampSideAt(F, px, pz) > 0.05) continue;
      const sc = 0.4 + 0.45 * rr();
      const ang = rr() * 6.283;
      add(px, heightAt(F, px, pz) + sc * 0.1, pz, sc * 1.2, sc * 0.85, sc, Math.cos(ang), Math.sin(ang), 0.05, 0.9 + 0.2 * rr(), 'boulder');
    }
  }
  // T1: a few lining rocks along each ramp's side banks so ramps read from the default zoom
  for (const rp of F.ramps) {
    let placed = 0;
    for (let t = -rp.halfLo + 0.8; t <= rp.halfHi - 0.8 && placed < 16; t += 1.1) {
      for (const side of [-1, 1]) {
        if (placed >= 16 || r() > 0.8) continue;
        const nx = -rp.az * side;
        const nz = rp.ax * side;
        const lat = rp.R * 0.74 + 0.25 + 0.3 * r();
        const px = rp.px + rp.ax * t + nx * lat;
        const pz = rp.pz + rp.az * t + nz * lat;
        if (rampAt(F, px, pz) > 0.55 || lakeNearAt(F, px, pz) > 0.1 || sdf0At(F, px, pz) < 0.5) continue;
        const sc = 0.42 + 0.3 * r();
        if (add(px, heightAt(F, px, pz) + sc * 0.12, pz, sc * 1.2, sc * 0.85, sc, nx, nz, 0.05, tintOf(), 'ramp')) placed++;
      }
    }
  }
  return { rocks, contourLength: contourLen };
}
