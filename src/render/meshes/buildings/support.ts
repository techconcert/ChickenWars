// Support buildings: Owl Academy, Worm Tavern, Lookout Perch, Picket Fence (docs/10-building-art-brief.md 3.15 to 3.18).
// The Nursing Nest (infirmary) lives in supportExtra.ts.
import * as THREE from 'three';
import { PAL, type GeoBuilder } from '../builder';
import {
  FARM, archDoor, banner, chimney, domeRoof, door, egg, face, flag, miniChicken, roundBox, roundWindow, smokePuff, softGable, taperBox,
  LOW_FENCE, picketFence, warmWindows, weathervaneRooster, windows, type Gen,
} from './parts';
import { doorY, keg, ladder, plinth, post, slab } from './militaryExtra';

const J = { jitter: 0 };

export const academy: Gen = (b, c) => {
  const s = c.stage;
  const pl = s >= 3 ? 0.1 : 0;
  if (s >= 3) plinth(b, 0, -0.1, 0.96, 0.76);
  const wl = [0.36, 0.44, 0.44, 0.44, 0.44][s]!;
  const gh = s === 0 ? 0.24 : 0.32;
  if (s === 0) taperBox(b, 0, 0, -0.1, 0.8, wl, 0.6, PAL.timberLight, 0.94);
  else roundBox(b, 0, pl, -0.1, 0.8, wl, 0.6, PAL.cream, 0.045);
  const rt = softGable(b, 0, pl + wl, -0.1, 0.62, 0.86, gh, s === 0 ? PAL.thatch : c.roof, {
    rotY: Math.PI / 2, infill: s === 0 ? PAL.timberLight : PAL.cream, ridge: s >= 4 ? PAL.gold : undefined,
  });
  // bell frame on the ridge
  for (const sx of [-1, 1]) post(b, sx * 0.075, rt - 0.03, 0.12, 0.18, 0.032, PAL.timberLight, 5);
  b.hip(0, rt + 0.15, 0.12, 0.22, 0.16, 0.09, s === 0 ? PAL.thatch : c.roof, { jitter: 0.02 });
  b.sphere(0, rt + 0.1, 0.12, 0.06, PAL.gold, { jitter: 0, emit: 0.2 }, 0);
  // front: door + windows
  if (s === 0) {
    door(b, 0, 0.2, 0.16, 0.26);
    windows(b, [-0.28, 0.28], 0.17, 0.2, 0.09, 0.12);
    // slate easel
    post(b, 0.44, 0, 0.42, 0.34, 0.025, PAL.timberDark, 5);
    post(b, 0.58, 0, 0.42, 0.34, 0.025, PAL.timberDark, 5);
    slab(b, 0.51, 0.16, 0.45, 0.24, 0.18, 0.03, PAL.slate, J);
    slab(b, 0.51, 0.2, 0.47, 0.12, 0.02, 0.01, PAL.white, J);
    return;
  }
  // porch with two columns
  archDoor(b, 0, 0.205, 0.2, 0.3, PAL.timberDark, pl);
  for (const sx of [-0.22, 0.22]) b.cyl(sx, pl, 0.4, 0.045, 0.05, 0.3, PAL.white, 8, { jitter: 0.02 });
  slab(b, 0, pl + 0.3, 0.32, 0.6, 0.05, 0.3, c.roof, J);
  windows(b, [-0.3, 0.3], pl + 0.22, 0.2, 0.09, 0.12);
  // book stack / open-book banner
  if (s === 1) {
    slab(b, 0.52, 0, 0.42, 0.16, 0.04, 0.12, FARM.fadedBlue, J);
    slab(b, 0.52, 0.04, 0.42, 0.15, 0.04, 0.11, FARM.barnRed, J);
    slab(b, 0.52, 0.08, 0.42, 0.13, 0.04, 0.1, FARM.sage, J);
  } else {
    post(b, 0.58, 0, 0.45, 0.8, 0.025, PAL.timberDark, 5);
    slab(b, 0.58, 0.42, 0.45, 0.24, 0.34, 0.03, c.roof, J);
    slab(b, 0.535, 0.58, 0.47, 0.1, 0.1, 0.02, PAL.cream, { rotY: 0, jitter: 0 });
    slab(b, 0.635, 0.58, 0.47, 0.1, 0.1, 0.02, PAL.cream, J);
  }
  if (s >= 2) {
    // the tower, which later becomes an owl
    const tx = -0.38, tz = -0.36;
    const th = [0, 0, 0.88, 0.95, 1.1][s]!;
    b.cyl(tx, pl, tz, 0.22, 0.25, th, PAL.stoneLight, 10, { smooth: true, jitter: 0.02 });
    b.cyl(tx, pl + th - 0.04, tz, 0.27, 0.27, 0.05, PAL.stoneDark, 8, J);
    slab(b, tx, pl + th * 0.5, tz + 0.215, 0.06, 0.14, 0.04, PAL.glass, { jitter: 0 });
    const dy = pl + th;
    if (s === 2) {
      const top = domeRoof(b, tx, dy, tz, 0.27, 0.24, c.roof);
      b.cyl(tx, top, tz, 0.015, 0.02, 0.07, PAL.timberDark, 5, J);
      b.sphere(tx, top + 0.09, tz, 0.045, PAL.gold, { jitter: 0, emit: 0.2 }, 0);
    } else {
      // dome becomes an owl head
      const top = domeRoof(b, tx, dy, tz, 0.3, 0.26, FARM.owl, 10, false);
      b.cyl(tx, dy, tz, 0.32, 0.32, 0.04, c.roof, 10, { jitter: 0.02 });
      face(b, tx, dy + 0.1, tz + 0.27, 1.3, 'owl');
      for (const sx of [-1, 1]) b.cone(tx + sx * 0.14, top - 0.04, tz, 0.045, 0.12, FARM.owl, 4, { rotZ: -sx * 0.2, jitter: 0 });
      if (s >= 4) {
        // graduation mortarboard
        slab(b, tx, top + 0.06, tz, 0.34, 0.03, 0.34, PAL.coal, J);
        b.cyl(tx, top, tz, 0.07, 0.09, 0.07, PAL.coal, 6, J);
        slab(b, tx + 0.16, top + 0.01, tz + 0.12, 0.025, 0.07, 0.025, PAL.gold, J);
        b.sphere(tx + 0.16, top, tz + 0.12, 0.025, PAL.gold, J, 0);
      }
    }
  }
  if (s >= 3) {
    picketFence(b, -0.55, 0.64, -0.16, 0.64, 0.12, PAL.white, { ...LOW_FENCE, gap: 0.22 });
    picketFence(b, 0.16, 0.64, 0.5, 0.64, 0.12, PAL.white, { ...LOW_FENCE, gap: 0.22 });
  }
  if (s >= 4) {
    miniChicken(b, 0.3, 0, 0.62, -0.3, 0.9);
    slab(b, 0.3, 0.05, 0.69, 0.08, 0.06, 0.03, FARM.fadedBlue, { jitter: 0, rotY: 0 });
    banner(b, 0.66, 0, -0.1, 1.0, c.banner);
  }
};

