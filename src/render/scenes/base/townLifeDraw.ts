// Town life (D48): writes the instance matrices of one NPC (body, legs, prop) into the shared batches. No allocations.
import type { BaseHeightField } from '../../../gen/base/heightfield';
import { ANIM, ROLE, poseFor } from '../../view/townLife';
import { HIP, LEG_X, type LifeMeshes } from './townLifeMesh';
import type { NpcData } from './townLifeData';

const SCALE = 0.9;
const ROLE_SCALE = [1.15, 0.95, 1.0, 0.52, 1, 1, 0.85];
const PIG_HIP = 0.22;
const ROLE_RGB: number[][] = [[1.0, 0.8, 0.62], [1, 1, 1], [0.86, 0.72, 0.56], [1.0, 0.93, 0.5]];

/** Writes instance matrices for NPC i; returns false when it is outside the camera view (nothing written). */
export function drawNpc(d: NpcData, m: LifeMeshes, hf: BaseHeightField, i: number, time: number, dt: number): boolean {
  const x = d.px[i]!, z = d.pz[i]!;
  const y = hf.heightAt(x, z);
  d.sp.center.set(x, y + 0.3, z);
  if (!d.fr.intersectsSphere(d.sp)) { d.sleepK[i] = d.anim[i] === ANIM.sleep ? 1 : 0; return false; }
  const role = d.role[i]!;
  const s = ROLE_SCALE[role]! * SCALE;
  const sk = d.sleepK[i]! + ((d.anim[i] === ANIM.sleep ? 1 : 0) - d.sleepK[i]!) * Math.min(1, dt * 3);
  d.sleepK[i] = sk;
  const p = poseFor(d.anim[i]!, time, d.ph[i]!, d.pose);
  if (role === ROLE.chick && d.anim[i] === ANIM.idle) p.bob = 0.015 * Math.abs(Math.sin(d.stepPh[i]!)) * d.gait[i]!;
  const gait = d.gait[i]!;
  const bob = p.bob + 0.025 * Math.abs(Math.sin(d.stepPh[i]!)) * gait;
  const hd = d.hd[i]! + p.yaw;
  const oy = y + bob * s - 0.07 * s * sk;
  d.v3.set(x + Math.sin(d.hd[i]!) * p.fwd, oy, z + Math.cos(d.hd[i]!) * p.fwd);
  d.q.setFromEuler(d.e.set(0, hd, 0));
  d.sc.set(s, s * (1 - 0.25 * sk), s);
  d.mR.compose(d.v3, d.q, d.sc);
  // body: pitch around the hips
  const cav = role === ROLE.cavalry;
  const hip = cav ? PIG_HIP : HIP;
  d.mB.copy(d.mR).multiply(d.mA.makeTranslation(0, hip, 0)).multiply(d.mC.makeRotationX(cav ? p.pitch * 0.35 : p.pitch)).multiply(d.mA.makeTranslation(0, -hip, 0));
  if (role === ROLE.infantry) m.inf.push(d.mB);
  else if (role === ROLE.archer) m.arch.push(d.mB);
  else if (cav) m.cav.push(d.mB);
  else { const c = ROLE_RGB[role]!; m.body.push(d.mB, c[0]!, c[1]!, c[2]!); }
  if (cav) {
    const ph = d.stepPh[i]!;
    for (const l of m.cavLimbs) m.cavLegs.push(d.mD.copy(d.mR).multiply(d.mA.makeTranslation(l.x, l.y, l.z)).multiply(d.mC.makeRotationX(Math.sin(ph + l.phase) * l.amp * gait)));
    return true;
  }
  if (sk < 0.5) {
    const sw = Math.sin(d.stepPh[i]!) * 0.75 * gait;
    m.legL.push(d.mD.copy(d.mR).multiply(d.mA.makeTranslation(-LEG_X, HIP, 0)).multiply(d.mC.makeRotationX(sw)));
    m.legR.push(d.mD.copy(d.mR).multiply(d.mA.makeTranslation(LEG_X, HIP, 0)).multiply(d.mC.makeRotationX(-sw)));
    const pr = d.prop[i]!;
    if (pr > 0) {
      const a = d.anim[i]!;
      const sw2 = a === ANIM.chop || a === ANIM.hoe || a === ANIM.dip || a === ANIM.pour ? p.swing : 0.3;
      m.props[pr - 1]!.push(d.mD.copy(d.mB).multiply(d.mA.makeTranslation(0.22, HIP + 0.17, 0.12)).multiply(d.mC.makeRotationX(sw2)).multiply(d.mA.makeScale(1.6, 1.6, 1.6)));
    }
  }
  return true;
}

