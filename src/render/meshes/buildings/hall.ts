import { GeoBuilder, PAL, type Col } from '../builder';
import { FEATHER } from '../chickens';
import {
  FARM, LOW_COMB, LOW_FENCE, barnRoof, comb, domeRoof, egg, eggSign, flag, miniChicken, nest, picketFence, pyramid, roundBox, softGable, taperBox,
  weathervaneRooster, type Gen,
} from './parts';

const G = 0.12; // top of the dais
const GOLD_J = { jitter: 0, emit: 0.1 } as const;

/** Build `fn` on a scratch builder and lift it by `y` (parts that always start at y = 0, e.g. fences). */
function lift(b: GeoBuilder, y: number, fn: (s: GeoBuilder) => void): void {
  const s = new GeoBuilder(11);
  s.ao = b.ao;
  fn(s);
  b.append(GeoBuilder.transformed(s, 0, y, 0, 0));
}

/** Round porthole (hall and house only; combs, fences, nests, vanes and domes are the shared parts): dark frame + (lit) pane, 6 or 8 sided. */
export function cWin(b: GeoBuilder, x: number, y: number, z: number, r: number, lit: boolean, frame = true): void {
  const seg = r < 0.08 ? 6 : 8;
  if (frame) b.cyl(x, y, z - 0.005, r + 0.025, r + 0.025, 0.03, PAL.timberDark, seg, { rotX: Math.PI / 2, jitter: 0 });
  b.cyl(x, y, z + 0.012, r, r, 0.03, lit ? FARM.warm : PAL.glass, seg, { rotX: Math.PI / 2, emit: lit ? 0.85 : 0.35, jitter: 0 });
}

/** Arched door: slab + half-round top + step. 56 tris. */
export function cDoor(b: GeoBuilder, x: number, z: number, w: number, h: number, y0: number): void {
  b.box(x, y0, z, w, h - w / 2, 0.04, PAL.timberDark, { jitter: 0 });
  b.cyl(x, y0 + h - w / 2, z - 0.02, w / 2, w / 2, 0.04, PAL.timberDark, 8, { rotX: Math.PI / 2, jitter: 0 });
  taperBox(b, x, y0, z + 0.05, w + 0.1, 0.04, 0.1, PAL.stoneLight, 0.9, { jitter: 0 });
}

/** Cheap team pennant on a pole. */
export function pennant(b: GeoBuilder, x: number, y0: number, z: number, h: number, col: Col): void {
  b.cyl(x, y0, z, 0.027, 0.032, h, PAL.timber, 5, { jitter: 0 });
  b.box(x, y0 + h - 0.27, z, 0.16, 0.26, 0.025, col, { jitter: 0 });
  b.box(x, y0 + h - 0.03, z, 0.2, 0.03, 0.03, PAL.timberDark, { jitter: 0 });
}