const TAVERN_PLUM = 0x8a4f6e;

/** Hanging worm pub sign: board with a curling pink worm, centred at x, hung from y1. k scales it. */
function wormSign(b: GeoBuilder, x: number, y1: number, z: number, k = 1.6): void {
  slab(b, x, y1 - 0.15 * k, z, 0.17 * k, 0.17 * k, 0.03, PAL.gold, J);
  slab(b, x, y1 - 0.15 * k - 0.012, z - 0.004, 0.185 * k, 0.012, 0.035, PAL.timberDark, J);
  const wy = y1 - 0.1 * k;
  [[-0.05, -0.04], [-0.02, -0.065], [0.02, -0.065], [0.05, -0.04], [0.045, -0.005]].forEach(([dx, dy], i) => {
    b.sphere(x + dx! * k, wy + dy! * k, z + 0.025, (0.028 - i * 0.001) * k, FARM.pink, { jitter: 0, scale: [1, 1, 0.7] }, 0);
  });
  b.box(x + 0.048 * k, wy, z + 0.05, 0.02 * k, 0.012 * k, 0.01, PAL.coal, J);
}

export const tavern: Gen = (b, c) => {
  const s = c.stage;
  const pl = s >= 3 ? 0.1 : 0;
  const roof = c.roof === PAL.roofOrange ? TAVERN_PLUM : c.roof; // plum roof so the pub differs from Pigsty and Egg Toss Range
  // little hut at stage 0: front gable, lit window, barrel sign
  if (s === 0) {
    taperBox(b, 0, 0, -0.1, 0.56, 0.36, 0.5, PAL.cream, 0.94);
    softGable(b, 0, 0.36, -0.1, 0.52, 0.64, 0.24, roof, { rotY: Math.PI / 2, infill: PAL.cream });
    door(b, -0.12, 0.15, 0.15, 0.24);
    warmWindows(b, [0.14], 0.14, 0.15, 0.1, 0.12);
    keg(b, -0.45, 0, 0.3, 1.5);
    keg(b, -0.5, 0, 0.08, 1.2);
    post(b, 0.46, 0, 0.3, 0.42, 0.03, PAL.timberDark, 5);
    wormSign(b, 0.46, 0.5, 0.32, 1.0);
    b.cyl(0.4, 0, 0.5, 0.1, 0.1, 0.03, PAL.timberLight, 8, { jitter: 0 });
    return;
  }
  if (s >= 3) plinth(b, 0, -0.1, 1.0, 0.74);
  const lw = 0.9, ld = 0.6;
  const lh = s >= 2 ? 0.4 : 0.42;
  taperBox(b, 0, pl, -0.1, lw, lh, ld, PAL.cream, 0.97);
  let roofY = pl + lh, rw = 0.78, rl = 0.96;
  const tb = (x: number, y0: number, w: number, h: number, z: number): void => slab(b, x, y0, z, w, h, 0.04, PAL.timberDark, J);
  for (const x of [-0.42, -0.14, 0.14, 0.42]) tb(x, pl, 0.045, lh, 0.205);
  tb(0, pl + 0.01, lw, 0.045, 0.205);
  let wallZ = 0.2; // the front wall surface the cross-gable grows out of
  if (s >= 2) {
    // jettied upper storey
    slab(b, 0, roofY, -0.07, 0.96, 0.05, 0.68, PAL.timberDark, J);
    const uh = s >= 4 ? 0.34 : 0.28;
    taperBox(b, 0, roofY + 0.05, -0.07, 0.96, uh, 0.66, PAL.cream, 0.97);
    for (const x of [-0.4, 0.4]) tb(x, roofY + 0.05, 0.045, uh, 0.265);
    roofY += 0.05 + uh;
    wallZ = 0.26;
    rw = 0.82; rl = 1.04;
    warmWindows(b, [-0.3, 0.3], roofY - uh + 0.08, 0.275, 0.09, 0.11);
  }
  softGable(b, 0, roofY, s >= 2 ? -0.07 : -0.1, rl, rw, s >= 4 ? 0.3 : s >= 2 ? 0.24 : 0.3, roof, { ridge: s >= 4 ? PAL.gold : undefined, infill: PAL.cream });
  // front cross-gable over a little bay window, standing proud of the main eave
  const dw = s >= 3 ? 0.48 : 0.42;
  const dh = s >= 3 ? 0.26 : 0.22;
  const F = wallZ + (s >= 2 ? 0.2 : 0.24); // front face of the gable
  const bayH = s >= 2 ? 0.26 : 0.3;
  taperBox(b, 0, roofY - bayH, (wallZ + F) / 2 - 0.02, dw - 0.04, bayH, F - wallZ + 0.04, PAL.cream, 0.97);
  slab(b, 0, roofY - bayH, F - 0.03, dw - 0.02, 0.04, 0.04, PAL.timberDark, J);
  warmWindows(b, [0], roofY - bayH + 0.07, F - 0.01, 0.12, 0.13);
  softGable(b, 0, roofY, (F - 0.12) / 2, F + 0.12, dw, dh, roof, { rotY: Math.PI / 2, infill: PAL.cream, over: 0.06 });
  b.box(0, roofY + dh * 0.12, F + 0.005, 0.07, 0.09, 0.02, FARM.warm, { emit: 0.85, jitter: 0 });
  // chimney, visible from stage 1
  chimney(b, 0.32, roofY + 0.02, -0.28, s >= 2 ? 0.34 : 0.3);
  smokePuff(b, 0.3, roofY + (s >= 2 ? 0.4 : 0.36), -0.28, s >= 2 ? 0.6 : 0.5);
  doorY(b, -0.12, 0.2, 0.17, 0.26, PAL.timberDark, pl);
  warmWindows(b, [0.2, -0.4], pl + 0.14, 0.205, 0.11, 0.12);
  // pub sign on the left: post, arm, a big gold board with a worm
  const sx = -0.6;
  post(b, sx - 0.1, 0, 0.36, 0.7, 0.03, PAL.timberDark, 5);
  slab(b, sx + 0.05, 0.66, 0.36, 0.3, 0.035, 0.035, PAL.timberDark, J);
  wormSign(b, sx + 0.1, 0.66, 0.36, 1.6);
  keg(b, -0.5, 0, 0.12);
  // table
  b.cyl(0.5, 0, 0.42, 0.025, 0.03, 0.16, PAL.timberDark, 5, J);
  b.cyl(0.5, 0.16, 0.42, 0.1, 0.1, 0.03, PAL.timberLight, 8, J);
  if (s >= 3) {
    picketFence(b, -0.3, 0.64, 0.3, 0.64, 0.14, PAL.white, { ...LOW_FENCE, gap: 0.3 });
    for (const [kx, kz] of [[0.3, 0.52], [0.7, 0.4]] as const) b.cyl(kx, 0, kz, 0.06, 0.07, 0.12, PAL.timber, 6, J);
    miniChicken(b, 0.5, 0.19, 0.42, 0.4, 0.8);
  }
  if (s >= 4) {
    // the apple annex on the right flank (it pokes out past the eave), its worm rearing up beside the roof
    const ax = 0.56, az = 0.02, ar = 0.23;
    b.sphere(ax, 0.36, az, ar, 0xc0463a, { scale: [1, 1.3, 1], smooth: true, jitter: 0.02 }, 1);
    b.cyl(ax, 0.36 + ar * 1.3 - 0.04, az, 0.022, 0.03, 0.12, PAL.timberDark, 5, J);
    b.sphere(ax + 0.07, 0.36 + ar * 1.3 + 0.07, az, 0.06, FARM.cornLeaf, { scale: [1, 0.25, 0.6], rotZ: 0.4, jitter: 0 }, 0);
    b.cyl(ax + 0.08, 0.1, az + ar - 0.03, 0.06, 0.06, 0.03, FARM.warm, 10, { rotX: Math.PI / 2, emit: 0.85, jitter: 0 });
    const wp: [number, number, number][] = [[0.6, 0.55, 0.05], [0.64, 0.66, 0.048], [0.65, 0.78, 0.046], [0.62, 0.9, 0.044]];
    for (const [wx, wy, r] of wp) b.sphere(wx, wy, 0.1, r, FARM.pink, { jitter: 0.02 }, 0);
    const hx = 0.57, hy = 1.0, hz = 0.1;
    b.sphere(hx, hy, hz, 0.058, FARM.pink, { jitter: 0.02 }, 0);
    for (const dx of [-0.022, 0.022]) b.box(hx + dx, hy + 0.015, hz + 0.05, 0.02, 0.02, 0.012, PAL.coal, J);
    b.cone(hx, hy + 0.06, hz, 0.04, 0.05, PAL.blue, 5, J);
    banner(b, -0.66, 0, -0.45, 0.95, c.banner);
  }
};

