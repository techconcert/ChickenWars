// ChickenWars unit figures: plump chickens (player, allies) and the humans they fight. Chunky, rounded, a few facets only for
// beaks, combs, tools. Everything faces +Z; y is the base of the figure. Used by units.ts (buildUnitMesh).
import { GeoBuilder, PAL } from './builder';

export const FEATHER = { white: 0xf4f0e6, wing: 0xe4dfd0, tail: 0xcfc6b0, red: 0xd2423a, beak: 0xe9b64a, leg: 0xe3a93a };
/** Body base height: real chickens sit low on short shanks, so the body hangs just above the feet. */
export const CHICK_Y0 = 0.07;
const PINK = { body: 0xf0a8b4, dark: 0xd98a99, snout: 0xe58b9c, hoof: 0x5a3a36 };

/** Plump chicken: egg body, round head, comb, beak, wattle, wings, tail feathers. `tint` colours a scarf so teams read apart. */
export function chickenBody(b: GeoBuilder, tint: number, y0 = CHICK_Y0, s = 1, plumage = FEATHER.white): void {
  b.sphere(0, y0 + 0.2 * s, -0.01 * s, 0.16 * s, plumage, { scale: [0.95, 0.95, 1.2], jitter: 0.02 }, 1); // body
  b.sphere(0, y0 + 0.4 * s, 0.1 * s, 0.1 * s, plumage, { jitter: 0.02 }, 1); // head
  for (let i = -1; i <= 1; i++) b.sphere(0, y0 + (0.5 - Math.abs(i) * 0.02) * s, (0.1 + i * 0.04) * s, 0.03 * s, FEATHER.red, { scale: [0.7, 1.2, 0.9], jitter: 0 }, 0); // comb
  b.cone(0, y0 + 0.4 * s, 0.2 * s, 0.035 * s, 0.09 * s, FEATHER.beak, 4, { rotX: Math.PI / 2, jitter: 0 }); // beak
  b.sphere(0, y0 + 0.33 * s, 0.19 * s, 0.022 * s, FEATHER.red, { scale: [0.8, 1.4, 0.8], jitter: 0 }, 0); // wattle
  for (const sx of [-1, 1]) {
    b.box(sx * 0.07 * s, y0 + 0.43 * s, 0.17 * s, 0.022 * s, 0.026 * s, 0.014 * s, PAL.coal, { jitter: 0 }); // eyes
    b.sphere(sx * 0.15 * s, y0 + 0.2 * s, -0.02 * s, 0.07 * s, FEATHER.wing, { scale: [0.35, 0.9, 1.2], rotZ: sx * 0.15, jitter: 0.02 }, 0); // wings
  }
  for (let i = -1; i <= 1; i++) b.cone(i * 0.04 * s, y0 + 0.27 * s, -0.2 * s, 0.035 * s, 0.17 * s, i ? FEATHER.wing : FEATHER.tail, 4, { rotX: -0.9, rotZ: i * 0.3, jitter: 0 }); // tail
  b.box(0, y0 + 0.3 * s, 0.075 * s, 0.1 * s, 0.03 * s, 0.07 * s, tint, { jitter: 0 }); // scarf in team colour
}

/** Thin yellow chicken leg that hangs from a hip pivot at the top, with three toes. */
export function chickenLeg(len = 0.09, r = 0.03): GeoBuilder {
  const b = new GeoBuilder(5);
  b.ao = false;
  const k = r / 0.03; // toe size follows the shank thickness (and so the unit scale)
  b.cyl(0, -len, 0, r, r * 0.9, len, FEATHER.leg, 5, { jitter: 0.02 });
  for (const a of [-0.5, 0, 0.5]) b.box(Math.sin(a) * 0.04 * k, -len, 0.045 * k, 0.022 * k, 0.014 * k, 0.085 * k, FEATHER.leg, { rotY: a, jitter: 0 });
  return b;
}

