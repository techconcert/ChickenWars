// March and raid view models: banner + miniature figures interpolated along the path, route preview, dust puffs.
import * as THREE from 'three';
import { TROOPS } from '../../sim/data/registry';
import { ticksPerCell } from '../../sim/nav/marchCore';
import type { GameState, MarchState, RaidState } from '../../sim/state';
import { animateMarch, buildMarchGroup, setHover, type UnitClass } from '../meshes';
import type { ParticlePool } from '../fx/particles';
import type { Pickable } from '../picking';
import { circleTexture, lerpAngle, reducedMotion, yawOf } from './util';

interface MV {
  id: string; raid: boolean; group: THREE.Group; sig: string;
  prev: THREE.Vector2; cur: THREE.Vector2; tick: number; yaw: number; moving: boolean; dustT: number; pos: THREE.Vector3;
}

function composition(troops: Record<string, number>): Partial<Record<UnitClass, number>> {
  const c: Partial<Record<UnitClass, number>> = {};
  for (const id of Object.keys(troops)) {
    const cls = (TROOPS[id]?.class ?? 'infantry') as UnitClass;
    c[cls] = (c[cls] ?? 0) + (troops[id] ?? 0);
  }
  return c;
}

export class MarchViews {
  readonly group = new THREE.Group();
  private views = new Map<string, MV>();
  private route: THREE.Points;
  private routeId: string | null = null;
  private hovered: string | null = null;

