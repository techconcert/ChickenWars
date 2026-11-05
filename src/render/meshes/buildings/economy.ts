// Economy buildings, part 1: Corn Field, Twig Yard, Pebble Pit, Golden Roost (docs/10-building-art-brief.md 3.3 to 3.6).
// Feed Silo, Egg Trading Post and Egg Market live in economyExtra.ts and are re-exported here.
import * as THREE from 'three';
import { GeoBuilder, PAL, mulRGB, toRGB } from '../builder';
import { FEATHER } from '../chickens';
import {
  FARM, LOW_FENCE, banner, chimney, domeRoof, egg, eggSign, lantern, logPile, miniChicken,
  nest, picketRun, roundBale, roundBox, softGable, taperBox, type Gen,
} from './parts';
import { lowDoor, lowPebbles, lowRow, lowSack, lowStalk, porthole } from './economyBits';

export { storehouse, tradingpost, market } from './economyExtra';

const PI = Math.PI;

/** Cylinder whose base sits at (x, y0, z) and leans `tilt` radians towards the world direction (dx, dz). */
function lean(b: GeoBuilder, x: number, y0: number, z: number, r: number, h: number, col: number, tilt: number, dx: number, dz: number, seg = 5): void {
  // part() applies rotY then rotZ: rotZ tips +Y towards local -X, which rotY(phi) maps to (-cos phi, 0, sin phi)
  const phi = PI - Math.atan2(dz, dx);
  b.cyl(x, y0, z, r, r * 1.1, h, col, seg, { rotY: phi, rotZ: tilt, jitter: 0.05 });
}

// ---------------------------------------------------------------- Corn Field

function windpump(b: GeoBuilder, x: number, z: number): void {
  const H = 1.0;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    b.cyl(x + sx * 0.1, 0, z + sz * 0.1, 0.026, 0.03, H + 0.05, PAL.timberLight, 4, { rotZ: sx * 0.1, rotX: -sz * 0.1, jitter: 0.03 });
  }
  b.box(x, 0.8, z, 0.15, 0.035, 0.15, PAL.timber, { jitter: 0 });
  const hz = z + 0.1;
  b.sphere(x, H, hz, 0.055, PAL.gold, { jitter: 0, emit: 0.1 }, 0);
  for (let i = 0; i < 4; i++) {
    b.part(new THREE.BoxGeometry(0.06, 0.4, 0.02), x, H, hz, i % 2 ? FARM.cornLeaf : FARM.barnRed, { rotZ: (i * PI) / 4, jitter: 0 });
  }
  b.box(x, H - 0.015, z - 0.1, 0.035, 0.035, 0.26, PAL.timber, { jitter: 0 }); // tail rod
  b.box(x, H - 0.07, z - 0.22, 0.02, 0.14, 0.12, FARM.barnRed, { jitter: 0 }); // tail fin
}

