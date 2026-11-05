// Procedural battle animation (D11): two lines of figures, arrow volleys, hit flashes, hero skill banners and an outcome
// banner, driven only by a BattleReport. 5 to 10 seconds, played at the POI in the world scene.
import * as THREE from 'three';
import { SKILLS, TROOPS } from '../../sim/data/registry';
import type { BattleReport } from '../../sim/state';
import { animateUnit, buildUnitMesh, type UnitClass } from '../meshes';
import { circleTexture, disposeSprite, makeTextSprite, reducedMotion, clamp } from '../view/util';

const N = 5;
const ARROWS = 18;

interface Fig { g: THREE.Group; side: 0 | 1; cls: UnitClass; x0: number; z0: number; dieAt: number; phase: number }
interface Flash { sp: THREE.Sprite; at: number; x: number; y: number; z: number }
interface Arrow { m: THREE.Mesh; t0: number; t1: number; from: THREE.Vector3; to: THREE.Vector3 }
interface Banner { sp: THREE.Sprite; t0: number; t1: number; x: number; z: number }

const arrowGeo = new THREE.BoxGeometry(0.035, 0.035, 0.38);
const arrowMat = new THREE.MeshBasicMaterial({ color: 0x573a26, fog: false });

function classesOf(cas: Record<string, number>, fallback: UnitClass[]): UnitClass[] {
  const out: UnitClass[] = [];
  for (const id of Object.keys(cas)) {
    const c = TROOPS[id]?.class as UnitClass | undefined;
    if (c && !out.includes(c)) out.push(c);
  }
  return out.length ? out : fallback;
}

export class Battle {
  readonly root = new THREE.Group();
  private figs: Fig[] = [];
  private flashes: Flash[] = [];
  private arrows: Arrow[] = [];
  private banners: Banner[] = [];
  private arrowPool: THREE.Mesh[] = [];
  private t = 0;
  readonly dur: number;
  private still: boolean;
  private result: THREE.Sprite;
  private roundDur: number;
  private shot = new Set<number>();
  done = false;

  constructor(private report: BattleReport, pos: THREE.Vector3, private groundY: (x: number, z: number) => number) {
    this.still = reducedMotion();
    const rounds = Math.max(1, report.rounds.length);
    this.dur = this.still ? 3 : clamp(5.5 + rounds * 0.55, 5.5, 10);
    this.roundDur = (this.dur - 2.4) / rounds;
    this.root.position.copy(pos);
    this.root.name = 'battle';
    const A = classesOf(report.casualtiesA, ['infantry', 'archer', 'cavalry']);
    const B = classesOf(report.casualtiesB, ['infantry', 'archer']);
    const lossA = report.rounds.reduce((a, r) => a + r.lossesA, 0);
    const lossB = report.rounds.reduce((a, r) => a + r.lossesB, 0);
    const winA = report.winner === 'attacker';
    const deadA = winA ? Math.round(clamp(lossA / Math.max(1, lossA + lossB), 0, 0.6) * N) : N - 1;
    const deadB = winA ? N - 1 : Math.round(clamp(lossB / Math.max(1, lossA + lossB), 0, 0.6) * N);
    for (const side of [0, 1] as const) {
      const list = side === 0 ? A : B;
      const dead = side === 0 ? deadA : deadB;
      for (let i = 0; i < N; i++) {
        const cls = list[i % list.length]!;
        // the player is always the chickens: the attacker on a march, the defender in a raid or ambush
        const chickenSide = report.kind === 'raid' || report.kind === 'ambush' ? 1 : 0;
        const g = buildUnitMesh(cls, side === 0 ? '#3c6ea8' : '#a83c3c', 'ram', side === chickenSide ? 'chicken' : 'human');
        g.scale.setScalar(1.5);
        const z0 = (i - (N - 1) / 2) * 0.75 + (side === 0 ? 0 : 0.3);
        const x0 = (side === 0 ? -1 : 1) * (cls === 'archer' ? 2.9 : 1.55);
        g.rotation.y = side === 0 ? Math.PI / 2 : -Math.PI / 2;
        // deaths spread over the rounds, last figures first
        const order = N - 1 - i;
        const dieAt = order < dead ? 0.8 + ((order + 1) / (dead + 1)) * (this.dur - 2.6) : Infinity;
        this.figs.push({ g, side, cls, x0, z0, dieAt, phase: i * 1.3 });
        this.root.add(g);
      }
    }
    this.result = makeTextSprite(`${winA ? report.attackerName : report.defenderName} wins`, winA ? '#bfe9a8' : '#ffd0b0', 46, 'rgba(58,47,38,0.75)');
    this.result.position.set(0, 3.1, 0);
    this.result.scale.multiplyScalar(2.2);
    this.result.visible = false;
    this.root.add(this.result);
    if (!this.still) {
      for (let i = 0; i < ARROWS; i++) {
        const m = new THREE.Mesh(arrowGeo, arrowMat);
        m.visible = false;
        this.arrowPool.push(m);
        this.root.add(m);
      }
    }
    for (const f of this.figs) f.g.position.y = this.groundY(pos.x + f.x0, pos.z + f.z0) - pos.y;
    for (const ev of report.rageEvents) {
      const t0 = 0.8 + (Math.max(1, ev.round) - 1) * this.roundDur + 0.1;
      const name = SKILLS[ev.skill]?.name ?? (ev.skill === 'boss_enrage' ? 'Enraged' : ev.skill);
      const sp = makeTextSprite(`${name}!`, ev.side === 'A' ? '#cfe4ff' : '#ffc9c0', 50, 'rgba(58,47,38,0.8)');
      sp.scale.multiplyScalar(1.8);
      sp.visible = false;
      this.root.add(sp);
      this.banners.push({ sp, t0, t1: t0 + 1.4, x: ev.side === 'A' ? -2 : 2, z: 0 });
    }
  }