/** Pitchfork chick: colander helmet, pitchfork, pot-lid shield. */
export function chickenInfantry(b: GeoBuilder, tint: number, s = 1, y0 = CHICK_Y0): void {
  chickenBody(b, tint, y0, s);
  b.sphere(0, y0 + 0.47 * s, 0.09 * s, 0.108 * s, PAL.stoneLight, { scale: [1, 0.7, 1], jitter: 0.02 }, 1); // colander
  for (const [x, z] of [[-0.04, 0.12], [0.04, 0.12], [0, 0.16], [0, 0.05]] as const) b.cyl(x * s, y0 + 0.52 * s, z * s, 0.006 * s, 0.006 * s, 0.02 * s, PAL.stoneDark, 4, { jitter: 0 }); // holes
  b.cyl(0.2 * s, 0, 0.08 * s, 0.012 * s, 0.012 * s, y0 + 0.62 * s, PAL.timberLight, 5, { jitter: 0 }); // fork handle
  for (const dx of [-0.035, 0, 0.035]) b.cone(0.2 * s + dx * s, y0 + 0.62 * s, 0.08 * s, 0.01 * s, 0.1 * s, PAL.stoneLight, 4, { jitter: 0 }); // prongs
  b.box(0.2 * s, y0 + 0.62 * s, 0.08 * s, 0.1 * s, 0.015 * s, 0.015 * s, PAL.stoneLight, { jitter: 0 });
  b.cyl(-0.2 * s, y0 + 0.18 * s, 0.07 * s, 0.1 * s, 0.1 * s, 0.025 * s, PAL.stoneLight, 10, { rotX: Math.PI / 2, jitter: 0 }); // pot lid
  b.sphere(-0.2 * s, y0 + 0.18 * s, 0.1 * s, 0.025 * s, tint, { jitter: 0 }, 0);
}

/** Egg slinger: team cap, a sling with an egg, a basket of eggs on the back. */
export function chickenArcher(b: GeoBuilder, tint: number, s = 1, y0 = CHICK_Y0): void {
  chickenBody(b, tint, y0, s);
  b.cone(0, y0 + 0.49 * s, 0.07 * s, 0.1 * s, 0.1 * s, tint, 7, { rotX: 0.3, jitter: 0.02 }); // cap
  b.box(0, y0 + 0.47 * s, 0.17 * s, 0.1 * s, 0.015 * s, 0.07 * s, tint, { jitter: 0 }); // peak
  b.cyl(0, y0 + 0.2 * s, -0.19 * s, 0.07 * s, 0.09 * s, 0.1 * s, PAL.thatch, 8, { jitter: 0.03 }); // basket
  for (const dx of [-0.03, 0.03]) b.sphere(dx * s, y0 + 0.31 * s, -0.19 * s, 0.035 * s, FEATHER.white, { scale: [0.85, 1.1, 0.85], jitter: 0.02 }, 1);
  b.cyl(-0.19 * s, y0 + 0.22 * s, 0.1 * s, 0.006 * s, 0.006 * s, 0.22 * s, PAL.timberLight, 4, { rotX: 0.7, jitter: 0 }); // sling strap
  b.sphere(-0.19 * s, y0 + 0.34 * s, 0.17 * s, 0.045 * s, FEATHER.white, { scale: [0.85, 1.1, 0.85], jitter: 0.02 }, 1); // the egg
}

/** Hero chicken: bigger, golden comb crown, cape, golden spur sword and medal. */
export function chickenHero(b: GeoBuilder, tint: number): void {
  const s = 1.2, y0 = CHICK_Y0 * s;
  chickenBody(b, tint, y0, s, 0xfff7e0);
  b.box(0, y0 + 0.04 * s, -0.17 * s, 0.3 * s, 0.34 * s, 0.025 * s, tint, { jitter: 0, rotX: 0.15 }); // cape
  b.box(0, y0 + 0.34 * s, -0.14 * s, 0.3 * s, 0.03 * s, 0.03 * s, PAL.gold, { jitter: 0 });
  for (let i = -1; i <= 1; i++) b.cone(i * 0.045 * s, y0 + 0.5 * s, 0.1 * s, 0.025 * s, 0.07 * s, PAL.gold, 4, { jitter: 0, emit: 0.1 }); // crown
  b.cyl(0, y0 + 0.48 * s, 0.1 * s, 0.1 * s, 0.1 * s, 0.03 * s, PAL.gold, 8, { jitter: 0, emit: 0.1 });
  b.sphere(0, y0 + 0.24 * s, 0.17 * s, 0.03 * s, PAL.gold, { jitter: 0, emit: 0.1 }, 0); // medal
  b.box(0.2 * s, y0 + 0.1 * s, 0.1 * s, 0.025 * s, 0.36 * s, 0.025 * s, PAL.stoneLight, { jitter: 0, rotX: -0.3 }); // spur sword
  b.box(0.2 * s, y0 + 0.08 * s, 0.09 * s, 0.1 * s, 0.025 * s, 0.03 * s, PAL.gold, { jitter: 0 });
}