export const farm: Gen = (b, c) => {
  const s = c.stage;
  taperBox(b, 0, 0, 0.05, 1.05, 0.06, 0.95, PAL.soil, 0.96, { jitter: 0.05 });
  const rowH = [0.12, 0.2, 0.26, 0.3, 0.34][s]!;
  const zs = s === 0 ? [-0.3, -0.07, 0.16, 0.38] : [-0.3, -0.07, 0.16, 0.38];
  zs.forEach((z, i) => {
    const ripe = s >= 2 && (s >= 4 || i % 2 === 1 || i === zs.length - 1);
    lowRow(b, -0.45, 0.45, z, rowH, ripe, 0.05);
  });
  // feed sack and a little stump
  lowSack(b, 0.5, 0.05, -0.38, 0xd8c9a0, 0.3);
  if (s >= 1) {
    picketRun(b, [[-0.6, -0.4], [-0.6, 0.6], [0.6, 0.6], [0.6, -0.4]], 0.18, PAL.white, { ...LOW_FENCE, gap: 0.3 });
    // water trough
    taperBox(b, 0.3, 0, 0.67, 0.26, 0.08, 0.1, PAL.timber, 0.9);
    b.box(0.3, 0.07, 0.67, 0.2, 0.012, 0.06, PAL.blue, { jitter: 0, emit: 0.1 });
  }
  if (s >= 2) {
    for (let i = 0; i < 3; i++) lowStalk(b, -0.15 + i * 0.25, 0.5, 0.36);
    // scarecrow: a fake farmer in a flannel shirt
    const sx = -0.46, sz = 0.2, y = 0.05;
    b.cyl(sx, y, sz, 0.022, 0.025, 0.5, PAL.timberDark, 5, { jitter: 0 });
    b.box(sx, y + 0.28, sz, 0.26, 0.035, 0.035, PAL.timberDark, { jitter: 0 });
    b.box(sx, y + 0.16, sz, 0.14, 0.16, 0.06, 0xb3453c, { jitter: 0.03 });
    b.sphere(sx, y + 0.54, sz, 0.065, PAL.hay, { jitter: 0.02 }, 0);
    b.cyl(sx, y + 0.585, sz, 0.11, 0.11, 0.02, PAL.hay, 6, { jitter: 0.02 });
    b.cyl(sx, y + 0.605, sz, 0.06, 0.06, 0.05, PAL.hay, 8, { jitter: 0.02 });
  }
  if (s >= 3) {
    // wire corn crib: cage with a corn band under a raised dome roof
    const cx = 0.45, cz = -0.5;
    b.cyl(cx, 0.05, cz, 0.18, 0.2, 0.55, FARM.wire, 6, { jitter: 0.03 });
    b.cyl(cx, 0.6, cz, 0.17, 0.18, 0.1, FARM.corn, 6, { jitter: 0.06 });
    for (const y of [0.1, 0.4]) b.cyl(cx, y, cz, 0.205, 0.205, 0.04, PAL.timber, 6, { jitter: 0.02 });
    for (const a of [0, 2.1, 4.2]) b.cyl(cx + Math.cos(a) * 0.15, 0.7, cz + Math.sin(a) * 0.15, 0.025, 0.025, 0.12, PAL.timber, 4, { jitter: 0 });
    domeRoof(b, cx, 0.82, cz, 0.23, 0.14, c.roof, 6, true);
    b.sphere(cx, 0.97, cz, 0.04, PAL.gold, { jitter: 0, emit: 0.1 }, 0);
    roundBale(b, -0.5, 0.05, -0.5, 0.11, 0.2, 0.4, true);
  }
  if (s >= 4) {
    windpump(b, -0.47, -0.4);
    banner(b, 0.62, 0.05, 0.1, 0.85, c.banner);
  }
};

// ---------------------------------------------------------------- Twig Yard

/** Stack of logs (axis along local X, turned by rotY) with two twine straps: triangular bands that hug the log pyramid. */
function bundle(b: GeoBuilder, x: number, z: number, rotY: number, rows = 3, len = 0.4, tied = true): void {
  const cs = Math.cos(rotY), sn = Math.sin(rotY);
  logPile(b, x + (cs * len) / 2, 0, z - (sn * len) / 2, rows, len, rotY); // logPile grows from its start point along local -X
  if (!tied) return;
  const hw = ((rows - 1) * 0.095) / 2 + 0.085, ht = 0.09 + (rows - 1) * 0.082 + 0.07, t = 0.025;
  const verts = [[-t, 0, -hw], [-t, 0, hw], [-t, ht, 0], [t, 0, -hw], [t, 0, hw], [t, ht, 0]];
  const faces = [[0, 1, 2], [3, 4, 5], [0, 1, 4, 3], [1, 2, 5, 4], [2, 0, 3, 5]];
  for (const d of [-len * 0.28, len * 0.28]) b.solid(verts, faces, x + cs * d, -0.005, z - sn * d, 0xe0c070, { rotY, jitter: 0 });
}

/**
 * Steep gable roof of round logs over walls w (x) by d (z) with base y0. Ridge along X so the front slope, three
 * stepped logs, faces the camera; a ridge log on top and, with `antlers`, crossed log ends over both gable peaks.
 */
function logRoof(b: GeoBuilder, x: number, y0: number, z: number, w: number, d: number, h: number, col: number, antlers: boolean): void {
  const r = 0.05, L = w + 0.16, hd = d / 2 + 0.09;
  const a = Math.atan2(h, d / 2);
  const light = mulRGB(toRGB(col), 1.18);
  b.gable(x, y0, z, w + 0.02, d, h, PAL.timberLight, { jitter: 0.02 });
  for (const sg of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const dz = ((i + 0.55) / 3) * hd;
      const y = y0 + h - dz * Math.tan(a) + r / Math.cos(a) - 0.02;
      b.cyl(x + L / 2, y, z + sg * dz, r, r, L, i % 2 ? light : col, 5, { rotZ: PI / 2, jitter: 0.04 });
    }
  }
  const ay = y0 + h + r * 0.9;
  b.cyl(x + L / 2 + 0.02, ay, z, r * 1.1, r * 1.1, L + 0.04, light, 5, { rotZ: PI / 2, jitter: 0.03 });
  if (!antlers) return;
  for (const ex of [-1, 1]) {
    for (const sg of [-1, 1]) {
      const bz = z + sg * 0.13 * Math.cos(a), by = ay - 0.13 * Math.sin(a);
      b.cyl(x + ex * (L / 2 - 0.03), by, bz, 0.038, 0.038, 0.3, sg > 0 ? light : col, 5, { rotX: -sg * (PI / 2 - a), jitter: 0.03 });
    }
  }
}

