// Town life (D48): ambient NPC chickens for the base scene. Pure render-side cosmetics: reads state, never writes it,
// no commands, no sim RNG, no raycast targets. A cheap per-NPC state machine walks between "stops" (waypoints at building
// fronts, pond edge, tree edge); soldiers move in small formations per military building. Typed arrays, no per-frame allocs.
import * as THREE from 'three';
import type { GameState } from '../../../sim/state';
import { neighbours, worldToCell, type HexGrid } from '../../../gen/hex';
import { BASE_FOREST, BASE_GRASS, BASE_WATER } from '../../../gen/base/constants';
import type { BaseHeightField } from '../../../gen/base/heightfield';
import { lerpAngle, type Quality } from '../../view/util';
import { TROOP_LIST } from '../../../sim/data/registry';
import { territoryRadius } from '../../../sim/city/territory';
import { ANIM, CIV_CAP, HAS, PROP, ROLE, TASK, asleepAt, bedtime, bestTroopFor, civRole, dayFrac, explorerCount, fitSizes, formationSize, formationSlot, pickFormationBuildings, pickTask, population, pushOut, waketime } from '../../view/townLife';
import { buildLifeMeshes, type LifeMeshes } from './townLifeMesh';
import { EXP_BASE, MAX_STOPS, N, NpcData, SOL_BASE, type TownLifeStats } from './townLifeData';
import { spawnExplorer, stepExplorer } from './townLifeOut';
import { drawNpc } from './townLifeDraw';
export type { TownLifeStats };

const MIL = new Set(['barracks', 'archery_range', 'stable']);
const CLASS_ROLE: Record<string, number> = { infantry: ROLE.infantry, archer: ROLE.archer, cavalry: ROLE.cavalry };
const LOOP: number[][] = [[-1.0, 0.3], [1.0, 0.3], [1.0, 1.9], [-1.0, 1.9]];

let dayOverride: number | null = null;
/** Dev hook: force the time of day (0..1) or null for the sim clock. */
export function setTownLifeDay(f: number | null): void { dayOverride = f; }

function sortByTown(xs: number[], zs: number[], fs: number[]): void {
  const idx = xs.map((_, i) => i).sort((a, b) => xs[a]! ** 2 + zs[a]! ** 2 - (xs[b]! ** 2 + zs[b]! ** 2));
  const x2 = idx.map((i) => xs[i]!), z2 = idx.map((i) => zs[i]!), f2 = idx.map((i) => fs[i]!);
  for (let i = 0; i < idx.length; i++) { xs[i] = x2[i]!; zs[i] = z2[i]!; fs[i] = f2[i]!; }
}

export class TownLife extends NpcData {
  readonly group: THREE.Group;
  private m: LifeMeshes;
  private rngS: number;
  private quality: Quality;

  constructor(readonly grid: HexGrid, private hf: BaseHeightField, readonly terrain: number[], seed: number, quality: Quality) {
    super();
    this.rngS = (seed ^ 0x5a17c3) >>> 0;
    this.quality = quality;
    this.m = buildLifeMeshes(N);
    this.group = this.m.group;
    this.group.visible = true;
    for (let c = 0; c < terrain.length; c++) {
      const t = terrain[c]!;
      if (t !== BASE_WATER && t !== BASE_FOREST) continue;
      for (const n of neighbours(grid, c)) {
        if (terrain[n] !== BASE_GRASS) continue;
        const x = grid.x[n]! + (grid.x[c]! - grid.x[n]!) * 0.4;
        const z = grid.z[n]! + (grid.z[c]! - grid.z[n]!) * 0.4;
        const f = Math.atan2(grid.x[c]! - grid.x[n]!, grid.z[c]! - grid.z[n]!);
        if (t === BASE_WATER) { this.pondX.push(x); this.pondZ.push(z); this.pondF.push(f); } else { this.treeX.push(x); this.treeZ.push(z); this.treeF.push(f); }
      }
    }
    sortByTown(this.pondX, this.pondZ, this.pondF);
    sortByTown(this.treeX, this.treeZ, this.treeF);
    if (this.pondX.length) this.flags |= HAS.pond;
    if (this.treeX.length) this.flags |= HAS.tree;
    for (let i = 0; i < N; i++) { this.leader[i] = -1; this.grp[i] = -1; }
  }