/** Piglet the Piglet Riders sit on: pink ellipsoid body, snout, floppy ears, curly tail. */
export function pigBody(b: GeoBuilder, saddle: number): void {
  b.sphere(0, 0.3, 0, 0.17, PINK.body, { scale: [1, 0.85, 1.55], jitter: 0.03 }, 1);
  b.sphere(0, 0.34, 0.27, 0.12, PINK.body, { scale: [0.95, 0.95, 1], jitter: 0.03 }, 1); // head
  b.cyl(0, 0.3, 0.37, 0.055, 0.06, 0.07, PINK.snout, 8, { rotX: Math.PI / 2, jitter: 0.02 }); // snout
  for (const sx of [-1, 1]) {
    b.cone(sx * 0.07, 0.42, 0.26, 0.04, 0.09, PINK.dark, 4, { rotZ: sx * 0.6, rotX: 0.4, jitter: 0 }); // ears
    b.box(sx * 0.05, 0.37, 0.35, 0.02, 0.025, 0.015, PAL.coal, { jitter: 0 }); // eyes
    b.box(sx * 0.02, 0.3, 0.405, 0.012, 0.018, 0.01, PINK.hoof, { jitter: 0 }); // nostrils
  }
  b.cyl(0, 0.3, -0.3, 0.018, 0.018, 0.1, PINK.dark, 5, { rotX: -1.2, jitter: 0 }); // tail
  b.sphere(0, 0.4, -0.33, 0.025, PINK.dark, { jitter: 0 }, 0);
  b.box(0, 0.425, -0.02, 0.26, 0.025, 0.28, saddle, { jitter: 0 }); // saddle blanket in team colour
}

export function pigLeg(): GeoBuilder {
  const b = new GeoBuilder(6);
  b.ao = false;
  b.cyl(0, -0.2, 0, 0.045, 0.04, 0.2, PINK.body, 6, { jitter: 0.02 });
  b.box(0, -0.2, 0, 0.08, 0.035, 0.08, PINK.hoof, { jitter: 0 });
  return b;
}

/** Hay bale roller: a wooden cart pushing a big round hay bale. */
export function hayRoller(b: GeoBuilder, tint: number): void {
  b.box(0, 0.1, -0.05, 0.5, 0.04, 0.8, PAL.timberDark);
  for (const sx of [-1, 1]) b.box(sx * 0.24, 0.14, 0, 0.04, 0.28, 0.7, PAL.timber);
  b.cyl(0, 0.3, 0.08, 0.2, 0.2, 0.44, PAL.hay, 12, { rotZ: Math.PI / 2, jitter: 0.05 }); // the bale
  for (const dz of [-0.12, 0, 0.12]) b.cyl(0, 0.3, 0.08 + dz, 0.205, 0.205, 0.02, PAL.thatch, 12, { rotZ: Math.PI / 2, jitter: 0 }); // twine
  b.box(0, 0.46, -0.3, 0.3, 0.05, 0.1, tint); // team banner board
  b.cyl(0, 0.14, -0.38, 0.012, 0.012, 0.25, PAL.timberLight, 5, { rotX: -0.6, jitter: 0 }); // push handle
}

/** Egg catapult: a wooden frame, a bucket arm and a giant egg. */
export function eggCatapult(b: GeoBuilder, tint: number): void {
  b.box(0, 0.1, 0, 0.5, 0.06, 0.8, PAL.timberDark);
  for (const sx of [-1, 1]) {
    b.box(sx * 0.2, 0.14, 0.15, 0.05, 0.36, 0.05, PAL.timber, { rotX: -0.3 });
    b.box(sx * 0.2, 0.14, -0.15, 0.05, 0.36, 0.05, PAL.timber, { rotX: 0.3 });
  }
  b.cyl(0, 0.38, 0, 0.04, 0.04, 0.5, PAL.timberDark, 6, { rotZ: Math.PI / 2 });
  b.box(0, 0.38, -0.2, 0.06, 0.06, 0.7, PAL.timberLight, { rotX: -0.35, jitter: 0 }); // arm
  b.cyl(0, 0.46, 0.26, 0.09, 0.06, 0.07, tint, 8, { jitter: 0 }); // bucket
  b.sphere(0, 0.56, 0.27, 0.08, FEATHER.white, { scale: [0.85, 1.15, 0.85], jitter: 0.02 }, 1); // giant egg
  b.box(0, 0.22, -0.34, 0.2, 0.14, 0.12, PAL.hay); // hay counterweight
}