/** Grand Coop: 5 stages (L1-4, 5-9, 10-14, 15-19, 20-24) plus a gilded L25 flourish (stage 5). The gable is a chicken face. */
export const hall: Gen = (b, c) => {
  const s = c.stage;
  const gold = s >= 5;
  const ridgeCol = s >= 4 ? PAL.gold : undefined;
  const combCol = gold ? PAL.gold : FEATHER.red;
  // courtyard dais: stone hex plinth with a trim ring
  b.cyl(0, 0, 0, 0.98, 1.0, 0.09, PAL.stoneLight, 6, { jitter: 0 });
  b.cyl(0, 0.09, 0, 0.86, 0.9, 0.03, PAL.stone, 6, { jitter: 0 });

  if (s <= 1) {
    smallCoop(b, c);
    return;
  }

  // ---- stages 2..5: barn with wings, silos, cupola ----
  const P = s >= 3 ? 0.1 : 0; // stone plinth under the barn
  const base = G + P;
  const wallH = [0, 0, 0.58, 0.58, 0.64, 0.64][s]!;
  const roofH = [0, 0, 0.62, 0.5, 0.58, 0.58][s]!;
  const wt = base + wallH; // wall top
  const cream = PAL.cream;
  if (P > 0) taperBox(b, 0, G, -0.1, 1.15, P, 0.92, PAL.stoneLight, 0.96);
  if (s <= 3) roundBox(b, 0, base, -0.1, 1.0, wallH, 0.8, cream);
  else taperBox(b, 0, base, -0.1, 1.0, wallH, 0.8, cream, 0.97);
  taperBox(b, 0, base + 0.26, -0.1, 1.04, 0.04, 0.84, PAL.timber, 1, { jitter: 0 });
  const ridge = barnRoof(b, 0, wt, -0.1, 0.8, 1.0, roofH, c.roof, { rotY: Math.PI / 2, infill: cream, ridge: ridgeCol });
  const faceZ = 0.39; // the barn gable face sits 0.09 proud of the wall (roof overhang)

  // chicken face on the gable: two lit round windows, beak awning, comb
  cWin(b, -0.2, wt + 0.15, faceZ, 0.07, true);
  cWin(b, 0.2, wt + 0.15, faceZ, 0.07, true);
  pyramid(b, 0, wt - 0.02, faceZ - 0.01, 0.1, 0.17, FEATHER.beak, 4, { rotX: Math.PI / 2, jitter: 0 });
  b.box(0, wt + roofH * 0.46, faceZ + 0.005, 0.2, 0.18, 0.02, PAL.timberDark, { jitter: 0 }); // hay-loft door
  comb(b, 0, ridge - 0.02, 0.3, 1.4, false, { ...LOW_COMB, col: combCol });
  cDoor(b, 0, 0.3, 0.24, 0.3, base);
  for (const sx of [-1, 1]) pennant(b, sx * 0.3, base, 0.36, 0.6, c.banner);

  // side wings (second storey from stage 4)
  const wingH = 0.38;
  for (const sx of [-1, 1]) {
    const wx = sx * 0.66;
    taperBox(b, wx, G, -0.05, 0.34, wingH, 0.6, cream, 0.96);
    let wy = G + wingH;
    if (s >= 4) {
      taperBox(b, wx, wy, -0.05, 0.3, 0.3, 0.54, cream, 0.96);
      wy += 0.3;
    } else cWin(b, wx, G + 0.22, 0.25, 0.055, false, false);
    if (gold) taperBox(b, wx, wy - 0.025, -0.05, 0.37, 0.04, 0.63, PAL.gold, 1, GOLD_J);
    softGable(b, wx, wy, -0.05, 0.34, 0.6, 0.26, c.roof, { infill: cream, ridge: ridgeCol });
  }

  // silos
  const silo = (x: number, h: number): void => {
    b.cyl(x, G, -0.45, 0.17, 0.19, h, cream, 8, { smooth: true, jitter: 0.02 });
    b.cyl(x, G + h * 0.45, -0.45, 0.2, 0.2, 0.04, FARM.barnRedDark, 6, { jitter: 0 });
    domeRoof(b, x, G + h, -0.45, 0.2, 0.16, c.roof, 8, true, { rings: 2, lipCol: gold ? PAL.gold : undefined });
  };
  silo(0.58, s >= 4 ? 1.0 : 0.9);
  if (s >= 3) silo(-0.58, s >= 4 ? 0.9 : 0.75);

  // cupola on the ridge (stage 3+)
  if (s >= 3) {
    const cy = ridge - 0.03;
    taperBox(b, 0, cy, -0.1, 0.24, 0.18, 0.24, PAL.white, 0.95);
    b.box(0, cy + 0.04, 0.025, 0.14, 0.09, 0.012, PAL.coal, { jitter: 0 });
    b.hip(0, cy + 0.17, -0.1, 0.34, 0.34, 0.14, gold ? PAL.gold : c.roof, gold ? GOLD_J : { jitter: 0.02 });
    const cupTop = cy + 0.31;
    if (gold) egg(b, 0, cupTop + 0.02, -0.1, 0.13, PAL.gold, { emit: 0.25 });
    else weathervaneRooster(b, 0, cupTop - 0.03, -0.1, 0.8, PAL.gold, true);
  }

  // yard: fence, nest, hens
  if (s >= 3) {
    const fx = s >= 4 ? 0.55 : 0.72;
    const fz = (x: number): number => 0.9 - x * 0.5774; // inset along the hex dais front edge
    lift(b, G, (f) => {
      picketFence(f, -fx, fz(fx), -0.18, fz(0.18), 0.2, PAL.white, LOW_FENCE);
      picketFence(f, 0.18, fz(0.18), fx, fz(fx), 0.2, PAL.white, LOW_FENCE);
    });
    if (s === 3) nest(b, -0.4, G, 0.5, 0.09, 3, FARM.egg, true);
    miniChicken(b, 0.45, G, 0.5, -0.4);
  }
  if (s >= 4) {
    miniChicken(b, 0, G, 0.8, 0.2, 1, FARM.eggBrown);
    for (const sx of [-1, 1]) {
      const tx = sx * 0.66, tz = 0.38;
      b.cyl(tx, G, tz, 0.14, 0.16, 0.62, cream, 8, { smooth: true, jitter: 0.02 });
      cWin(b, tx, G + 0.42, tz + 0.15, 0.055, true, false);
      domeRoof(b, tx, G + 0.62, tz, 0.19, 0.17, c.roof, 8, true, { rings: 2, lipCol: gold ? PAL.gold : undefined });
      if (gold) for (const dx of [-0.05, 0.05]) b.sphere(tx + dx, G + 0.84, tz, 0.06, PAL.gold, { scale: [0.8, 1.2, 0.9], ...GOLD_J, smooth: true }, 0);
    }
  } else {
    if (s <= 2) eggSign(b, 0.66, G, 0.42, 0.8);
  }

  if (gold) {
    taperBox(b, 0, wt - 0.03, -0.1, 1.05, 0.03, 0.85, PAL.gold, 1, GOLD_J);
    b.cyl(0, G, 0.86, 0.13, 0.14, 0.12, PAL.stoneLight, 6, { jitter: 0 });
    egg(b, 0, G + 0.12, 0.86, 0.08, PAL.gold, { emit: 0.25 }, 0);
  }
};