export const lumber: Gen = (b, c) => {
  const s = c.stage;
  // log ends face the camera, so the twine straps read as bands wrapped over the pile
  bundle(b, 0.0, 0.5, PI / 2, 3, 0.4, s >= 1);
  bundle(b, 0.5, 0.52, PI / 2 + 0.2, 2, 0.34, s >= 1);
  // chopping stump with a tall axe
  b.cyl(-0.55, 0, 0.1, 0.1, 0.11, 0.14, PAL.timber, 7);
  b.cyl(-0.55, 0.14, 0.1, 0.09, 0.09, 0.01, PAL.timberLight, 7, { jitter: 0 });
  b.box(-0.55, 0.14, 0.1, 0.04, 0.3, 0.04, PAL.timberDark, { rotZ: 0.3, jitter: 0 });
  b.box(-0.62, 0.4, 0.1, 0.11, 0.08, 0.04, PAL.stoneLight, { rotZ: 0.3, jitter: 0 });
  if (s <= 3) lowSack(b, 0.55, 0, -0.4, 0xd8c9a0, 0.4);

  if (s === 0) {
    // open log rack: four uprights holding a stack of logs
    const rx = -0.2, rz = -0.3;
    for (const [dx, dz] of [[-0.2, -0.13], [0.2, -0.13], [-0.2, 0.13], [0.2, 0.13]] as const) {
      b.cyl(rx + dx, 0, rz + dz, 0.028, 0.032, 0.5, PAL.timberDark, 4, { jitter: 0.02 });
    }
    let k = 0;
    for (const [row, n] of [[0, 3], [1, 2], [2, 1]] as const) {
      for (let i = 0; i < n; i++, k++) {
        b.cyl(rx + (i - (n - 1) / 2) * 0.1, 0.05 + row * 0.085, rz - 0.15, 0.045, 0.045, 0.3, k % 2 ? PAL.timberLight : PAL.timber, 5, { rotX: PI / 2 });
      }
    }
  }
  const plinth = s >= 3 ? 0.08 : 0;
  if (s >= 1) {
    // log-cabin woodshed under a steep roof of round logs, crossed log ends over both gable peaks from stage 2
    const wallH = [0, 0.5, 0.52, 0.54, 0.54][s]!;
    const rx = -0.25, rz = -0.3;
    if (plinth) taperBox(b, rx, 0, rz, 0.56, plinth, 0.46, PAL.stoneLight, 0.95);
    taperBox(b, rx, plinth, rz, 0.5, wallH, 0.4, PAL.timberLight, 0.95);
    for (const y of [wallH - 0.2, wallH - 0.08]) b.cyl(rx + 0.25, plinth + y, -0.095, 0.03, 0.03, 0.5, PAL.timber, 5, { rotZ: PI / 2, jitter: 0.02 });
    logRoof(b, rx, plinth + wallH, rz, 0.5, 0.4, [0, 0.18, 0.21, 0.23, 0.25][s]!, c.roof, s >= 2);
    lowDoor(b, rx, -0.1, 0.17, 0.27, FARM.sage, plinth);
    if (s >= 3) porthole(b, rx + 0.17, plinth + 0.2, rz + 0.205, 0.045, true);
    if (s >= 2) chimney(b, rx - 0.17, plinth + wallH + 0.04, rz - 0.1, 0.26);
  }
  if (s >= 2) {
    // the signature heap: a woven twig nest with sticks poking out
    const nx = 0.25, nz = 0.04;
    b.part(new THREE.TorusGeometry(0.28, 0.11, 4, 10), nx, 0.11, nz, PAL.timberLight, { rotX: PI / 2, jitter: 0.08 });
    b.cyl(nx, 0.03, nz, 0.2, 0.2, 0.06, PAL.timber, 8, { jitter: 0.05 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * PI * 2 + 0.3;
      const tilt = 0.5 + 0.5 * ((i * 37) % 10) / 10;
      lean(b, nx + Math.cos(a) * 0.24, 0.12, nz + Math.sin(a) * 0.24, 0.018, 0.3 + (i % 3) * 0.04, i % 2 ? PAL.timber : PAL.timberLight, tilt, Math.cos(a), Math.sin(a), 4);
    }
  }
  if (s >= 3) {
    egg(b, 0.2, 0.06, 0.04, 0.05, FARM.eggBrown, undefined, 0);
    egg(b, 0.3, 0.06, 0.1, 0.045, FARM.egg, undefined, 0);
    miniChicken(b, 0.25, 0.2, 0.34, 0.1, 1, FARM.egg, true);
    // sawhorse with a log
    for (const sx of [-0.1, 0.1]) b.box(-0.18 + sx, 0, 0.28, 0.04, 0.22, 0.2, PAL.timberDark, { jitter: 0.02 });
    b.box(-0.18, 0.2, 0.28, 0.3, 0.04, 0.05, PAL.timber, { jitter: 0.02 });
    b.cyl(-0.05 - 0.15, 0.255, 0.28, 0.05, 0.05, 0.34, PAL.timberLight, 6, { rotZ: PI / 2 });
  }
  if (s >= 4) {
    // tepee tower with a feather tuft
    const tx = -0.5, tz = 0.4;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * PI * 2;
      lean(b, tx + Math.cos(a) * 0.2, 0, tz + Math.sin(a) * 0.2, 0.035, 1.12, i % 2 ? PAL.timber : PAL.timberLight, 0.18, -Math.cos(a), -Math.sin(a), 4);
    }
    b.cyl(tx, 0.28, tz, 0.15, 0.17, 0.04, PAL.hay, 6, { jitter: 0.03 });
    b.cyl(tx, 0.55, tz, 0.1, 0.12, 0.04, PAL.hay, 6, { jitter: 0.03 });
    for (let i = 0; i < 3; i++) b.cone(tx, 1.06, tz, 0.045, 0.2, FEATHER.wing, 4, { rotZ: (i - 1) * 0.35, jitter: 0 });
    banner(b, 0.3, 0, -0.55, 0.85, c.banner);
  }
};