  setQuality(q: Quality): void { if (q !== this.quality) { this.quality = q; this.sig = -1; } }
  getStats(): TownLifeStats { return this.stats; }
  setVisible(v: boolean): void { this.group.visible = v; }

  rnd(): number {
    this.rngS = (this.rngS + 0x6d2b79f5) >>> 0;
    let t = this.rngS;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  walkable(x: number, z: number): boolean {
    const c = worldToCell(this.grid, x, z);
    return c >= 0 && this.terrain[c] === BASE_GRASS;
  }

  /* ---------------- rebuild points of interest / roster when buildings change ---------------- */

  private rebuild(state: GameState): void {
    this.fx.length = this.fz.length = this.fk.length = 0;
    this.obX.length = this.obZ.length = this.obR.length = 0;
    this.farmX.length = this.farmZ.length = 0;
    let flags = this.flags & (HAS.pond | HAS.tree);
    let nb = 0, lv = 0;
    for (const b of Object.values(state.city.buildings)) {
      if (b.type === 'wall') continue;
      const x = this.grid.x[b.cell]!, z = this.grid.z[b.cell]!;
      const r = b.type === 'town_hall' ? 1.25 : 0.78;
      this.obX.push(x); this.obZ.push(z); this.obR.push(r);
      if (b.level <= 0) continue;
      nb++; lv += b.level;
      const fz = z + r + 0.2;
      let k = 4;
      if (b.type === 'house') k = 0; else if (b.type === 'town_hall') k = 1; else if (b.type === 'farm') k = 2; else if (b.type === 'lumber_camp') k = 3; else if (MIL.has(b.type)) k = 5;
      this.fx.push(x); this.fz.push(fz); this.fk.push(k);
      if (k === 2) { this.farmX.push(x); this.farmZ.push(z); flags |= HAS.farm; }
      if (k === 3) flags |= HAS.lumber;
      if (k === 4 || k === 3 || k === 5) flags |= HAS.work;
    }
    this.nF = this.fx.length;
    this.flags = flags;
    // patrols: one formation per military building TYPE (max 3), showing the best unlocked troop of that building (D51)
    const picked = pickFormationBuildings(Object.values(state.city.buildings));
    const done = state.research.done;
    const maxPer = this.quality === 'low' ? 3 : this.quality === 'medium' ? 4 : 6;
    const troops: { cls: string; size: number }[] = picked.map((b) => {
      const best = bestTroopFor(b.type, b.level, TROOP_LIST, done);
      let owned = 0;
      for (const t of TROOP_LIST) if (t.building === b.type && t.role !== 'enemy') owned += state.troops[t.id]?.healthy ?? 0;
      return { cls: best?.class ?? 'infantry', size: formationSize(owned, maxPer) };
    });
    const pop = population(nb, lv, troops.reduce((a, t) => a + t.size, 0), this.quality);
    const sizes = fitSizes(troops.map((t) => t.size), pop.sol);
    this.nSol = sizes.reduce((a, n) => a + n, 0);
    this.nCiv = pop.civ;
    const oldG = this.gN;
    this.gN = picked.length;
    let first = 0;
    for (let g = 0; g < this.gN; g++) {
      const b = picked[g]!;
      const x = this.grid.x[b.cell]!, z = this.grid.z[b.cell]! + 0.98;
      const moved = g >= oldG || Math.hypot(this.gbx[g]! - x, this.gbz[g]! - z) > 0.01;
      this.gbx[g] = x; this.gbz[g] = z;
      this.grole[g] = CLASS_ROLE[troops[g]!.cls] ?? ROLE.infantry;
      this.gsp[g] = this.grole[g] === ROLE.cavalry ? 1.5 : 1;
      this.gfirst[g] = first;
      this.gcount[g] = sizes[g]!;
      first += sizes[g]!;
      if (g >= oldG) { this.gx[g] = x; this.gz[g] = z + 0.3; this.gh[g] = 0; this.gmode[g] = 1; this.gtimer[g] = 6 + this.rnd() * 8; this.gwp[g] = 0; this.gbed[g] = bedtime(this.rnd()); this.gwake[g] = waketime(this.rnd()); }
      else if (moved) this.gmode[g] = 0;
    }
    for (let i = 0; i < CIV_CAP; i++) {
      const on = i < this.nCiv;
      if (on && !this.act[i]) this.spawnCiv(i);
      if (!on) this.act[i] = 0;
    }
    for (let s = 0; s < EXP_BASE - SOL_BASE; s++) {
      const i = SOL_BASE + s;
      const on = s < this.nSol;
      if (on) {
        let g = 0;
        while (g < this.gN - 1 && s >= this.gfirst[g + 1]!) g++;
        if (!this.act[i]) this.spawnSol(i, g);
        this.grp[i] = g; this.slot[i] = s - this.gfirst[g]!; this.role[i] = this.grole[g]!;
      } else this.act[i] = 0;
    }
    // outskirts chicks
    const th = state.city.buildings[state.city.townHall];
    this.thCell = th ? th.cell : -1;
    this.thX = th ? this.grid.x[th.cell]! : 0; this.thZ = th ? this.grid.z[th.cell]! : 0;
    this.terrR = territoryRadius(state);
    this.nExp = th && nb > 0 ? explorerCount(this.quality) : 0;
    for (let e = 0; e < N - EXP_BASE; e++) {
      const i = EXP_BASE + e;
      const on = e < this.nExp;
      if (on && !this.act[i]) spawnExplorer(this, i);
      if (!on) this.act[i] = 0;
    }
    this.stats.obstacles = this.obX.length;
  }

  private spawnCiv(i: number): void {
    this.act[i] = 1;
    this.role[i] = civRole(i);
    this.ph[i] = this.rnd() * 6.28;
    this.spd[i] = (this.role[i] === ROLE.chick ? 0.5 : 0.55) + this.rnd() * 0.18;
    this.bed[i] = bedtime(this.rnd()); this.wake[i] = waketime(this.rnd());
    this.hd[i] = this.rnd() * 6.28;
    const k = this.nF ? Math.floor(this.rnd() * this.nF) : -1;
    this.px[i] = k >= 0 ? this.fx[k]! + (this.rnd() - 0.5) * 0.8 : 0;
    this.pz[i] = k >= 0 ? this.fz[k]! + 0.2 + this.rnd() * 0.3 : 0;
    this.leader[i] = -1;
    if (this.role[i] === ROLE.chick) for (let j = i - 1; j >= 0; j--) if (civRole(j) === ROLE.hen) { this.leader[i] = j; break; }
    this.task[i] = TASK.wander; this.prop[i] = 0; this.sleepK[i] = 0; this.gait[i] = 0;
    this.planNext(i);
  }

  private spawnSol(i: number, g: number): void {
    this.act[i] = 1;
    this.role[i] = this.grole[g]!;
    this.ph[i] = this.rnd() * 6.28;
    this.px[i] = this.gx[g]! + (this.rnd() - 0.5) * 0.6; this.pz[i] = this.gz[g]! - this.rnd() * 0.5;
    this.hd[i] = 0; this.sleepK[i] = 0; this.gait[i] = 0; this.prop[i] = 0; this.anim[i] = ANIM.idle;
  }

  /* ---------------- planning ---------------- */

  private setStop(i: number, k: number, x: number, z: number, dwell: number, anim: number, face = 99): void {
    const j = i * MAX_STOPS + k;
    this.rx[j] = x; this.rz[j] = z; this.rt[j] = dwell; this.ra[j] = anim; this.rf[j] = face;
  }
  private begin(i: number, task: number, n: number, prop: number): void {
    this.task[i] = task; this.nStops[i] = n; this.stop[i] = 0; this.stage[i] = 0; this.prop[i] = prop; this.stuck[i] = 0; this.hasV[i] = 0;
  }
  /** Random building front (optionally of one kind, -1 = any). Returns index or -1. */
  private frontOf(kind: number): number {
    if (!this.nF) return -1;
    for (let t = 0; t < 6; t++) {
      const k = Math.floor(this.rnd() * this.nF);
      if (kind < 0 || this.fk[k] === kind) return k;
    }
    if (kind >= 0) for (let k = 0; k < this.nF; k++) if (this.fk[k] === kind) return k;
    return -1;
  }
  /** Picks a point biased toward the town (lists are sorted by distance to the Town Hall), nearer to (x, z) among 4 samples. */
  private nearest(xs: number[], zs: number[], x: number, z: number): number {
    let best = -1, bd = 1e9;
    const span = Math.min(xs.length, 16);
    for (let t = 0; t < 4; t++) {
      const r = this.rnd();
      const k = Math.floor(r * r * span);
      const d = (xs[k]! - x) ** 2 + (zs[k]! - z) ** 2;
      if (d < bd) { bd = d; best = k; }
    }
    return best;
  }
  jitter(k: number, spread: number, kind: number): void { // sets s2 to front k plus a random offset, pushed out of footprints
    const x = this.fx[k]! + (this.rnd() - 0.5) * spread, z = this.fz[k]! + (this.rnd() - 0.5) * spread * 0.6 + (kind === 6 ? 0.1 : 0);
    pushOut(x, z, this.obX, this.obZ, this.obR, this.obX.length, 0.12, this.s2);
  }

  private planWander(i: number): void {
    const k = this.frontOf(-1);
    this.begin(i, TASK.wander, 1, PROP.none);
    if (k < 0) { this.setStop(i, 0, this.px[i]!, this.pz[i]!, 2, ANIM.peck); return; }
    this.jitter(k, 1.1, 0);
    this.setStop(i, 0, this.s2[0]!, this.s2[1]!, 2 + this.rnd() * 4, this.rnd() < 0.7 ? ANIM.peck : ANIM.idle);
  }

  private planSleep(i: number): void {
    const k = this.rnd() < 0.5 ? this.frontOf(0) : this.frontOf(1);
    const kk = k >= 0 ? k : this.frontOf(-1);
    this.begin(i, TASK.sleep, 1, PROP.none);
    if (kk < 0) { this.setStop(i, 0, this.px[i]!, this.pz[i]!, 1e9, ANIM.sleep); return; }
    this.jitter(kk, 0.9, 6);
    this.setStop(i, 0, this.s2[0]!, this.s2[1]!, 1e9, ANIM.sleep);
  }

  private plan(i: number, task: number): boolean {
    const x = this.px[i]!, z = this.pz[i]!;
    switch (task) {
      case TASK.water: {
        if (!this.pondX.length) return false;
        const t = this.nearest(this.pondX, this.pondZ, x, z);
        let h = this.frontOf(this.rnd() < 0.5 ? 0 : 2); if (h < 0) h = this.frontOf(-1);
        if (t < 0 || h < 0) return false;
        this.begin(i, task, 2, PROP.bucket);
        this.setStop(i, 0, this.pondX[t]!, this.pondZ[t]!, 2 + this.rnd() * 1.5, ANIM.dip, this.pondF[t]!);
        this.jitter(h, 0.6, 0);
        this.setStop(i, 1, this.s2[0]!, this.s2[1]!, 1.6, ANIM.pour);
        return true;
      }
      case TASK.chop: {
        if (!this.treeX.length) return false;
        const t = this.nearest(this.treeX, this.treeZ, x, z);
        let h = this.frontOf(3); if (h < 0) h = this.frontOf(-1);
        if (t < 0) return false;
        this.begin(i, task, h >= 0 ? 2 : 1, PROP.axe);
        this.setStop(i, 0, this.treeX[t]!, this.treeZ[t]!, 6 + this.rnd() * 4, ANIM.chop, this.treeF[t]!);
        if (h >= 0) { this.jitter(h, 0.6, 0); this.setStop(i, 1, this.s2[0]!, this.s2[1]!, 1.8, ANIM.work); }
        return true;
      }
      case TASK.farm: {
        if (!this.farmX.length) return false;
        const f = Math.floor(this.rnd() * this.farmX.length);
        this.begin(i, task, 2, PROP.hoe);
        const sx = this.rnd() < 0.5 ? -1 : 1;
        this.setStop(i, 0, this.farmX[f]! + sx * 0.72, this.farmZ[f]! + 0.2, 5 + this.rnd() * 3, ANIM.hoe, sx > 0 ? -1.4 : 1.4);
        this.setStop(i, 1, this.farmX[f]! - sx * 0.72, this.farmZ[f]! + 0.5, 5 + this.rnd() * 3, ANIM.hoe, sx > 0 ? 1.4 : -1.4);
        return true;
      }
      case TASK.work: {
        const k = this.frontOf(this.rnd() < 0.6 ? 4 : -1);
        if (k < 0) return false;
        this.begin(i, task, 1, PROP.none);
        this.jitter(k, 0.5, 0);
        this.setStop(i, 0, this.s2[0]!, this.s2[1]!, 4 + this.rnd() * 5, ANIM.work, 0);
        return true;
      }
      case TASK.peck: {
        this.begin(i, task, 1, PROP.none);
        this.setStop(i, 0, x, z, 2 + this.rnd() * 3, ANIM.peck);
        return true;
      }
      default: return false;
    }
  }

  private planNext(i: number): void {
    const t = pickTask(this.role[i]!, this.flags, this.rnd());
    if (t === TASK.wander || !this.plan(i, t)) this.planWander(i);
  }

  /* ---------------- movement ---------------- */

  /**
   * Cheap detour: when the straight segment (x,z)->(tx,tz) cuts a building footprint, set a via point beside the first blocker.
   * No pathfinding, just one tangent waypoint per blocker (re-checked every 0.35 s while walking).
   */
  private route(i: number, tx: number, tz: number): boolean {
    const x = this.px[i]!, z = this.pz[i]!;
    const ax = tx - x, az = tz - z;
    const L2 = ax * ax + az * az;
    if (L2 < 0.09) return false;
    let bt = 2, bk = -1, bpx = 0, bpz = 0;
    for (let k = 0; k < this.obX.length; k++) {
      const r = this.obR[k]! + 0.08;
      const cx = this.obX[k]! - x, cz = this.obZ[k]! - z;
      if (cx * cx + cz * cz < r * r) continue; // already beside / inside it: pushOut slides us
      const t = Math.max(0, Math.min(1, (cx * ax + cz * az) / L2));
      const qx = x + ax * t - this.obX[k]!, qz = z + az * t - this.obZ[k]!;
      if (qx * qx + qz * qz < r * r && t < bt) { bt = t; bk = k; bpx = qx; bpz = qz; }
    }
    if (bk < 0) return false;
    let nx = bpx, nz = bpz;
    const nl = Math.hypot(nx, nz);
    if (nl < 0.05) { nx = -az; nz = ax; const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l; } else { nx /= nl; nz /= nl; }
    const rr = this.obR[bk]! + 0.5;
    for (let side = 0; side < 2; side++) {
      const sx = this.obX[bk]! + nx * rr, sz = this.obZ[bk]! + nz * rr;
      pushOut(sx, sz, this.obX, this.obZ, this.obR, this.obX.length, 0.1, this.o2);
      if (this.walkable(this.o2[0]!, this.o2[1]!)) { this.vx[i] = this.o2[0]!; this.vz[i] = this.o2[1]!; this.hasV[i] = 1; return true; }
      nx = -nx; nz = -nz;
    }
    return false;
  }

  /** Walk NPC i toward (tx,tz). Returns 1 on arrival, -1 when stuck for a while, else 0. Updates gait / step phase. */
  move(i: number, tx0: number, tz0: number, speed: number, dt: number, tol: number): number {
    const x = this.px[i]!, z = this.pz[i]!;
    let tx = tx0, tz = tz0, toVia = false;
    if (this.hasV[i]) {
      if (Math.hypot(this.vx[i]! - x, this.vz[i]! - z) < 0.18) this.hasV[i] = 0; else { tx = this.vx[i]!; tz = this.vz[i]!; toVia = true; }
    }
    if (!this.hasV[i]) {
      this.vt[i] = this.vt[i]! - dt;
      if (this.vt[i]! <= 0) { this.vt[i] = 0.35; if (this.route(i, tx0, tz0)) { tx = this.vx[i]!; tz = this.vz[i]!; toVia = true; } }
    }
    const dx = tx - x, dz = tz - z;
    const d = Math.hypot(dx, dz);
    if (toVia && d < 0.05) { this.hasV[i] = 0; return 0; }
    if (!toVia && d < tol) { this.gait[i] = Math.max(0, this.gait[i]! - dt * 6); return 1; }
    const mv = Math.min(speed * dt, d);
    let nx = x + (dx / d) * mv, nz = z + (dz / d) * mv;
    this.hd[i] = lerpAngle(this.hd[i]!, Math.atan2(dx, dz), 1 - Math.exp(-dt * 9));
    pushOut(nx, nz, this.obX, this.obZ, this.obR, this.obX.length, 0.1, this.o2);
    nx = this.o2[0]!; nz = this.o2[1]!;
    if (!this.walkable(nx, nz)) {
      if (this.walkable(nx, z)) nz = z; else if (this.walkable(x, nz)) nx = x; else { nx = x; nz = z; }
    }
    const moved = Math.hypot(nx - x, nz - z);
    this.px[i] = nx; this.pz[i] = nz;
    this.gait[i] = Math.min(1, this.gait[i]! + dt * 6);
    this.stepPh[i] = this.stepPh[i]! + moved * 11;
    if (moved < mv * 0.3) { this.stuck[i] = this.stuck[i]! + dt; if (this.stuck[i]! > 1.4) { this.stuck[i] = 0; return -1; } } else this.stuck[i] = 0;
    return 0;
  }

  private stepCiv(i: number, f: number, dt: number): void {
    const sleepNow = asleepAt(f, this.bed[i]!, this.wake[i]!);
    if (this.role[i] === ROLE.chick && this.leader[i]! >= 0 && this.act[this.leader[i]!]) { this.stepChick(i, this.leader[i]!, sleepNow, dt); return; }
    if (sleepNow && this.task[i] !== TASK.sleep) this.planSleep(i);
    else if (!sleepNow && this.task[i] === TASK.sleep) { this.prop[i] = 0; this.planNext(i); }
    const j = i * MAX_STOPS + this.stop[i]!;
    if (this.stage[i] === 0) {
      const r = this.move(i, this.rx[j]!, this.rz[j]!, this.spd[i]! * (this.task[i] === TASK.sleep ? 1.3 : 1), dt, 0.07);
      this.anim[i] = ANIM.idle;
      if (r === 1) { this.stage[i] = 1; this.timer[i] = this.rt[j]!; }
      else if (r === -1) this.planWander(i);
    } else {
      this.anim[i] = this.ra[j]!;
      this.gait[i] = Math.max(0, this.gait[i]! - dt * 6);
      const face = this.rf[j]!;
      if (face < 90) this.hd[i] = lerpAngle(this.hd[i]!, face, 1 - Math.exp(-dt * 6));
      if (this.task[i] !== TASK.sleep) {
        this.timer[i] = this.timer[i]! - dt;
        if (this.timer[i]! <= 0) {
          this.stop[i] = this.stop[i]! + 1;
          if (this.stop[i]! >= this.nStops[i]!) this.planNext(i); else this.stage[i] = 0;
        }
      }
    }
  }

  private stepChick(i: number, L: number, sleepNow: boolean, dt: number): void {
    const h = this.hd[L]!;
    const back = 0.3 + 0.1 * (i % 3), side = ((i % 2) * 2 - 1) * (0.14 + 0.04 * (i % 4));
    const tx = this.px[L]! - Math.sin(h) * back + Math.cos(h) * side;
    const tz = this.pz[L]! - Math.cos(h) * back - Math.sin(h) * side;
    const far = Math.hypot(tx - this.px[i]!, tz - this.pz[i]!);
    const r = this.move(i, tx, tz, this.spd[L]! * (far > 0.6 ? 1.5 : 1.05), dt, 0.1);
    if (r === 1) {
      if (this.task[L] === TASK.sleep && this.stage[L] === 1 && sleepNow) this.anim[i] = ANIM.sleep;
      else this.anim[i] = this.stage[L] === 1 ? ANIM.peck : ANIM.idle;
      this.hd[i] = lerpAngle(this.hd[i]!, this.hd[L]!, 1 - Math.exp(-dt * 3));
    } else this.anim[i] = ANIM.idle;
  }

  private stepGroup(g: number, f: number, dt: number): void {
    const sleepNow = asleepAt(f, this.gbed[g]!, this.gwake[g]!);
    if (sleepNow) this.gmode[g] = 2; else if (this.gmode[g] === 2) { this.gmode[g] = 0; this.gtimer[g] = 14; }
    if (this.gmode[g] !== 2) {
      this.gtimer[g] = this.gtimer[g]! - dt;
      if (this.gtimer[g]! <= 0) {
        this.gmode[g] = this.gmode[g] === 0 ? 1 : 0;
        this.gtimer[g] = this.gmode[g] === 0 ? 14 + this.rnd() * 6 : 11 + this.rnd() * 5;
        if (this.gmode[g] === 0) this.gform[g] = this.rnd() < 0.5 ? 0 : 1;
      }
    }
    let tx = this.gbx[g]!, tz = this.gbz[g]! - 0.1, sp = 0.8;
    let th = 0;
    if (this.gmode[g] === 0) {
      const w = LOOP[this.gwp[g]!]!;
      tx = this.gbx[g]! + w[0]!; tz = this.gbz[g]! + w[1]!; sp = 0.5;
      if (Math.hypot(tx - this.gx[g]!, tz - this.gz[g]!) < 0.15) this.gwp[g] = (this.gwp[g]! + 1) % 4;
      th = Math.atan2(tx - this.gx[g]!, tz - this.gz[g]!);
    } else if (this.gmode[g] === 1) { tz = this.gbz[g]! + 0.7; }
    const dx = tx - this.gx[g]!, dz = tz - this.gz[g]!, d = Math.hypot(dx, dz);
    if (d > 0.03) {
      const mv = Math.min(sp * dt, d);
      pushOut(this.gx[g]! + (dx / d) * mv, this.gz[g]! + (dz / d) * mv, this.obX, this.obZ, this.obR, this.obX.length, 0.3, this.o2);
      if (this.walkable(this.o2[0]!, this.o2[1]!)) { this.gx[g] = this.o2[0]!; this.gz[g] = this.o2[1]!; }
    }
    this.gh[g] = lerpAngle(this.gh[g]!, this.gmode[g] === 0 ? th : 0, 1 - Math.exp(-dt * 3));
  }

  private stepSoldier(i: number, f: number, dt: number): void {
    void f;
    const g = this.grp[i]!;
    const n = this.gcount[g]!;
    const mode = this.gmode[g]!;
    formationSlot(mode === 0 ? this.gform[g]! : 2, this.slot[i]!, n, this.s2);
    this.s2[0] = this.s2[0]! * this.gsp[g]!; this.s2[1] = this.s2[1]! * this.gsp[g]!;
    const h = this.gh[g]!, c = Math.cos(h), s = Math.sin(h);
    const sx = this.gx[g]! + this.s2[0]! * c + this.s2[1]! * s;
    const sz = this.gz[g]! - this.s2[0]! * s + this.s2[1]! * c;
    const x = this.px[i]!, z = this.pz[i]!;
    const dx = sx - x, dz = sz - z, d = Math.hypot(dx, dz);
    let mv = d * (1 - Math.exp(-dt * 6));
    mv = Math.min(mv, 1.1 * dt, d);
    let moved = 0;
    if (d > 1e-4 && mv > 0) {
      pushOut(x + (dx / d) * mv, z + (dz / d) * mv, this.obX, this.obZ, this.obR, this.obX.length, 0.1, this.o2);
      if (this.walkable(this.o2[0]!, this.o2[1]!)) { moved = Math.hypot(this.o2[0]! - x, this.o2[1]! - z); this.px[i] = this.o2[0]!; this.pz[i] = this.o2[1]!; }
    }
    const spdNow = moved / dt;
    if (spdNow > 0.12) this.hd[i] = lerpAngle(this.hd[i]!, Math.atan2(dx, dz), 1 - Math.exp(-dt * 8));
    else this.hd[i] = lerpAngle(this.hd[i]!, h, 1 - Math.exp(-dt * 5));
    this.gait[i] = Math.min(1, spdNow * 2.2);
    this.stepPh[i] = this.stepPh[i]! + moved * 11;
    this.ph[i] = (Math.floor(this.slot[i]! / 2) * 0.9);
    if (d < 0.2) this.anim[i] = mode === 2 ? ANIM.sleep : mode === 1 ? ANIM.strike : ANIM.idle;
    else this.anim[i] = ANIM.idle;
  }

  /* ---------------- frame ---------------- */

  update(state: GameState, camera: THREE.Camera, dt: number, time: number): void {
    if (!this.group.visible) return;
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    if (time - this.lastCheck > 0.5) {
      this.lastCheck = time;
      let h = this.quality === 'low' ? 1 : this.quality === 'medium' ? 2 : 3;
      for (const b of Object.values(state.city.buildings)) h = (Math.imul(h, 31) + b.cell * 64 + Math.min(b.level, 63) + (b.type.charCodeAt(0) << 20)) | 0;
      for (const t of TROOP_LIST) h = (Math.imul(h, 31) + (state.troops[t.id]?.healthy ?? 0)) | 0;
      h = (Math.imul(h, 31) + state.research.done.length) | 0;
      if (h !== this.sig) { this.sig = h; this.rebuild(state); }
    }
    dt = Math.min(dt, 0.1);
    const f = dayOverride ?? dayFrac(state.tick);
    camera.updateMatrixWorld();
    this.fr.setFromProjectionMatrix(this.pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    for (const b of this.m.all) b.reset();
    let vis = 0, act = 0;
    for (let g = 0; g < this.gN; g++) this.stepGroup(g, f, dt);
    for (let i = 0; i < N; i++) {
      if (!this.act[i]) continue;
      act++;
      if (i < CIV_CAP) this.stepCiv(i, f, dt); else if (i < EXP_BASE) this.stepSoldier(i, f, dt); else stepExplorer(this, i, f, dt);
      if (drawNpc(this, this.m, this.hf, i, time, dt)) vis++;
    }
    for (const b of this.m.all) b.flush();
    this.stats.active = act; this.stats.visible = vis;
    this.stats.drawCalls = this.m.all.reduce((a, b) => a + (b.n > 0 ? (b.outline ? 2 : 1) : 0), 0);
    if (typeof performance !== 'undefined') this.stats.updateMs += (performance.now() - t0 - this.stats.updateMs) * 0.05;
  }

  dispose(): void {
    this.m.dispose();
  }
}