export const tower: Gen = (b, c) => {
  const s = c.stage;
  const lean = (x: number, z: number, tx: number, tz: number, h: number, y0: number, r = 0.045): void => {
    // leg from (x, y0, z) leaning to (tx, y0 + h, tz): built around the Y axis through the base
    const dx = tx - x, dz = tz - z, run = Math.hypot(dx, dz);
    const a = Math.atan2(run, h);
    const yaw = Math.atan2(-dz, dx);
    // the part rotates about the base: rotZ tilts toward -X, so yaw it so that -X points at the target
    const g = new THREE.CylinderGeometry(r * 0.9, r, Math.hypot(h, run), 6);
    g.translate(0, Math.hypot(h, run) / 2, 0);
    const o = new THREE.Matrix4().makeRotationY(yaw + Math.PI).multiply(new THREE.Matrix4().makeRotationZ(a));
    g.applyMatrix4(o);
    b.part(g, x, y0, z, PAL.timber, { jitter: 0.02 });
    g.dispose();
  };
  if (s === 0) {
    b.cyl(0, 0, 0, 0.055, 0.065, 0.8, PAL.timber, 6, { jitter: 0.02 });
    ladder(b, 0.17, 0, 0.0, 0.7, 0.12);
    b.cyl(0, 0.7, 0, 0.17, 0.17, 0.05, PAL.timberLight, 8, { jitter: 0.02 });
    // nest basket on top
    b.part(new THREE.TorusGeometry(0.15, 0.055, 5, 9), 0, 0.8, 0, PAL.hay, { rotX: Math.PI / 2, jitter: 0.06 });
    b.cyl(0, 0.75, 0, 0.13, 0.13, 0.04, PAL.thatch, 8, { jitter: 0.04 });
    flag(b, 0.0, 0.72, -0.12, 0.2, c.banner, 0.8);
    return;
  }
  const baseH = s >= 3 ? 0.3 : 0;
  if (s >= 3) taperBox(b, 0, 0, 0, 0.62, baseH, 0.62, PAL.stoneLight, 0.9, { jitter: 0.03 });
  const platY = [0, 0.62, 0.78, 0.9, 0.95][s]!;
  const nl = s === 1 ? 3 : 4;
  const legR = s >= 2 ? 0.36 : 0.34;
  const topR = s >= 3 ? 0.3 : 0.26;
  const legT = s >= 2 ? 0.06 : 0.045;
  for (let i = 0; i < nl; i++) {
    const a = (i / nl) * Math.PI * 2 + (nl === 4 ? Math.PI / 4 : Math.PI / 2);
    const R = s >= 3 ? 0.22 : legR;
    lean(Math.cos(a) * R, Math.sin(a) * R, Math.cos(a) * topR * 0.8, Math.sin(a) * topR * 0.8, platY - baseH + 0.02, baseH, legT);
  }
  if (s >= 2) {
    // cross-brace ring between the legs
    const ry = baseH + (platY - baseH) * 0.42;
    const rr = (s >= 3 ? 0.22 : legR) * 0.75 + topR * 0.8 * 0.25;
    b.part(new THREE.TorusGeometry(rr * 0.98, 0.02, 4, 8), 0, ry, 0, PAL.timberLight, { rotX: Math.PI / 2, jitter: 0.02 });
  }
  const pr = s >= 3 ? 0.36 : 0.32;
  b.cyl(0, platY, 0, pr, pr * 0.95, 0.06, PAL.timber, 10, { jitter: 0.02 });
  b.part(new THREE.TorusGeometry(pr, 0.03, 4, 10), 0, platY + 0.12, 0, PAL.timberLight, { rotX: Math.PI / 2, jitter: 0.03 });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    b.cyl(Math.cos(a) * pr, platY + 0.05, Math.sin(a) * pr, 0.03, 0.03, 0.09, PAL.timberLight, 4, J);
  }
  if (s === 1) {
    post(b, 0, platY + 0.06, 0, 0.2, 0.03, PAL.timberDark, 5);
    b.cone(0, platY + 0.25, 0, 0.38, 0.24, c.roof, 8, { smooth: true, jitter: 0.02 });
    flag(b, 0, platY + 0.47, 0, 0.16, c.banner, 0.7);
    ladder(b, 0.0, 0, 0.3, platY, 0.14, 0.12);
    return;
  }
  ladder(b, 0.0, 0, 0.3, platY + 0.1, 0.14, 0.1);
  // cabin + roof
  const cr = s >= 4 ? 0.26 : 0.24;
  const ch = s >= 3 ? 0.3 : 0.28;
  const cy = platY + 0.06;
  b.cyl(0, cy, 0, cr * 0.95, cr, ch, PAL.cream, 10, { smooth: true, jitter: 0.02 });
  const rh = s >= 4 ? 0.32 : 0.3;
  b.cone(0, cy + ch, 0, cr + 0.06, rh, c.roof, 10, { smooth: true, jitter: 0.02 });
  b.cyl(0, cy + ch - 0.03, 0, cr + 0.03, cr + 0.03, 0.05, PAL.timber, 10, { jitter: 0.02 });
  if (s === 2) {
    roundWindow(b, -0.1, cy + ch * 0.45, cr * 0.9, 0.05);
    roundWindow(b, 0.1, cy + ch * 0.45, cr * 0.9, 0.05);
    flag(b, 0, cy + ch + rh - 0.03, 0, 0.16, c.banner, 0.7);
  } else {
    // eyes peering out of the cabin
    for (const sx of [-1, 1]) {
      const ex = sx * 0.1, ey = cy + ch * 0.55;
      b.cyl(ex, ey, cr * 0.9 - 0.02, 0.065, 0.065, 0.025, PAL.white, 10, { rotX: Math.PI / 2, jitter: 0 });
      slab(b, ex + 0.025, ey - 0.02, cr * 0.9 + 0.025, 0.04, 0.04, 0.012, PAL.coal, J);
    }
    b.cyl(0, cy + ch * 0.3, cr * 0.9 + 0.05, 0.022, 0.022, 0.18, PAL.gold, 6, { rotX: Math.PI / 2, jitter: 0 });
    // lantern and a gold ring under the eave
    b.sphere(0.2, platY + 0.2, 0.28, 0.04, FARM.warm, { jitter: 0, emit: 0.8 }, 0);
    if (s >= 3) {
      b.part(new THREE.TorusGeometry(cr + 0.01, 0.015, 4, 10), 0, cy + 0.04, 0, PAL.gold, { rotX: Math.PI / 2, jitter: 0 });
      // corner buttresses on the stone base, a bunting pole and a winch crate on the platform
      for (const [bx, bz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) slab(b, bx * 0.26, 0, bz * 0.26, 0.12, 0.2, 0.12, PAL.stone, J);
      if (s === 3) flag(b, 0, cy + ch + rh - 0.03, 0, 0.18, c.banner, 0.7);
      slab(b, -0.26, platY + 0.06, 0.12, 0.12, 0.1, 0.12, PAL.timberLight);
      egg(b, -0.26, platY + 0.16, 0.12, 0.04);
    }
  }
  if (s >= 4) {
    weathervaneRooster(b, 0, cy + ch + rh - 0.04, 0, 0.7);
    b.sphere(0, platY - 0.05, 0.14, 0.055, PAL.gold, { jitter: 0, emit: 0.1 }, 0);
    miniChicken(b, 0.0, platY + 0.06, 0.3, 0, 0.75);
    banner(b, 0.5, 0, 0.35, 0.8, c.banner);
  }
};