/** Stages 0 and 1: the Big Coop and the Coop with a nest wing. Gable ends face +Z. */
function smallCoop(b: GeoBuilder, c: { stage: number; roof: number; banner: number }): void {
  const s = c.stage;
  const hw = s === 0 ? 0.9 : 0.92, dd = s === 0 ? 0.7 : 0.72;
  const wallH = s === 0 ? 0.43 : 0.5;
  const wt = G + wallH;
  const fz = -0.1 + dd / 2; // front gable plane
  if (s === 0) {
    taperBox(b, 0, G, -0.1, hw, wallH, dd, PAL.timberLight, 0.93);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(sx * 0.44, G, -0.1 + sz * 0.34, 0.04, 0.04, wallH, PAL.timber, 6);
  } else {
    roundBox(b, 0, G, -0.1, hw, wallH, dd, PAL.cream);
    taperBox(b, 0, G + 0.24, -0.1, hw + 0.04, 0.04, dd + 0.04, PAL.timber, 1, { jitter: 0 });
  }
  const roofH = s === 0 ? 0.36 : 0.46;
  const ridge = softGable(b, 0, wt, -0.1, dd, hw, roofH, s === 0 ? PAL.thatch : c.roof, {
    rotY: Math.PI / 2, infill: s === 0 ? PAL.timberLight : PAL.cream,
  });
  // chicken face
  const ex = s === 0 ? 0.15 : 0.16;
  cWin(b, -ex, wt + (s === 0 ? 0.07 : 0.1), fz, 0.07, true);
  cWin(b, ex, wt + (s === 0 ? 0.07 : 0.1), fz, 0.07, true);
  b.cone(0, wt - 0.06, fz - 0.03, 0.11, 0.18, FEATHER.beak, 4, { rotX: Math.PI / 2, jitter: 0 });
  cDoor(b, 0, fz - 0.015, 0.22, 0.27, G);
  comb(b, 0, ridge - 0.02, fz + 0.02, 1.4, false, LOW_COMB);
  if (s === 0) {
    taperBox(b, -0.55, G, 0.4, 0.2, 0.14, 0.15, PAL.hay, 0.9, { rotY: 0.2, jitter: 0.06 });
    taperBox(b, 0.55, G, 0.4, 0.2, 0.14, 0.15, PAL.hay, 0.9, { rotY: -0.2, jitter: 0.06 });
    flag(b, 0, ridge - 0.03, -0.3, 0.3, c.banner);
  } else {
    // nest wing on the left
    taperBox(b, -0.62, G, -0.05, 0.34, 0.32, 0.56, PAL.timberLight, 0.96);
    b.shed(-0.62, G + 0.32, -0.05, 0.44, 0.66, 0.16, c.roof);
    for (const px of [-0.715, -0.62, -0.525]) b.cyl(px, G + 0.13, 0.225, 0.04, 0.04, 0.02, PAL.coal, 6, { rotX: Math.PI / 2, jitter: 0 });
    egg(b, -0.62, G + 0.1, 0.235, 0.035);
    weathervaneRooster(b, 0, ridge - 0.03, -0.3, 0.85, PAL.gold, true);
    flag(b, -0.72, G + 0.42, -0.25, 0.3, c.banner);
    eggSign(b, 0.62, G, 0.42, 0.8);
    taperBox(b, 0.5, G, 0.58, 0.17, 0.12, 0.13, PAL.hay, 0.9, { rotY: 0.3, jitter: 0.06 });
  }
}
