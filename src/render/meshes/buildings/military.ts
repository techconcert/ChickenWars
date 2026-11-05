// Military buildings: Rooster Barracks, Egg Toss Range, Pigsty, Contraption Barn (docs/10-building-art-brief.md 3.10 to 3.13).
// The Nursing Nest (infirmary) lives in supportExtra.ts and is re-exported here because index.ts imports it from this file.
import * as THREE from 'three';
import { PAL, mulRGB, toRGB, type GeoBuilder } from '../builder';
import {
  FARM, LOW_COMB, LOW_FENCE, banner, comb, egg, face, flag, hayBale, miniChicken, picketFence, roundBox, roundWindow, softGable, taperBox,
  type Gen,
} from './parts';
import { bullseye, doorY, eggSplat, farmerCutout, ladder, plinth, post, slab } from './militaryExtra';

export { infirmary } from './supportExtra';
export { stable, workshop } from './militaryExtra';

export const barracks: Gen = (b, c) => {
  const s = c.stage;
  const pl = s >= 3 ? 0.1 : 0;
  const J = { jitter: 0 };
  if (s >= 3) plinth(b, 0, -0.1, 1.14, 0.76);
  let roofY = 0;
  if (s === 0) {
    // canvas tent hall with a comb plume
    taperBox(b, 0, 0, -0.1, 0.9, 0.2, 0.6, PAL.cream, 0.96);
    b.hip(0, 0.2, -0.1, 0.96, 0.66, 0.34, PAL.cream, { jitter: 0.02 });
    b.box(0, 0, 0.205, 0.2, 0.2, 0.03, PAL.timberDark, J);
    for (const sg of [-1, 1]) post(b, sg * 0.45, 0, 0.2, 0.2, 0.035);
    comb(b, 0, 0.5, -0.1, 1.4, false, LOW_COMB);
  } else {
    const wl = s >= 2 ? 0.4 : 0.42;
    roundBox(b, 0, pl, -0.1, 1.0, wl, 0.62, PAL.stoneLight, 0.045);
    slab(b, 0, pl + wl * 0.45, -0.1, 1.04, 0.045, 0.66, PAL.timber, J);
    for (const sg of [-1, 1]) slab(b, sg * 0.5, pl, 0.2, 0.07, wl, 0.07, PAL.timber, J);
    doorY(b, s >= 4 ? -0.24 : 0, 0.215, 0.22, 0.3, PAL.timberDark, pl);
    if (s === 1) for (const sg of [-1, 1]) roundWindow(b, sg * 0.34, pl + 0.22, 0.21, 0.065);
    roofY = pl + wl;
    let gh = 0.22, len = 1.0, wid = 0.78;
    if (s >= 2) {
      slab(b, 0, roofY, -0.1, 1.06, 0.06, 0.66, c.roof);
      const us = s >= 4 ? 0.32 : 0.26;
      roundBox(b, 0, roofY + 0.06, -0.1, 0.8, us, 0.5, PAL.stoneLight, 0.045);
      roofY += 0.06 + us;
      gh = 0.17; len = 0.86; wid = 0.54; // narrow eave so the upper windows show between the two roofs
      if (s < 4) for (const sg of [-1, 1]) roundWindow(b, sg * 0.22, roofY - us + 0.125, 0.16, 0.05);
      else {
        // regiment shield board, proud of the upper wall and well below the eave
        slab(b, 0, roofY - us + 0.015, 0.14, 0.42, us - 0.08, 0.04, PAL.timber, J);
        face(b, 0, roofY - 0.15, 0.16, 1.1, 'chicken');
      }
    }
    const rt = softGable(b, 0, roofY, -0.1, len, wid, gh, c.roof, { ridge: s >= 4 ? PAL.gold : undefined, over: s >= 2 ? 0.04 : 0.09 });
    const nc = 2;
    for (let i = 0; i < nc; i++) comb(b, (i - (nc - 1) / 2) * (s >= 2 ? 0.3 : 0.36), rt - 0.03, -0.1, s >= 2 ? 1.2 : 1.3, true, LOW_COMB);
  }

  // yard: shield rack, dummy or farmer cut-out
  const rx = s >= 4 ? -0.5 : s >= 3 ? -0.5 : -0.38;
  slab(b, rx - 0.26, 0, 0.46, 0.06, 0.3, 0.05, PAL.timberDark, J);
  slab(b, rx + 0.26, 0, 0.46, 0.06, 0.3, 0.05, PAL.timberDark, J);
  slab(b, rx, 0.24, 0.46, 0.58, 0.04, 0.04, PAL.timberDark, J);
  for (let i = 0; i < 3; i++) {
    const x = rx - 0.18 + i * 0.18;
    b.cyl(x, 0.07, 0.49, 0.09, 0.09, 0.03, PAL.stoneLight, 8, { rotX: Math.PI / 2, jitter: 0.02 });
    slab(b, x, 0.14, 0.52, 0.06, 0.05, 0.03, c.banner, J);
  }
  if (s === 0) {
    post(b, 0.58, 0, 0.4, 0.3, 0.035, PAL.timberDark);
    slab(b, 0.58, 0.18, 0.4, 0.26, 0.04, 0.04, PAL.timberDark, J);
    b.sphere(0.58, 0.18, 0.4, 0.08, PAL.hay, { scale: [1, 1.2, 0.8], jitter: 0.06 }, 1);
    b.sphere(0.58, 0.34, 0.4, 0.055, PAL.hay, { jitter: 0.06 }, 0);
  } else farmerCutout(b, 0.56, 0, 0.42, -0.2);

  const tower = (x: number, th: number): void => {
    b.cyl(x, pl, -0.4, 0.16, 0.18, th, PAL.stoneLight, 8, { smooth: true, jitter: 0.02 });
    b.cyl(x, pl + th - 0.04, -0.4, 0.2, 0.2, 0.05, PAL.timber, 6, J);
    b.cone(x, pl + th, -0.4, 0.24, 0.3, c.roof, 8, { smooth: true, jitter: 0.02 });
    comb(b, x, pl + th + 0.27, -0.4, 0.8, false, LOW_COMB);
  };
  if (s >= 2) tower(0.52, s >= 4 ? 0.85 : s === 3 ? 0.75 : 0.68);
  if (s >= 4) tower(-0.52, 0.85);
  if (s >= 3) {
    picketFence(b, -0.66, 0.6, -0.12, 0.6, 0.26, PAL.white, { ...LOW_FENCE, gap: 0.28 });
    picketFence(b, 0.12, 0.6, 0.66, 0.6, 0.26, PAL.white, { ...LOW_FENCE, gap: 0.28 });
    // pitchfork rack on the right
    slab(b, 0.66, 0.26, 0.2, 0.04, 0.04, 0.34, PAL.timberDark, J);
    for (let i = 0; i < 2; i++) {
      b.cyl(0.66, 0, 0.1 + i * 0.16, 0.03, 0.03, 0.4, PAL.timberLight, 5, J);
      b.cone(0.66, 0.4, 0.1 + i * 0.16, 0.04, 0.1, PAL.stoneLight, 4, J);
    }
  }
  if (s >= 1 && s < 4) flag(b, -0.5, pl + 0.34, -0.1, 0.35, c.banner);
  if (s >= 4) banner(b, 0.68, 0, 0.5, 0.95, c.banner);
};