// ---------------------------------------------------------------- Pebble Pit

/** A-frame tripod of three leaning legs with a pulley wheel at the apex and a fat bucket of pebbles. */
function tripod(b: GeoBuilder, x: number, z: number, H: number, bucketY: number): void {
  const R = 0.22;
  const tilt = Math.atan(R / H), L = Math.hypot(R, H);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * PI * 2 + PI / 2;
    lean(b, x + Math.cos(a) * R, 0.05, z + Math.sin(a) * R * 0.8, 0.032, L, i === 0 ? PAL.timberLight : PAL.timber, tilt, -Math.cos(a), -Math.sin(a) / 0.8, 4);
  }
  const ay = 0.05 + H;
  b.cyl(x, ay, z, 0.07, 0.07, 0.05, PAL.stoneDark, 8, { rotX: PI / 2, jitter: 0 }); // pulley wheel
  b.cyl(x, ay, z, 0.02, 0.02, 0.14, PAL.timberDark, 4, { rotX: PI / 2, jitter: 0 }); // axle
  b.cyl(x, bucketY + 0.1, z + 0.045, 0.012, 0.012, ay - bucketY - 0.1, PAL.ink, 4, { jitter: 0 }); // rope
  b.cyl(x, bucketY, z + 0.045, 0.1, 0.07, 0.12, PAL.timber, 8);
  b.cyl(x, bucketY + 0.07, z + 0.045, 0.102, 0.102, 0.03, PAL.coal, 8, { jitter: 0 });
  b.sphere(x, bucketY + 0.13, z + 0.045, 0.09, PAL.stone, { jitter: 0.06, scale: [1, 0.75, 1] }, 0);
}

