// Town life (D51): outskirts chicks. A few chicks leave the coops for a random grass spot just past the territory border,
// play there for a few seconds (hop, peck, run in circles, tumble, flap), run home to the nearest house / Grand Coop,
// mingle, and go out again later. They sleep at night like the other chicks. Render-only, no allocations per frame.
import { hexDistance, SQ3, worldToCell } from '../../../gen/hex';
import { BASE_GRASS } from '../../../gen/base/constants';
import { lerpAngle } from '../../view/util';
import { ANIM, ROLE, asleepAt, bedtime, inOutskirtsBand, outskirtsSpot, pushOut, waketime } from '../../view/townLife';
import { MAX_STOPS } from './townLifeData';
import type { TownLife } from './townLife';

/** Task codes for outskirts chicks (stored in `task`, above the civilian TASK ids). */
export const X = { home: 10, out: 11, play: 12, back: 13, sleep: 14 } as const;
const TAU = Math.PI * 2;
const PLAY_MODES = [ANIM.hop, ANIM.peck, ANIM.idle, ANIM.roll, ANIM.flap]; // index 2 = run in small circles

/** Nearest house / Grand Coop front (fk 0 or 1) to (x, z), or -1. */
function homeFront(t: TownLife, x: number, z: number): number {
  let best = -1, bd = 1e9;
  for (let k = 0; k < t.nF; k++) {
    if (t.fk[k] !== 0 && t.fk[k] !== 1) continue;
    const d = (t.fx[k]! - x) ** 2 + (t.fz[k]! - z) ** 2;
    if (d < bd) { bd = d; best = k; }
  }
  return best;
}

function setHome(t: TownLife, i: number): void {
  const k = homeFront(t, t.px[i]!, t.pz[i]!);
  const j = i * MAX_STOPS;
  if (k < 0) { t.rx[j] = t.px[i]!; t.rz[j] = t.pz[i]!; return; }
  t.jitter(k, 1.0, 6);
  t.rx[j] = t.s2[0]!; t.rz[j] = t.s2[1]!;
}

/** A random walkable grass spot in the band just outside the territory; false when the island has none. */
function pickSpot(t: TownLife, i: number): boolean {
  if (t.thCell < 0) return false;
  const R = t.terrR;
  for (let n = 0; n < 12; n++) {
    outskirtsSpot(t.rnd(), t.rnd(), t.thX, t.thZ, 1.5 * (R + 1), SQ3 * (R + 2) + 0.3, t.s2);
    const c = worldToCell(t.grid, t.s2[0]!, t.s2[1]!);
    if (c < 0 || t.terrain[c] !== BASE_GRASS) continue;
    if (!inOutskirtsBand(hexDistance(t.grid.q[t.thCell]!, t.grid.r[t.thCell]!, t.grid.q[c]!, t.grid.r[c]!), R)) continue;
    pushOut(t.s2[0]!, t.s2[1]!, t.obX, t.obZ, t.obR, t.obX.length, 0.2, t.o2);
    if (!t.walkable(t.o2[0]!, t.o2[1]!)) continue;
    t.rx[i * MAX_STOPS] = t.o2[0]!; t.rz[i * MAX_STOPS] = t.o2[1]!;
    return true;
  }
  return false;
}

export function spawnExplorer(t: TownLife, i: number): void {
  t.act[i] = 1;
  t.role[i] = ROLE.chick;
  t.ph[i] = t.rnd() * TAU;
  t.spd[i] = 0.5 + t.rnd() * 0.18;
  t.bed[i] = bedtime(t.rnd()); t.wake[i] = waketime(t.rnd());
  t.hd[i] = t.rnd() * TAU;
  t.leader[i] = -1; t.grp[i] = -1; t.prop[i] = 0; t.sleepK[i] = 0; t.gait[i] = 0; t.hasV[i] = 0; t.stuck[i] = 0;
  const k = homeFront(t, t.thX, t.thZ);
  t.px[i] = k >= 0 ? t.fx[k]! + (t.rnd() - 0.5) * 0.8 : t.thX;
  t.pz[i] = k >= 0 ? t.fz[k]! + 0.2 + t.rnd() * 0.3 : t.thZ;
  t.task[i] = X.home; t.stage[i] = 1; t.timer[i] = 3 + t.rnd() * 9;
  setHome(t, i);
  t.anim[i] = ANIM.idle;
}