/** Giant slingshot in the XY plane (fork faces the camera), egg in the pouch, rubber bands to the prong tips. */
function slingshot(b: GeoBuilder, x: number, z: number, k = 1): void {
  const J = { jitter: 0 };
  b.cyl(x, 0, z, 0.045 * k, 0.065 * k, 0.4 * k, PAL.timber, 6, { jitter: 0.02 });
  for (const sg of [-1, 1]) {
    b.cyl(x + sg * 0.025 * k, 0.38 * k, z, 0.032 * k, 0.045 * k, 0.28 * k, PAL.timber, 6, { rotZ: -sg * 0.5, jitter: 0.02 });
    b.sphere(x + sg * 0.17 * k, 0.64 * k, z, 0.04 * k, PAL.timberDark, J, 0);
    // band from the prong tip down to the pouch
    b.box(x + sg * 0.09 * k, 0.5 * k, z, 0.02, 0.2 * k, 0.02, FARM.pinkDark, { rotZ: sg * 0.5, ...J });
  }
  slab(b, x, 0.4 * k, z, 0.12 * k, 0.05 * k, 0.05 * k, PAL.timberDark, J);
  b.sphere(x, 0.5 * k, z, 0.075 * k, FARM.egg, { scale: [0.85, 1.12, 0.85], smooth: true, jitter: 0 }, 0);
}

const ARCH_PLUM = FARM.mustard;

