import * as THREE from 'three';
import { GeoBuilder, PAL } from '../builder';
import {
  FARM, LOW_COMB, archDoor, chimney, comb, crate, domeRoof, egg, face, lantern, miniChicken, nest, roundBox, softGable, taperBox,
  weathervaneRooster, type Gen,
} from './parts';
import { cWin, pennant } from './hall';

const WIRE_PALE = 0xc3cacd; // FARM.wire lifted so the run reads as mesh, not as solid grey boards

/** Chicken Coop: a red henhouse on stilts with a ramp and a nest box; grows a loft, a stone base, a wire run and a weathervane. */
export const house: Gen = (b, c) => {
  const s = c.stage;
  const P = s >= 3 ? 0.08 : 0; // stone plinth
  const w = s === 0 ? 0.56 : 0.7, d = s === 0 ? 0.46 : 0.58;
  const legH = 0.1, B = P;
  const wallY = B + 0.14;
  const wallH = s === 0 ? 0.3 : s === 1 ? 0.4 : 0.34;
  if (P > 0) taperBox(b, 0, 0, 0, w + 0.08, P, d + 0.08, PAL.stoneLight, 0.94);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(sx * (w / 2 - 0.05), B, sz * (d / 2 - 0.05), 0.07, legH, 0.07, PAL.timberDark, { jitter: 0 });
  b.box(0, B + legH, 0, w + 0.04, 0.04, d + 0.04, PAL.timber);
  if (s === 0) taperBox(b, 0, wallY, 0, w, wallH, d, PAL.timberLight, 0.94);
  else {
    roundBox(b, 0, wallY, 0, w, wallH, d, FARM.barnRed);
    for (const x of [-0.24, 0, 0.24]) b.box(x, wallY + 0.02, d / 2 + 0.005, 0.04, wallH - 0.04, 0.01, PAL.white, { jitter: 0 }); // trim boards
  }
  let top = wallY + wallH;
  if (s >= 2) {
    const lh = s >= 4 ? 0.32 : 0.28;
    taperBox(b, 0, top, -0.02, w * 0.8, lh, d * 0.8, FARM.barnRed, 0.95);
    taperBox(b, 0, top + 0.02, -0.02, w * 0.8 + 0.03, 0.035, d * 0.8 + 0.03, PAL.white, 1, { jitter: 0 });
    cWin(b, 0, top + lh * 0.55, d * 0.4 - 0.02, 0.055, true);
    top += lh;
  }
  const rw = s >= 2 ? w * 0.8 : w, rd = s >= 2 ? d * 0.8 : d;
  const rz = s >= 2 ? -0.02 : 0;
  // front gable (ridge along Z) so the triangular gable end faces the camera
  const ridge = softGable(b, 0, top, rz, rd, rw, s === 0 ? 0.2 : s === 1 ? 0.24 : s === 2 ? 0.2 : 0.22, s === 0 ? PAL.thatch : c.roof, {
    rotY: Math.PI / 2, infill: s === 0 ? PAL.timberLight : FARM.barnRed,
  });
  // gable-end pop-hole disc (reads as a round vent in the triangle)
  b.box(0, top + 0.03, rz + rd / 2 + 0.005, 0.08, 0.08, 0.02, PAL.coal, { jitter: 0 });
  if (s >= 1) comb(b, 0, ridge - 0.02, rz + (s >= 2 ? 0.1 : 0.12), 1.4, false, LOW_COMB);
  if (s >= 2) chimney(b, 0.26, top + 0.05, rz - 0.1, 0.3);

  // pop hole and ramp down to the ground
  const px = -0.16, fz = d / 2;
  b.box(px, wallY, fz + 0.005, 0.15, 0.17, 0.02, PAL.coal, { jitter: 0 });
  const y1 = wallY, L = 0.45, dy = y1 - 0.01;
  const ang = Math.atan2(dy, L), len = Math.hypot(L, dy);
  b.box(px, (y1 + 0.01) / 2 - 0.015, fz + L / 2, 0.15, 0.03, len, PAL.timberLight, { rotX: ang, jitter: 0 });
  for (const t of [0.3, 0.55, 0.8]) b.box(px, y1 - dy * t + 0.005, fz + L * t, 0.15, 0.02, 0.035, PAL.timberDark, { jitter: 0 });
  const rampY = (t: number): number => y1 - dy * t;

  // side nest box with eggs
  const nx = w / 2 + 0.09;
  taperBox(b, nx, B + 0.12, 0, 0.18, 0.18, 0.3, PAL.timberLight, 0.95);
  nest(b, nx, B + 0.3, 0, 0.075, 2, FARM.egg, true);

  if (s === 0) egg(b, 0.14, 0, fz + 0.12, 0.04);
  if (s >= 1) { // straw at the door
    b.cyl(0.2, 0, fz + 0.14, 0.1, 0.12, 0.05, PAL.hay, 6, { jitter: 0.06 });
    egg(b, 0.14, 0.04, fz + 0.16, 0.03);
    cWin(b, 0.2, wallY + 0.17, fz, 0.06, false);
  }
  if (s >= 3) { // wire run with a bale and a hen
    wire(b, [[-0.6, 0.05], [-0.6, 0.62], [-0.3, 0.62]]);
    wire(b, [[-0.02, 0.62], [0.6, 0.62], [0.6, 0.05]]);
    b.cyl(0.36, 0.1, 0.42, 0.1, 0.1, 0.18, PAL.hay, 8, { rotZ: Math.PI / 2, rotY: 0.4, jitter: 0.05 }); // round bale
    miniChicken(b, -0.4, 0, 0.4, 0.5);
  }
  if (s >= 4) {
    weathervaneRooster(b, 0, ridge - 0.03, rz - 0.12, 0.8, PAL.gold, true);
    // flower box under the window
    b.box(0.2, wallY + 0.08, fz + 0.03, 0.22, 0.05, 0.06, PAL.timber, { jitter: 0 });
    [-0.07, 0, 0.07].forEach((dx, i) => b.sphere(0.2 + dx, wallY + 0.14, fz + 0.03, 0.03, i === 1 ? 0xf0dc6a : 0xd9779a, { jitter: 0 }, 0));
    miniChicken(b, px, rampY(0.45), fz + 0.45 * L, 0, 0.8, FARM.eggBrown, true);
    pennant(b, -0.66, 0, 0.72, 0.7, c.banner);
  }
};