/** Picket fence segment spanning x in [-0.87, 0.87] (z in [-0.2, 0.2]) so neighbours join. */
export const wall: Gen = (b, c) => {
  const s = c.stage;
  const XR = 0.815;
  if (s === 0) {
    for (let i = 0; i < 5; i++) b.cyl(-XR + (i * 2 * XR) / 4, 0, 0, 0.04, 0.045, 0.35, PAL.timber, 6, { jitter: 0.03 });
    [0.08, 0.17, 0.26].forEach((y, k) => {
      const z = k % 2 ? -0.045 : 0.045;
      b.cyl(0, y, z, 0.035, 0.035, XR + 0.02, PAL.timberLight, 6, { rotZ: Math.PI / 2 + 0.03, jitter: 0.06 });
      b.cyl(0, y, z, 0.035, 0.035, XR + 0.02, PAL.timberLight, 6, { rotZ: -Math.PI / 2 - 0.03, jitter: 0.06 });
    });
    return;
  }
  const fh = [0, 0.08, 0.14, 0.14, 0.16][s]!;
  const ph = [0, 0.3, 0.42, 0.48, 0.5][s]!;
  taperBox(b, 0, 0, 0, 1.74, fh, 0.28, s >= 2 ? PAL.stoneLight : PAL.stone, 0.97, { jitter: 0.03 });
  const gap = 0.2;
  const n = Math.round((2 * XR) / gap);
  for (let i = 0; i <= n; i++) {
    const x = -XR + (i * 2 * XR) / n;
    if (s >= 2 && Math.abs(x) < 0.2) continue; // the gate opening
    if (s >= 3 && Math.abs(Math.abs(x) - 0.74) < 0.09) continue;
    b.box(x, fh, 0.05, 0.075, ph, 0.03, PAL.white, { jitter: 0.02 });
    b.cone(x, fh + ph, 0.05, 0.052, 0.07, PAL.white, 4, { rotY: Math.PI / 4, jitter: 0.02 });
  }
  slab(b, 0, fh + ph * 0.3, -0.01, 2 * XR, 0.045, 0.04, 0xd8d2c0, J);
  slab(b, 0, fh + ph * 0.7, -0.01, 2 * XR, 0.045, 0.04, 0xd8d2c0, J);
  if (s <= 2) for (const sx of [-1, 1]) {
    b.cyl(sx * XR, fh, 0, 0.05, 0.055, ph + 0.02, PAL.timber, 6, { jitter: 0.02 });
    b.sphere(sx * XR, fh + ph + 0.04, 0, 0.05, PAL.white, { jitter: 0 }, 0);
  }
  if (s === 1) {
    // a lone mid post so the first upgrade already looks different from the stakes
    b.cyl(0, fh, 0, 0.055, 0.06, ph + 0.05, PAL.timber, 6, { jitter: 0.02 });
    b.sphere(0, fh + ph + 0.09, 0, 0.05, PAL.white, { jitter: 0 }, 0);
  }
  const gEgg = (x: number, y0: number, col: number = FARM.egg): void => { b.sphere(x, y0 + 0.08, 0, 0.07, col, { scale: [0.85, 1.12, 0.85], smooth: true, jitter: 0 }, 0); };
  const gateH = [0, 0, 0.55, 0.55, 0.45][s]!;
  const gx = 0.18;
  if (s >= 2) {
    // arched gate: two fat posts and a semicircular top bar
    for (const sx of [-1, 1]) b.cyl(sx * gx, fh, 0, 0.065, 0.075, gateH, PAL.white, 6, { jitter: 0.02 });
    b.part(new THREE.TorusGeometry(gx, 0.035, 4, 8, Math.PI), 0, fh + gateH, 0, PAL.white, { jitter: 0.02 });
    if (s === 2) {
      for (const sx of [-1, 1]) gEgg(sx * gx, fh + gateH);
      gEgg(0, fh + gateH + gx - 0.02, FARM.eggBrown);
    } else {
      gEgg(0, fh + gateH + gx - 0.02, s >= 4 ? PAL.gold : FARM.eggBrown);
      for (const sx of [-1, 1]) {
        domeRoof(b, sx * gx, fh + gateH, 0, 0.11, 0.1, c.roof, 6, false);
      }
    }
  }
  if (s >= 3) for (const sx of [-1, 1]) {
    b.cyl(sx * 0.74, fh, 0, 0.085, 0.095, 0.55, PAL.stoneLight, 6, { jitter: 0.03 });
    domeRoof(b, sx * 0.74, fh + 0.55, 0, 0.11, 0.09, c.roof, 6, false);
    if (s === 3 && sx < 0) flag(b, sx * 0.74, fh + 0.55 + 0.09, 0, 0.26, c.banner, 0.8); // the pennant points +X, so only the left one stays inside
  }
  if (s >= 4) {
    // guard perch above the gate: a front-gabled roof with the chicken just in front of it
    const py = fh + gateH + gx + 0.08;
    slab(b, 0, py, 0, 0.44, 0.04, 0.3, PAL.timber);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) post(b, sx * 0.19, py + 0.04, sz * 0.11, 0.14, 0.03, PAL.timberDark, 4);
    softGable(b, 0, py + 0.18, -0.04, 0.3, 0.46, 0.12, c.roof, { rotY: Math.PI / 2, infill: PAL.timberLight, ridge: PAL.gold });
    miniChicken(b, 0, py + 0.04, 0.1, 0, 0.6);
  }
};