export const archery: Gen = (b, c) => {
  const s = c.stage;
  const pl = s >= 3 ? 0.1 : 0;
  const J = { jitter: 0 };
  const roof = c.roof === PAL.roofOrange ? ARCH_PLUM : c.roof; // mustard lean-to so it differs from the orange gabled Pigsty
  const tz = 0.4; // target line
  const target = (x: number, kind: 'bale' | 'farmer', z = tz): void => {
    if (kind === 'farmer') {
      farmerCutout(b, x, 0, z, 0, 1.2);
      eggSplat(b, x - 0.04, 0.2, z + 0.03, 0.04);
      eggSplat(b, x + 0.06, 0.1, z + 0.03, 0.03);
      eggSplat(b, x + 0.02, 0.36, z + 0.07, 0.035);
      return;
    }
    slab(b, x, 0, z - 0.1, 0.05, 0.34, 0.05, PAL.timberDark, J);
    hayBale(b, x, 0, z, 0, 1.3, true);
    bullseye(b, x, 0.4, z - 0.05, s === 0 ? 0.18 : 0.15);
  };
  if (s === 0) target(0, 'bale', 0.2);
  else if (s === 1) { target(-0.3, 'bale'); target(0.2, 'bale'); }
  else { target(-0.5, 'bale'); target(-0.15, 'farmer'); target(0.2, 'bale'); }
  // basket of eggs + throwing line
  const bx = s === 0 ? 0.45 : -0.62;
  const bz = s === 0 ? 0.55 : 0.64;
  b.cyl(bx, 0, bz, 0.1, 0.12, 0.1, PAL.thatch, 8, { jitter: 0.04 });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * 6.28;
    egg(b, bx + Math.cos(a) * 0.045, 0.1, bz + Math.sin(a) * 0.045, 0.045, i % 2 ? FARM.eggBrown : FARM.egg);
  }
  slab(b, 0, 0, s === 0 ? 0.64 : 0.7, s === 0 ? 0.6 : 1.0, 0.02, 0.04, PAL.white, J);
  if (s === 0) {
    // a mustard lean-to flag so even the first stage carries the colour
    post(b, -0.5, 0, 0.1, 0.38, 0.03);
    b.box(-0.4, 0.26, 0.1, 0.2, 0.12, 0.02, roof, { rotZ: -0.1, jitter: 0 });
  }

  if (s >= 1) {
    // open lean-to: tall back wall, shorter front posts, one sloped mustard roof facing the camera
    const ph = s >= 4 ? 0.6 : s === 3 ? 0.54 : s === 2 ? 0.48 : 0.42;
    const rise = s >= 4 ? 0.3 : s >= 3 ? 0.27 : s >= 2 ? 0.23 : 0.18;
    const wid = s >= 3 ? 1.0 : 0.9;
    const zb = -0.4, zf = 0.1; // back and front edge of the shed
    if (s >= 3) plinth(b, 0, -0.2, 1.14, 0.78);
    slab(b, 0, pl, zb, wid - 0.06, ph + rise - 0.04, 0.1, PAL.timberLight);
    for (const x of [-1, 1]) {
      post(b, x * (wid / 2 + 0.02), pl, zf, ph, 0.05);
      post(b, x * (wid / 2 + 0.02), pl, zb + 0.04, ph + rise - 0.04, 0.045);
    }
    // front beam under the roof, with an egg sign hanging from it
    slab(b, 0, pl + ph - 0.07, zf, wid + 0.06, 0.07, 0.06, PAL.timber, J);
    const tilt = Math.atan2(rise, zf - zb);
    const rl = Math.hypot(zf - zb, rise) + 0.2;
    const g = new THREE.BoxGeometry(wid + 0.22, 0.06, rl);
    b.part(g, 0, pl + ph + rise / 2 + 0.02, (zf + zb) / 2 + 0.04, roof, { rotX: tilt, jitter: 0.02 });
    g.dispose();
    if (s >= 2) {
      // a big target ring painted on the slope: the Egg Toss Range read from far away
      const ry = pl + ph + rise / 2 + 0.05;
      const rz = (zf + zb) / 2 + 0.04;
      b.cyl(0, ry, rz, 0.17, 0.17, 0.02, PAL.white, 8, { rotX: tilt, jitter: 0 });
      b.cyl(0, ry + 0.012, rz, 0.11, 0.11, 0.02, FARM.barnRed, 8, { rotX: tilt, jitter: 0 });
      b.cyl(0, ry + 0.024, rz, 0.05, 0.05, 0.02, PAL.white, 8, { rotX: tilt, jitter: 0 });
    }
    // gold-trimmed front eave and the egg emblem on it
    slab(b, 0, pl + ph - 0.015, zf + 0.12, wid + 0.22, 0.045, 0.05, s >= 4 ? PAL.gold : mulRGB(toRGB(roof), 0.82), J);
    b.sphere(0, pl + ph - 0.16, zf + 0.04, 0.075, FARM.egg, { scale: [0.9, 1.15, 0.3], jitter: 0, smooth: true }, 0);
  }
  if (s >= 3) {
    // watch loft with a lookout hen
    const lx = -0.57, lz = -0.46, ly = pl + 0.55;
    for (const dx of [-0.17, 0.17]) post(b, lx + dx, pl, lz + 0.1, ly - pl + 0.03, 0.035);
    slab(b, lx, ly, lz, 0.42, 0.04, 0.3, PAL.timber);
    slab(b, lx, ly + 0.04, lz - 0.14, 0.42, 0.035, 0.035, PAL.timberLight, J);
    for (const sg of [-1, 1]) slab(b, lx + sg * 0.19, ly + 0.04, lz, 0.035, 0.035, 0.3, PAL.timberLight, J);
    miniChicken(b, lx, ly + 0.04, lz, 0.5, 0.9);
    ladder(b, lx + 0.27, pl, lz + 0.2, ly - pl + 0.02);
    slab(b, 0.64, pl, 0.0, 0.2, 0.1, 0.16, PAL.timberLight);
    for (const dx of [-0.05, 0.05]) egg(b, 0.64 + dx, pl + 0.1, 0.0, 0.04, FARM.egg);
  }
  if (s >= 4) {
    slingshot(b, 0.56, tz + 0.06, 1.0);
    banner(b, 0.64, 0, -0.3, 0.95, c.banner);
  }
};