  private flash(x: number, y: number, z: number, at: number): void {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: circleTexture('star'), color: 0xfff0b0, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, fog: false }));
    sp.position.set(x, y, z);
    sp.renderOrder = 21;
    sp.visible = false;
    this.root.add(sp);
    this.flashes.push({ sp, at, x, y, z });
  }

  private fireVolley(round: number, time: number): void {
    for (const f of this.figs) {
      if (f.cls !== 'archer' || f.dieAt <= time) continue;
      const tgt = this.figs.filter((o) => o.side !== f.side);
      const o = tgt[(round * 3 + this.figs.indexOf(f)) % tgt.length]!;
      for (let a = 0; a < 2; a++) {
        const m = this.arrowPool.find((p) => !this.arrows.some((r) => r.m === p));
        if (!m) return;
        const t0 = time + a * 0.18 + (f.phase % 0.25);
        const from = new THREE.Vector3(f.x0, 1.0, f.z0);
        const to = new THREE.Vector3(o.x0 + (o.side === 0 ? 0.2 : -0.2), 0.7, o.z0);
        this.arrows.push({ m, t0, t1: t0 + 0.8, from, to });
        this.flash(to.x, to.y, to.z, t0 + 0.8);
      }
    }
  }

  update(dt: number): void {
    this.t += dt;
    const t = this.t;
    if (t >= this.dur) {
      this.done = true;
      return;
    }
    const fadeOut = t > this.dur - 0.7 ? clamp((this.dur - t) / 0.7, 0, 1) : 1;
    const approach = this.still ? 1 : clamp(t / 0.8, 0, 1);
    for (const f of this.figs) {
      const dir = f.side === 0 ? 1 : -1;
      const dead = t >= f.dieAt;
      const start = f.x0 - dir * 2.2;
      let x = start + (f.x0 - start) * approach;
      let moving = !this.still && approach < 1;
      const round = Math.floor((t - 0.8) / this.roundDur);
      const inRound = (t - 0.8) / this.roundDur - round;
      if (!this.still && !dead && f.cls !== 'archer' && t > 0.8) {
        const lunge = Math.max(0, Math.sin(inRound * Math.PI * 2 + f.phase));
        x += dir * 0.35 * lunge;
        moving = lunge > 0.3;
        if (lunge > 0.92 && !this.shot.has(Math.round(t * 20) * 7 + Math.round(f.phase * 10))) {
          this.shot.add(Math.round(t * 20) * 7 + Math.round(f.phase * 10));
          if (this.flashes.length < 40) this.flash(x + dir * 0.55, 0.8, f.z0, t + 0.02);
        }
      }
      f.g.position.x = x;
      f.g.position.z = f.z0;
      if (dead) {
        const k = clamp((t - f.dieAt) / 0.4, 0, 1);
        f.g.rotation.z = dir * k * 1.45;
        f.g.position.y = this.groundY(this.root.position.x + x, this.root.position.z + f.z0) - this.root.position.y + (1 - k) * 0.1;
        moving = false;
      } else if (t > this.dur - 2.0 && this.report.winner === (f.side === 0 ? 'attacker' : 'defender')) {
        f.g.position.y += Math.abs(Math.sin(t * 7 + f.phase)) * 0.004; // winners hop a little
      }
      animateUnit(f.g, t, moving, f.phase);
      f.g.scale.setScalar(1.5 * fadeOut);
    }
    if (!this.still) {
      const round = Math.floor((t - 0.8) / this.roundDur);
      if (round >= 0 && !this.volleyed.has(round) && round < Math.max(1, this.report.rounds.length)) {
        this.volleyed.add(round);
        this.fireVolley(round, t);
      }
    }
    for (const a of this.arrows) {
      const k = (t - a.t0) / (a.t1 - a.t0);
      a.m.visible = k >= 0 && k <= 1;
      if (!a.m.visible) continue;
      a.m.position.lerpVectors(a.from, a.to, k);
      a.m.position.y += Math.sin(k * Math.PI) * 1.5;
      const nx = new THREE.Vector3().lerpVectors(a.from, a.to, Math.min(1, k + 0.03));
      nx.y += Math.sin(Math.min(1, k + 0.03) * Math.PI) * 1.5;
      a.m.lookAt(a.m.parent!.localToWorld(nx));
    }
    for (const f of this.flashes) {
      const k = (t - f.at) / 0.28;
      f.sp.visible = k >= 0 && k <= 1;
      if (f.sp.visible) {
        const s = 0.4 + k * 0.9;
        f.sp.scale.set(s, s, 1);
        f.sp.material.opacity = 1 - k;
      }
    }
    for (const b of this.banners) {
      const k = (t - b.t0) / (b.t1 - b.t0);
      b.sp.visible = k >= 0 && k <= 1;
      if (b.sp.visible) {
        b.sp.position.set(b.x, 2.4 + k * 0.5, b.z);
        b.sp.material.opacity = k < 0.8 ? 1 : 1 - (k - 0.8) / 0.2;
      }
    }
    this.result.visible = t > this.dur - 2.3;
    this.result.material.opacity = fadeOut;
  }

  private volleyed = new Set<number>();

  dispose(): void {
    for (const f of this.flashes) disposeSprite(f.sp);
    for (const b of this.banners) disposeSprite(b.sp);
    disposeSprite(this.result);
    this.root.removeFromParent();
  }
}

/** Manages the currently playing battles in a scene. */
export class BattleFx {
  readonly group = new THREE.Group();
  private active: Battle[] = [];

  constructor(private groundY: (x: number, z: number) => number) {
    this.group.name = 'battle-fx';
  }

  play(report: BattleReport, cell: { x: number; z: number }): void {
    if (this.active.length >= 2) this.active.shift()!.dispose();
    const pos = new THREE.Vector3(cell.x, this.groundY(cell.x, cell.z) + 0.05, cell.z);
    const b = new Battle(report, pos, this.groundY);
    this.group.add(b.root);
    this.active.push(b);
  }

  get playing(): boolean {
    return this.active.length > 0;
  }

  update(dt: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const b = this.active[i]!;
      b.update(dt);
      if (b.done) {
        b.dispose();
        this.active.splice(i, 1);
      }
    }
  }

  /** Drops any battle in progress (the scene was hidden). */
  clear(): void {
    for (const b of this.active) { this.group.remove(b.root); b.dispose(); }
    this.active = [];
  }

  dispose(): void {
    for (const b of this.active) b.dispose();
    this.active = [];
  }
}
