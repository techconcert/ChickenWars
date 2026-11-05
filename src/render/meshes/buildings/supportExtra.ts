// Nursing Nest (infirmary), docs/10-building-art-brief.md 3.14. Exported through military.ts (index.ts imports it from there).
import { PAL } from '../builder';
import {
  FARM, banner, chimney, domeRoof, lantern, leafSign, miniChicken, nest, roundBox, roundWindow, smokePuff, softGable, warmWindows, type Gen,
} from './parts';
import { bush, doorY, plinth, post, slab } from './militaryExtra';

export const infirmary: Gen = (b, c) => {
  const s = c.stage;
  const pl = s >= 3 ? 0.1 : 0;
  const J = { jitter: 0 };
  if (s === 0) {
    // canopy tent behind a big warm nest
    for (const sx of [-1, 1]) for (const sz of [-0.35, -0.05]) post(b, sx * 0.24, 0, sz, 0.22, 0.035, PAL.timber);
    b.hip(0, 0.2, -0.2, 0.62, 0.52, 0.3, PAL.cream, { jitter: 0.02 });
    nest(b, 0, 0, 0.18, 0.25, 3, FARM.egg, true);
    leafSign(b, 0.5, 0, 0.42, 1.0);
    return;
  }
  const wl = 0.38;
  if (s >= 3) plinth(b, 0, -0.25, 0.94, 0.64);
  roundBox(b, 0, pl, -0.25, 0.8, wl, 0.5, PAL.white, 0.045);
  let roofY = pl + wl;
  if (s >= 2) {
    // a green eave band, then the second storey
    slab(b, 0, roofY, -0.25, 0.9, 0.06, 0.6, c.roof);
    const us = s >= 4 ? 0.3 : 0.26;
    roundBox(b, 0, roofY + 0.06, -0.25, 0.62, us, 0.42, PAL.white, 0.045);
    roofY += 0.06 + us;
    warmWindows(b, [-0.18, 0.18], roofY - 0.2, -0.04, 0.1, 0.12);
  }
  const gh = s >= 2 ? 0.26 : 0.32;
  // gable faces the camera: a white triangle with a glowing attic window
  const gz = s >= 2 ? -0.04 : 0.0;
  softGable(b, 0, roofY, -0.25, s >= 2 ? 0.42 : 0.5, s >= 2 ? 0.7 : 0.9, gh, c.roof, {
    rotY: Math.PI / 2, infill: PAL.white, over: 0.06, ridge: s >= 4 ? PAL.gold : undefined,
  });
  roundWindow(b, 0, roofY + 0.12, gz, 0.055, true);
  doorY(b, -0.2, 0.005, 0.2, 0.3, PAL.timber, pl);
  warmWindows(b, [0.2], pl + 0.14, 0.0, 0.12, 0.13);
  // the nest moves to the side
  const nx = 0.45;
  nest(b, nx, 0, 0.4, 0.22, 3, FARM.egg, true);
  if (s >= 3) miniChicken(b, nx, 0.12, 0.4, -0.3, 0.9);
  if (s >= 2) {
    // heat lamp over the nest
    post(b, nx + 0.22, 0, 0.4, 0.5, 0.03, PAL.timberDark);
    b.box(nx + 0.11, 0.5, 0.4, 0.26, 0.03, 0.03, PAL.timberDark, J);
    lantern(b, nx, 0.34, 0.4);
    // herb bed
    slab(b, -0.42, 0, 0.58, 0.34, 0.06, 0.2, PAL.soil, { jitter: 0.06 });
    for (let i = 0; i < 3; i++) bush(b, -0.52 + i * 0.1, 0.58, 0.05, i % 2 ? FARM.sage : 0x5f9a4e);
  }
  // the sign stands left of the door; from stage 3 it moves front centre so the sun-room annex stays visible
  if (s >= 3) leafSign(b, -0.08, 0, 0.7, s >= 4 ? 1.1 : 1.0);
  else leafSign(b, -0.6, 0, 0.62, 1.0);
  if (s >= 3) {
    // sun-room annex: glass cylinder with a dome
    b.cyl(-0.54, 0, 0.2, 0.17, 0.17, 0.3, PAL.glass, 10, { emit: 0.3, jitter: 0 });
    domeRoof(b, -0.54, 0.3, 0.2, 0.21, 0.2, c.roof, 8);
  }
  if (s >= 4) {
    chimney(b, 0.2, roofY + 0.04, -0.4, 0.3);
    smokePuff(b, 0.19, roofY + 0.38, -0.4, 0.8);
    banner(b, 0.68, 0, -0.1, 0.9, c.banner);
  }
};