  constructor(private heightAt: (x: number, z: number) => number, private cellXZ: (c: number) => [number, number], private dust: ParticlePool | null) {
    this.group.name = 'marches';
    this.route = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ size: 0.26, sizeAttenuation: true, color: 0xfff2c0, map: circleTexture('hard'), transparent: true, depthWrite: false, depthTest: false, alphaTest: 0.05 }));
    this.route.renderOrder = 8;
    this.route.frustumCulled = false;
    this.route.visible = false;
    this.group.add(this.route);
  }

  private ramps = new Map<string, [number, number][]>();
  private rampList: { cells: number[]; centre: [number, number][] }[] = [];

  /** Ramp centrelines (low -> high) keyed by their two cells, so marches climb levels on the ramp, not straight up the cliff. */
  setRamps(ramps: readonly { cells: number[]; centre: [number, number][] }[]): void {
    this.ramps.clear();
    this.rampList = ramps.map((r) => ({ cells: r.cells, centre: r.centre }));
    for (const r of ramps) {
      const [hi, lo] = [r.cells[0], r.cells[1]];
      if (hi === undefined || lo === undefined) continue;
      this.ramps.set(`${hi}>${lo}`, [...r.centre].reverse()); // walking high -> low
      this.ramps.set(`${lo}>${hi}`, r.centre);               // walking low -> high
    }
  }

  /** Whether a path step changes level (set by the scene from the logic layer). */
  isLevelStep: (a: number, b: number) => boolean = () => true;

  /** Drawn route of one path step: cell centre to cell centre, detouring along the ramp centreline when the level changes. */
  private stepPoly(a: number, b: number): [number, number][] {
    const A = this.cellXZ(a), B = this.cellXZ(b);
    let ramp = this.ramps.get(`${a}>${b}`);
    if (!ramp && this.rampList.length) {
      // a level change next to a ramp cell the generator paired with another cell: use the closest ramp touching either cell
      const mx = (A[0] + B[0]) / 2, mz = (A[1] + B[1]) / 2;
      let best = Infinity;
      for (const r of this.rampList) {
        if (!r.cells.includes(a) && !r.cells.includes(b)) continue;
        for (const p of r.centre) {
          const d = Math.hypot(p[0] - mx, p[1] - mz);
          if (d < best) { best = d; ramp = r.centre; }
        }
      }
      if (ramp && Math.hypot(ramp[0]![0] - A[0], ramp[0]![1] - A[1]) > Math.hypot(ramp[ramp.length - 1]![0] - A[0], ramp[ramp.length - 1]![1] - A[1])) ramp = [...ramp].reverse();
      if (ramp && !this.isLevelStep(a, b)) ramp = undefined;
    }
    return ramp && ramp.length ? [A, ...ramp, B] : [A, B];
  }

  private xzAt(path: number[], u: number, out: THREE.Vector2): THREE.Vector2 {
    const n = path.length;
    if (n === 0) return out.set(0, 0);
    const uu = Math.min(n - 1, Math.max(0, u));
    const i = Math.floor(uu);
    const f = uu - i;
    if (i >= n - 1 || f <= 0) { const [ax, az] = this.cellXZ(path[i]!); return out.set(ax, az); }
    const poly = this.stepPoly(path[i]!, path[i + 1]!);
    if (poly.length === 2) return out.set(poly[0]![0] + (poly[1]![0] - poly[0]![0]) * f, poly[0]![1] + (poly[1]![1] - poly[0]![1]) * f);
    let total = 0;
    for (let k = 1; k < poly.length; k++) total += Math.hypot(poly[k]![0] - poly[k - 1]![0], poly[k]![1] - poly[k - 1]![1]);
    let want = total * f;
    for (let k = 1; k < poly.length; k++) {
      const len = Math.hypot(poly[k]![0] - poly[k - 1]![0], poly[k]![1] - poly[k - 1]![1]);
      if (want <= len || k === poly.length - 1) {
        const t = len > 0 ? Math.min(1, want / len) : 1;
        return out.set(poly[k - 1]![0] + (poly[k]![0] - poly[k - 1]![0]) * t, poly[k - 1]![1] + (poly[k]![1] - poly[k - 1]![1]) * t);
      }
      want -= len;
    }
    return out.set(poly[poly.length - 1]![0], poly[poly.length - 1]![1]);
  }

  /** The remaining route of a path from step `step` + `frac` onwards as a polyline (ramp detours included). */
  private remainingRoute(path: number[], step: number, frac: number): [number, number][] {
    const out: [number, number][] = [];
    const cur = this.xzAt(path, step + frac, new THREE.Vector2());
    out.push([cur.x, cur.y]);
    for (let i = step; i < path.length - 1; i++) {
      const poly = this.stepPoly(path[i]!, path[i + 1]!);
      if (i !== step) { for (let k = 1; k < poly.length; k++) out.push(poly[k]!); continue; }
      // the first step is only partly left: keep the points beyond the current arc length
      const cum = [0];
      for (let k = 1; k < poly.length; k++) cum.push(cum[k - 1]! + Math.hypot(poly[k]![0] - poly[k - 1]![0], poly[k]![1] - poly[k - 1]![1]));
      const at = (cum[cum.length - 1] ?? 0) * frac;
      for (let k = 1; k < poly.length; k++) if (cum[k]! > at) out.push(poly[k]!);
    }
    return out;
  }

  private getView(id: string, raid: boolean, sig: string, troops: Record<string, number>, tint: string): MV {
    let v = this.views.get(id);
    if (v && v.sig !== sig) {
      this.group.remove(v.group);
      this.views.delete(id);
      v = undefined;
    }
    if (!v) {
      const g = buildMarchGroup(composition(troops), tint, raid ? 'human' : 'chicken'); // raiders are humans
      g.scale.setScalar(1.25);
      this.group.add(g);
      v = { id, raid, group: g, sig, prev: new THREE.Vector2(NaN, 0), cur: new THREE.Vector2(), tick: -1, yaw: 0, moving: false, dustT: 0, pos: new THREE.Vector3() };
      this.views.set(id, v);
    }
    return v;
  }

  private track(v: MV, tick: number, target: THREE.Vector2, dirHint: THREE.Vector2 | null): void {
    if (Number.isNaN(v.prev.x)) { v.prev.copy(target); v.cur.copy(target); v.tick = tick; return; }
    if (tick !== v.tick) {
      v.prev.copy(v.cur);
      v.cur.copy(target);
      v.tick = tick;
      if (v.prev.distanceTo(v.cur) > 3) v.prev.copy(v.cur);
      const dx = v.cur.x - v.prev.x, dz = v.cur.y - v.prev.y;
      v.moving = Math.hypot(dx, dz) > 0.0005;
      if (dirHint && !v.moving && dirHint.lengthSq() > 0) v.yaw = yawOf(dirHint.x, dirHint.y);
    }
  }

  update(state: GameState, alpha: number, dt: number, time: number, selectedMarch: string | null): void {
    const seen = new Set<string>();
    const tmp = new THREE.Vector2();
    const tmp2 = new THREE.Vector2();
    for (const m of Object.values(state.marches) as MarchState[]) {
      seen.add(m.id);
      const sig = Object.keys(composition(m.troops)).sort().join(',') + '|' + Math.round(Object.values(m.troops).reduce((a, b) => a + b, 0) / 10);
      const v = this.getView(m.id, false, sig, m.troops, '#3c6ea8');
      const u = Math.min(m.path.length - 1, m.step + (m.state === 'moving' || m.state === 'returning' ? m.progress / 1000 : 0));
      this.xzAt(m.path, u, tmp);
      if (m.state === 'gathering' || m.state === 'fighting' || m.state === 'done') tmp.x -= 0.55, tmp.y += 0.4;
      const dirHint = m.path.length > m.step + 1 ? this.xzAt(m.path, m.step + 1, tmp2).sub(this.xzAt(m.path, m.step, new THREE.Vector2())).normalize() : null;
      this.track(v, state.tick, tmp, dirHint);
      this.pose(v, alpha, dt, time, m.state === 'moving' || m.state === 'returning', dirHint, false);
    }
    for (const r of Object.values(state.raids) as RaidState[]) {
      const key = `raid:${r.id}`;
      seen.add(key);
      const v = this.getView(key, true, 'raid', Object.fromEntries(r.troops.map((s) => [s.troop, s.count])), '#a83c3c');
      const left = Math.max(0, r.arriveAt - state.tick) / ticksPerCell(10, 1);
      this.xzAt(r.path, r.path.length - 1 - left, tmp);
      this.track(v, state.tick, tmp, null);
      this.pose(v, alpha, dt, time, left > 0, null, true);
    }
    for (const [id, v] of this.views) if (!seen.has(id)) { this.group.remove(v.group); this.views.delete(id); }
    // route preview for the selected march
    const sel = selectedMarch ? state.marches[selectedMarch] : undefined;
    if (!sel) { this.route.visible = false; this.routeId = null; return; }
    this.routeId = sel.id;
    const pts: number[] = [];
    const route = this.remainingRoute(sel.path, sel.step, sel.progress / 1000);
    const acc = 0.42;
    let carry = 0;
    for (let i = 1; i < route.length; i++) {
      const [px, pz] = route[i - 1]!;
      const [x, z] = route[i]!;
      const len = Math.hypot(x - px, z - pz);
      for (let d = acc - carry; d < len; d += acc) {
        const f = d / len;
        const qx = px + (x - px) * f, qz = pz + (z - pz) * f;
        pts.push(qx, this.heightAt(qx, qz) + 0.25, qz);
      }
      carry = (carry + len) % acc;
    }
    const g = this.route.geometry;
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    g.computeBoundingSphere();
    this.route.visible = pts.length > 0;
    (this.route.material as THREE.PointsMaterial).color.setHex(sel.kind === 'return' || sel.state === 'returning' ? 0xbfe0ff : 0xfff2c0);
  }

  private pose(v: MV, alpha: number, dt: number, time: number, travelling: boolean, dir: THREE.Vector2 | null, raid: boolean): void {
    const x = v.prev.x + (v.cur.x - v.prev.x) * alpha;
    const z = v.prev.y + (v.cur.y - v.prev.y) * alpha;
    const dx = v.cur.x - v.prev.x, dz = v.cur.y - v.prev.y;
    if (Math.hypot(dx, dz) > 0.002) v.yaw = lerpAngle(v.yaw, yawOf(dx, dz), 1 - Math.exp(-dt * 10));
    else if (dir && dir.lengthSq() > 0) v.yaw = lerpAngle(v.yaw, yawOf(dir.x, dir.y), 1 - Math.exp(-dt * 6));
    const y = this.heightAt(x, z);
    v.group.position.set(x, y, z);
    v.group.rotation.y = v.yaw;
    v.pos.set(x, y, z);
    const moving = travelling && v.moving;
    animateMarch(v.group, time, moving);
    if (moving && this.dust && !reducedMotion()) {
      v.dustT -= dt;
      if (v.dustT <= 0) {
        v.dustT = 0.2;
        const bx = x - Math.sin(v.yaw) * 0.6, bz = z - Math.cos(v.yaw) * 0.6;
        this.dust.emit(bx + (Math.random() - 0.5) * 0.3, y + 0.08, bz + (Math.random() - 0.5) * 0.3, 0, 0.25, 0, 0.9, 0.12, 0.34, raid ? 0xc9a090 : 0xe0d2b0);
      }
    }
  }

  items(): Pickable[] {
    return [...this.views.values()].filter((v) => !v.raid).map((v) => ({ kind: 'march', id: v.id, pos: v.pos.clone().setY(v.pos.y + 0.5), radiusPx: 26, priority: 3 }));
  }

  positionOf(id: string): THREE.Vector3 | null {
    return this.views.get(id)?.pos ?? null;
  }

  setHover(id: string | null): void {
    if (id === this.hovered) return;
    const o = this.hovered ? this.views.get(this.hovered) : undefined;
    if (o) setHover(o.group, false);
    const n = id ? this.views.get(id) : undefined;
    if (n) setHover(n.group, true);
    this.hovered = id;
  }

  dispose(): void {
    this.route.geometry.dispose();
    this.group.clear();
    this.views.clear();
  }
}