// ---- humans (the enemy) ----

const OVERALLS = 0x4a6f9a, FLANNEL = 0xb3453c, STRAW = 0xe0c060;
function human(b: GeoBuilder, shirt: number, y0 = 0.2, s = 1): void {
  b.capsule(0, y0 + 0.17 * s, 0, 0.11 * s, 0.1 * s, shirt, { jitter: 0.02 });
  b.box(0, y0 + 0.12 * s, 0, 0.23 * s, 0.14 * s, 0.19 * s, OVERALLS, { jitter: 0 });
  b.sphere(0, y0 + 0.47 * s, 0, 0.115 * s, PAL.skin, { jitter: 0.01 }, 1);
  b.box(-0.04 * s, y0 + 0.47 * s, 0.1 * s, 0.025 * s, 0.03 * s, 0.02 * s, PAL.coal, { jitter: 0 });
  b.box(0.04 * s, y0 + 0.47 * s, 0.1 * s, 0.025 * s, 0.03 * s, 0.02 * s, PAL.coal, { jitter: 0 });
  for (const sx of [-1, 1]) b.capsule(sx * 0.15 * s, y0 + 0.2 * s, 0, 0.04 * s, 0.1 * s, shirt, { rotZ: sx * 0.25, jitter: 0.02 });
}

/** Angry farmer: straw hat and a pitchfork. */
export function farmer(b: GeoBuilder, s = 1, y0 = 0.2): void {
  human(b, FLANNEL, y0, s);
  b.cyl(0, y0 + 0.54 * s, 0, 0.2 * s, 0.2 * s, 0.025 * s, STRAW, 10, { jitter: 0.03 }); // hat brim
  b.cyl(0, y0 + 0.56 * s, 0, 0.1 * s, 0.1 * s, 0.07 * s, STRAW, 8, { jitter: 0.03 });
  b.cyl(0.21 * s, y0, 0.05 * s, 0.014 * s, 0.014 * s, 0.7 * s, PAL.timberLight, 5, { jitter: 0 });
  for (const dx of [-0.035, 0, 0.035]) b.cone(0.21 * s + dx * s, y0 + 0.7 * s, 0.05 * s, 0.01 * s, 0.1 * s, PAL.stoneLight, 4, { jitter: 0 });
}

/** Shotgun farmer / hunter. */
export function shotgunner(b: GeoBuilder, s = 1, y0 = 0.2): void {
  human(b, 0x4f6a3c, y0, s);
  b.cyl(0, y0 + 0.54 * s, 0, 0.14 * s, 0.14 * s, 0.03 * s, 0xd47a2a, 8, { jitter: 0 }); // blaze orange cap
  b.cyl(0, y0 + 0.56 * s, 0, 0.1 * s, 0.1 * s, 0.05 * s, 0xd47a2a, 8, { jitter: 0 });
  b.cyl(0.18 * s, y0 + 0.2 * s, 0.15 * s, 0.015 * s, 0.015 * s, 0.5 * s, PAL.coal, 5, { rotX: Math.PI / 2, jitter: 0 }); // barrel
  b.box(0.18 * s, y0 + 0.18 * s, -0.02 * s, 0.04 * s, 0.05 * s, 0.16 * s, PAL.timber, { jitter: 0 }); // stock
}

/** ATV: a boxy quad bike with a farmer on top; wheels are added by the caller. */
export function atv(b: GeoBuilder): void {
  b.box(0, 0.16, 0, 0.3, 0.12, 0.6, 0xb3453c);
  b.box(0, 0.26, -0.05, 0.22, 0.05, 0.3, PAL.coal); // seat
  b.box(0, 0.3, 0.26, 0.34, 0.025, 0.03, PAL.coal); // handlebar
  farmer(b, 0.7, 0.28);
}

/** Tractor for human siege crews. */
export function tractor(b: GeoBuilder): void {
  b.box(0, 0.22, 0.12, 0.34, 0.2, 0.46, 0x3e8a3a);
  b.box(0, 0.4, -0.12, 0.3, 0.3, 0.26, 0x3e8a3a);
  b.box(0, 0.45, -0.12, 0.26, 0.18, 0.22, PAL.glass, { jitter: 0 });
  b.cyl(0.08, 0.42, 0.3, 0.025, 0.025, 0.2, PAL.coal, 5, { jitter: 0 }); // exhaust
  b.box(0, 0.12, 0.44, 0.34, 0.05, 0.08, PAL.stoneDark, { jitter: 0 }); // plough bar
}