export const quarry: Gen = (b, c) => {
  const s = c.stage;
  b.plate(0, 0, 0, 0.62, 0.05, PAL.dirt, 10, { jitter: 0.03 });
  b.plate(0, 0.05, 0.02, 0.4, 0.02, 0xb59468, 10, { jitter: 0.03 });
  lowPebbles(b, -0.3, 0.07, 0.2, 0.16);
  lowPebbles(b, 0.12, 0.07, 0.28, 0.12, PAL.stoneLight);
  lowPebbles(b, 0.45, 0.07, 0.2, 0.1);
  // shovel stuck in the big pile
  lean(b, -0.3, 0.12, 0.22, 0.018, 0.3, PAL.timberDark, 0.25, 1, 0, 4);
  b.box(-0.36, 0.32, 0.22, 0.07, 0.09, 0.02, PAL.stoneDark, { rotZ: 0.25, jitter: 0 });

  const plinth = s >= 3 ? 0.08 : 0;
  if (s >= 1) tripod(b, 0.25, -0.3, [0, 0.74, 0.84, 0.98, 1.12][s]!, s >= 4 ? 0.6 : 0.3);
  if (s >= 2) {
    const wallH = 0.34;
    if (plinth) taperBox(b, -0.37, 0, -0.35, 0.5, plinth, 0.42, PAL.stoneDark, 0.95);
    roundBox(b, -0.37, plinth, -0.35, 0.44, wallH, 0.36, PAL.stoneLight, 0.04);
    softGable(b, -0.37, plinth + wallH, -0.35, 0.36, 0.46, 0.26, c.roof, { rotY: PI / 2 });
    lowDoor(b, -0.37, -0.16, 0.14, 0.24, PAL.timberDark, plinth);
    // sieve on three legs
    for (const [lx, lz] of [[-0.08, 0.06], [0.08, 0.06], [0, -0.08]] as const) b.cyl(-0.02 + lx, 0, 0.0 + lz, 0.02, 0.02, 0.14, PAL.timberDark, 4, { jitter: 0 });
    b.cyl(-0.02, 0.14, 0, 0.14, 0.14, 0.045, FARM.wire, 10, { jitter: 0.03 });
  }
  if (s >= 3) {
    // cart on rails
    for (const z of [0.46, 0.62]) b.box(0.0, 0, z, 0.8, 0.035, 0.035, PAL.stoneDark, { jitter: 0 });
    const cx = 0.25;
    taperBox(b, cx, 0.1, 0.54, 0.3, 0.12, 0.2, PAL.timber, 0.92);
    for (const wx of [-0.09, 0.09]) for (const wz of [0.43, 0.65]) b.cyl(cx + wx, 0.07, wz - 0.015, 0.07, 0.07, 0.03, PAL.timberDark, 6, { rotX: PI / 2, jitter: 0 });
    lowPebbles(b, cx, 0.22, 0.54, 0.1, PAL.stoneLight);
    miniChicken(b, -0.2, 0.0, 0.5, 0.3, 0.95, FARM.egg, true);
  }
  if (s >= 4) {
    // gold-rimmed sign with a stone egg
    b.cyl(-0.6, 0.55, 0.4, 0.125, 0.125, 0.025, PAL.gold, 12, { rotX: PI / 2, jitter: 0, emit: 0.1 });
    eggSign(b, -0.6, 0, 0.45, 1, PAL.stoneLight);
    banner(b, 0.62, 0, -0.52, 0.9, c.banner);
  }
};

// ---------------------------------------------------------------- Golden Roost

/** Emissive gold vein lump set into the face of the mound (angle around Y from +Z, elevation 0..1 up the dome). */
function vein(b: GeoBuilder, mz: number, R: number, H: number, ang: number, el: number, r = 0.045): void {
  const k = Math.sqrt(1 - el * el);
  const x = Math.sin(ang) * R * k, z = mz + Math.cos(ang) * R * k, y = H * el;
  b.sphere(x * 1.02, y, z + (z - mz) * 0.02, r, PAL.gold, { jitter: 0.05, emit: 0.35, scale: [1.3, 0.9, 0.8], rotY: ang }, 0);
}