/**
 * Chicken-wire run through `pts`: a pale wire panel per side, timber battens every ~0.2 (corner battens shared) and a
 * top rail. Battens are 0.035 wide so they keep their colour under the outline.
 */
function wire(b: GeoBuilder, pts: [number, number][]): void {
  const h = 0.18;
  const batten = (x: number, z: number): void => { b.box(x, 0, z, 0.035, h + 0.03, 0.035, PAL.timber, { jitter: 0.02 }); };
  batten(pts[0]![0], pts[0]![1]);
  for (let k = 0; k + 1 < pts.length; k++) {
    const [x0, z0] = pts[k]!, [x1, z1] = pts[k + 1]!;
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 0.2));
    const ang = Math.atan2(-(z1 - z0), x1 - x0);
    for (let i = 1; i <= n; i++) batten(x0 + ((x1 - x0) * i) / n, z0 + ((z1 - z0) * i) / n);
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    b.box(mx, 0.02, mz, len, h - 0.02, 0.01, WIRE_PALE, { rotY: ang, jitter: 0 });
    b.box(mx, h, mz, len, 0.035, 0.035, PAL.timberLight, { rotY: ang, jitter: 0.02 });
  }
}

/** Builder Hen's Shed: a shed wearing a giant mustard hard hat, with eyes peeking out and a little scaffold tower. */
export const builders: Gen = (b) => {
  const sx = -0.15, sz = -0.1;
  roundBox(b, sx, 0, sz, 0.62, 0.36, 0.5, PAL.timberLight);
  // hard hat: dome, brim, front-to-back ridge band, lamp
  const hat = FARM.mustard;
  const hz = sz - 0.09;
  b.cyl(sx, 0.36, hz, 0.4, 0.4, 0.035, 0xb58a30, 12, { jitter: 0.02 });
  domeRoof(b, sx, 0.395, hz, 0.36, 0.225, hat, 10, false);
  for (const ph of [Math.PI / 2, (3 * Math.PI) / 2]) {
    const g = new THREE.SphereGeometry(1, 2, 4, ph - 0.14, 0.28, 0, Math.PI / 2);
    b.part(g, sx, 0.395, hz, 0xe8c25a, { scale: [0.375, 0.24, 0.375], smooth: true, jitter: 0 });
    g.dispose();
  }
  lantern(b, sx, 0.46, hz + 0.34);
  // eyes under the brim and a door
  face(b, sx, 0.3, sz + 0.25, 0.9, 'eyes');
  archDoor(b, sx, sz + 0.26, 0.14, 0.19, PAL.timberDark, 0);
  crate(b, -0.55, 0, 0.32);
  // scaffold tower
  for (const x of [0.34, 0.58]) for (const z of [-0.2, 0.0]) b.cyl(x, 0, z, 0.035, 0.04, 0.6, PAL.timber, 6);
  b.box(0.46, 0.27, -0.1, 0.34, 0.04, 0.26, PAL.timberLight);
  b.box(0.46, 0.54, -0.1, 0.34, 0.04, 0.26, PAL.timberLight);
  b.box(0.46, 0.33, 0.01, 0.34, 0.035, 0.035, PAL.timberDark, { jitter: 0, rotZ: 0.5 });
  egg(b, 0.5, 0.31, -0.1, 0.04);
  // plank pile
  b.box(0.42, 0, 0.34, 0.5, 0.045, 0.12, PAL.timberLight);
  b.box(0.42, 0.045, 0.34, 0.44, 0.045, 0.11, PAL.timber);
  b.box(0.42, 0.09, 0.34, 0.38, 0.045, 0.1, PAL.timberLight);
  // big wooden hammer leaning on the shed
  b.cyl(0.25, 0, 0.1, 0.03, 0.03, 0.3, PAL.timberDark, 6, { rotZ: 0.3, jitter: 0 });
  roundBox(b, 0.16, 0.25, 0.1, 0.08, 0.08, 0.16, PAL.stoneDark, 0.02, { rotZ: 0.3, jitter: 0 });
  // site hen in a tiny hard hat: bigger hen facing the camera, small hat perched on the very top so eyes and beak show
  const hs = 1.4, hrot = 0.2, hx = 0.0, hzz = 0.45;
  miniChicken(b, hx, 0, hzz, hrot, hs);
  const hg = new THREE.SphereGeometry(1, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2);
  b.part(hg, hx + Math.sin(hrot) * 0.05 * hs, 0.17 * hs, hzz + Math.cos(hrot) * 0.05 * hs, hat, { scale: [0.034, 0.03, 0.034], smooth: true, jitter: 0 });
  hg.dispose();
};