function goHome(t: TownLife, i: number, task: number): void {
  t.task[i] = task; t.stage[i] = 0; t.hasV[i] = 0; t.stuck[i] = 0;
  setHome(t, i);
}

export function stepExplorer(t: TownLife, i: number, f: number, dt: number): void {
  const sleepNow = asleepAt(f, t.bed[i]!, t.wake[i]!);
  const tk = t.task[i]!;
  if (sleepNow && tk !== X.sleep) goHome(t, i, X.sleep);
  else if (!sleepNow && tk === X.sleep) { goHome(t, i, X.home); t.timer[i] = 2 + t.rnd() * 6; }
  const j = i * MAX_STOPS;
  const spd = t.spd[i]!;
  switch (t.task[i]) {
    case X.sleep:
    case X.home:
    case X.back: {
      if (t.stage[i] === 0) {
        const r = t.move(i, t.rx[j]!, t.rz[j]!, spd * (t.task[i] === X.home ? 1 : 1.5), dt, 0.07);
        t.anim[i] = ANIM.idle;
        if (r === 1) {
          t.stage[i] = 1;
          if (t.task[i] === X.back) { t.task[i] = X.home; t.timer[i] = 8 + t.rnd() * 10; }
        } else if (r === -1) setHome(t, i);
      } else {
        t.gait[i] = Math.max(0, t.gait[i]! - dt * 6);
        if (t.task[i] === X.sleep) { t.anim[i] = ANIM.sleep; break; }
        t.anim[i] = Math.sin(t.ph[i]! + t.timer[i]! * 1.7) > 0.2 ? ANIM.peck : ANIM.idle;
        t.timer[i] = t.timer[i]! - dt;
        if (t.timer[i]! <= 0) {
          if (pickSpot(t, i)) { t.task[i] = X.out; t.stage[i] = 0; t.hasV[i] = 0; t.stuck[i] = 0; } else t.timer[i] = 5 + t.rnd() * 5;
        }
      }
      break;
    }
    case X.out: {
      const r = t.move(i, t.rx[j]!, t.rz[j]!, spd * 1.35, dt, 0.08);
      t.anim[i] = ANIM.idle;
      if (r === 1) {
        t.task[i] = X.play; t.xcx[i] = t.px[i]!; t.xcz[i] = t.pz[i]!;
        t.timer[i] = 6 + t.rnd() * 5; t.xtimer[i] = 0; t.xmode[i] = Math.floor(t.rnd() * PLAY_MODES.length); t.xang[i] = t.rnd() * TAU;
      } else if (r === -1) goHome(t, i, X.back);
      break;
    }
    case X.play: {
      t.timer[i] = t.timer[i]! - dt;
      t.xtimer[i] = t.xtimer[i]! - dt;
      if (t.xtimer[i]! <= 0) { t.xmode[i] = (t.xmode[i]! + 1 + Math.floor(t.rnd() * 3)) % PLAY_MODES.length; t.xtimer[i] = 1.1 + t.rnd() * 1.3; }
      const a = PLAY_MODES[t.xmode[i]!]!;
      if (t.xmode[i] === 2) {
        t.xang[i] = t.xang[i]! + dt * 2.4;
        t.move(i, t.xcx[i]! + Math.sin(t.xang[i]!) * 0.32, t.xcz[i]! + Math.cos(t.xang[i]!) * 0.32, spd * 2.2, dt, 0.05);
        t.anim[i] = ANIM.idle;
      } else {
        t.gait[i] = Math.max(0, t.gait[i]! - dt * 6);
        t.anim[i] = a;
        t.hd[i] = lerpAngle(t.hd[i]!, t.ph[i]! + t.xang[i]!, 1 - Math.exp(-dt * 2));
      }
      if (t.timer[i]! <= 0) goHome(t, i, X.back);
      break;
    }
    default: goHome(t, i, X.home);
  }
}