export const mine: Gen = (b, c) => {
  const s = c.stage;
  const R = [0.5, 0.56, 0.58, 0.6, 0.62][s]!;
  const H = [0.46, 0.66, 0.74, 0.86, 1.02][s]!;
  const mz = -0.1;
  domeRoof(b, 0, 0, mz, R, H, PAL.stone, 10, false);
  domeRoof(b, 0.3, 0, -0.45, 0.26, H * 0.65, PAL.stoneLight, 8, false);
  // arched entrance in a timber frame, cart beside it on rails
  const dz = mz + R * 0.93;
  lowDoor(b, 0, dz, 0.3, 0.36, PAL.coal, 0);
  for (const sg of [-1, 1]) b.cyl(sg * 0.2, 0, dz + 0.03, 0.04, 0.04, 0.34, PAL.timber, 6);
  b.cyl(0.28, 0.36, dz + 0.03, 0.035, 0.035, 0.56, PAL.timberLight, 6, { rotZ: PI / 2 });
  const cx = 0.36;
  for (const x of [cx - 0.1, cx + 0.1]) b.box(x, 0, 0.53, 0.035, 0.03, 0.3, PAL.coal, { jitter: 0 });
  taperBox(b, cx, 0.07, 0.55, 0.3, 0.1, 0.2, PAL.timber, 0.9);
  for (const wx of [-0.14, 0.14]) for (const wz of [0.45, 0.65]) b.cyl(cx + wx, 0.06, wz - 0.012, 0.055, 0.055, 0.024, PAL.coal, 6, { rotX: PI / 2, jitter: 0 });
  const eggs = s >= 3 ? [-0.07, 0, 0.07] : s >= 1 ? [-0.045, 0.045] : [0];
  for (const ex of eggs) egg(b, cx + ex, 0.17, 0.55, s >= 3 ? 0.05 : 0.06, PAL.gold, { emit: 0.28 }, 0);

  if (s >= 1) {
    // timber portal: gable hood over the door with a gold egg sign on top, lantern, and gold veins in the rock
    softGable(b, 0, 0.38, dz + 0.02, 0.22, 0.46, 0.13, c.roof, { rotY: PI / 2, over: 0.04 });
    egg(b, 0, 0.55, dz + 0.02, 0.07, PAL.gold, { emit: 0.35 }, 0);
    lantern(b, -0.3, 0.17, dz + 0.1);
    const ve: [number, number][] = [[-0.75, 0.45], [0.7, 0.4], [0.2, 0.75], [-0.3, 0.8]];
    ve.slice(0, s >= 2 ? 4 : 3).forEach(([an, el], i) => vein(b, mz, R, H, an, el, 0.04 + 0.006 * (i % 2)));
  }
  if (s >= 2) {
    // ladder up the right flank to a perch bar
    const lz = [-0.06, 0.12];
    const tx = 0.28, tdz = 0.0 - mz + 0.03;
    const ty = H * Math.sqrt(Math.max(0.05, 1 - (tx / R) ** 2 - (tdz / R) ** 2));
    const bx = Math.sqrt(R * R - tdz * tdz) + 0.06;
    const ang = Math.atan2(bx - tx, ty);
    const len = Math.hypot(bx - tx, ty) + 0.05;
    for (const z of lz) b.box(bx, 0, z, 0.036, len, 0.036, PAL.timberLight, { rotZ: ang, jitter: 0.03 });
    for (let i = 1; i <= 3; i++) {
      const t = (i / 4) * len;
      b.box(bx - Math.sin(ang) * t, Math.cos(ang) * t, (lz[0]! + lz[1]!) / 2, 0.036, 0.036, lz[1]! - lz[0]! + 0.036, PAL.timber, { rotZ: ang, jitter: 0.02 });
    }
    const py = ty + 0.02;
    for (const z of [-0.12, 0.18]) b.cyl(tx - 0.02, py - 0.1, z, 0.03, 0.03, 0.26, PAL.timber, 5, { jitter: 0.02 });
    b.cyl(tx - 0.02, py + 0.16, -0.15, 0.028, 0.028, 0.42, PAL.timberLight, 6, { rotX: PI / 2, jitter: 0.02 });
    // little round hut with a dome roof
    taperBox(b, -0.52, 0, 0.28, 0.3, 0.22, 0.28, PAL.timberLight, 0.94);
    domeRoof(b, -0.52, 0.22, 0.28, 0.2, 0.15, c.roof, 6, false);
    lowDoor(b, -0.52, 0.42, 0.11, 0.17, PAL.timberDark);
  }
  if (s >= 3) {
    // the golden hen on her golden nest at the top of the hill
    nest(b, 0.0, H - 0.05, mz, 0.17, 0, PAL.gold, true);
    miniChicken(b, 0.0, H - 0.0, mz - 0.01, 0, 1.15, 0xe8c27a, true);
    egg(b, -0.1, H, mz + 0.1, 0.045, PAL.gold, { emit: 0.25 }, 0);
    egg(b, 0.1, H, mz + 0.1, 0.045, PAL.gold, { emit: 0.25 }, 0);
  }
  if (s >= 4) {
    // giant golden egg on a pedestal at the front left, clear of the ladder
    b.cyl(-0.42, 0, 0.5, 0.11, 0.12, 0.1, PAL.stoneLight, 8);
    egg(b, -0.42, 0.1, 0.5, 0.12, PAL.gold, { emit: 0.3 });
    banner(b, -0.6, 0, -0.35, 0.9, c.banner);
  }
};
