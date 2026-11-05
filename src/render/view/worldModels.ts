// World view models: capital marker, resource nodes, POIs and lord villages. Diffs state.world each tick.
import * as THREE from 'three';
import { LORDS } from '../../sim/data/registry';
import { carriedTotal, carryCap } from '../../sim/nav/marchCore';
import type { GameState, NodeState } from '../../sim/state';
import { animateMarker, buildCapitalMarker, buildNodeModel, buildPoiMarker, setHover, type MarkerKind, type NodeKind } from '../meshes';
import type { Pickable } from '../picking';
import { clamp, smooth } from './util';

const MARKER_SCALE = 1.4;
const cbOn = (): boolean => typeof document !== 'undefined' && document.body?.dataset['colourblind'] === 'true';
const NODE_KIND: Record<string, NodeKind> = { forest: 'forest', farmland: 'farmland', quarry: 'quarry', goldvein: 'gold', emberseam: 'ember' };
const POI_KIND: Record<string, MarkerKind> = { bandit_camp: 'camp', lair: 'lair', boss: 'boss', ruin: 'ruin', village: 'village', shrine: 'shrine', cache: 'cache' };

interface MV { id: string; kind: 'node' | 'poi' | 'capital'; obj: THREE.Group; pos: THREE.Vector3; sig: string; ring?: THREE.Mesh; ringP: number; selectKind: string; farMode: boolean; fill: number; show: boolean }

function arcRing(p: number): THREE.RingGeometry {
  return new THREE.RingGeometry(0.72, 0.9, 36, 1, Math.PI / 2, -Math.PI * 2 * clamp(p, 0.01, 1)).rotateX(-Math.PI / 2);
}

export class WorldModels {
  readonly group = new THREE.Group();
  private views = new Map<string, MV>();
  private lastTick = -1;
  private lastCb = false;
  private hovered: string | null = null;
  private lastFogTick = -1;

  constructor(private heightAt: (x: number, z: number) => number, private cellXZ: (c: number) => [number, number]) {
    this.group.name = 'world-models';
  }

  private place(c: number, obj: THREE.Object3D): THREE.Vector3 {
    const [x, z] = this.cellXZ(c);
    const y = this.heightAt(x, z);
    obj.position.set(x, y, z);
    return new THREE.Vector3(x, y, z);
  }

  private ensure(key: string, kind: MV['kind'], cell: number, sig: string, make: () => THREE.Group, selectKind: string, id: string): MV {
    let v = this.views.get(key);
    if (v && v.sig !== sig) {
      this.group.remove(v.obj);
      this.dispose1(v);
      this.views.delete(key);
      v = undefined;
    }
    if (!v) {
      const obj = make();
      obj.name = key;
      const pos = this.place(cell, obj);
      this.group.add(obj);
      v = { id, kind, obj, pos, sig, ringP: -1, selectKind, farMode: false, fill: 1, show: true };
      this.views.set(key, v);
    }
    return v;
  }

  private dispose1(v: MV): void {
    v.obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && !o.userData['isOutline']) m.geometry?.dispose();
    });
    if (v.ring) { v.ring.geometry.dispose(); }
  }

  sync(state: GameState, force = false): void {
    const cb0 = cbOn();
    if (!force && state.tick === this.lastTick && cb0 === this.lastCb) return;
    this.lastTick = state.tick;
    this.lastCb = cb0;
    const w = state.world;
    const live = new Set<string>();
    const cb = cbOn();
    const cap = this.ensure('capital', 'capital', w.capitalCell, `cap|${cb}`, () => buildCapitalMarker({ fogOfWar: true, colourBlind: cb }), 'cell', String(w.capitalCell));
    live.add('capital');
    cap.obj.visible = true; cap.show = true;
    for (const n of Object.values(w.nodes)) {
      const key = `node:${n.id}`;
      const gone = n.amount <= 0 || n.respawnAt !== null;
      const fog = w.fog[n.cell] ?? 0;
      if (gone || fog === 0) { const v = this.views.get(key); if (v) { v.obj.visible = false; v.show = false; } live.add(key); continue; }
      live.add(key);
      const kind = NODE_KIND[n.type] ?? 'forest';
      const v = this.ensure(key, 'node', n.cell, `${kind}|${Math.min(5, n.tier)}|${cb}`, () => buildNodeModel(kind, Math.min(5, n.tier), { fogOfWar: true, colourBlind: cb }), 'node', n.id);
      v.obj.visible = true; v.show = true;
      v.fill = clamp(n.amount / Math.max(1, n.maxAmount), 0, 1);
      this.gatherRing(v, n, state);
    }
    for (const p of Object.values(w.pois)) {
      const key = `poi:${p.id}`;
      const fog = w.fog[p.cell] ?? 0;
      const hidden = !p.active || p.respawnAt !== null || fog === 0;
      live.add(key);
      if (hidden) { const v = this.views.get(key); if (v) { v.obj.visible = false; v.show = false; } continue; }
      const kind = POI_KIND[p.kind] ?? 'camp';
      const lord = p.lordId ? LORDS[p.lordId] : undefined;
      const v = this.ensure(key, 'poi', p.cell, `${kind}|${p.tier}|${lord?.banner ?? ''}|${cb}`, () => buildPoiMarker(kind, Math.min(5, p.tier), {
        fogOfWar: true, colourBlind: cb, banner: lord?.banner, faction: lord ? 'ally' : undefined, danger: kind === 'camp' || kind === 'lair' || kind === 'boss' ? Math.min(5, Math.max(1, p.tier)) : undefined,
      }), p.lordId ? 'lord' : 'poi', p.lordId ?? p.id);
      v.obj.visible = true; v.show = true;
      this.hoverFix(key, v);
    }
    for (const [key, v] of this.views) if (!live.has(key)) { this.group.remove(v.obj); this.dispose1(v); this.views.delete(key); }
  }

  private hoverFix(key: string, v: MV): void { if (this.hovered === key) setHover(v.obj, true); }

  private gatherRing(v: MV, n: NodeState, state: GameState): void {
    const m = n.gatherer ? state.marches[n.gatherer] : undefined;
    if (!m || m.state !== 'gathering') {
      if (v.ring) { v.obj.remove(v.ring); v.ring.geometry.dispose(); v.ring = undefined; v.ringP = -1; }
      return;
    }
    const p = carriedTotal(m.carried) / Math.max(1, carryCap(m.troops));
    if (!v.ring) {
      v.ring = new THREE.Mesh(arcRing(p), new THREE.MeshBasicMaterial({ color: 0xe3b341, side: THREE.DoubleSide, depthWrite: false, fog: false, transparent: true, opacity: 0.95 }));
      v.ring.position.y = 0.08;
      v.ring.renderOrder = 6;
      v.obj.add(v.ring);
    }
    if (Math.abs(p - v.ringP) > 0.01) { v.ring.geometry.dispose(); v.ring.geometry = arcRing(p); v.ringP = p; }
  }

  /** `dist` = camera distance; far away only the floating icons are drawn, enlarged, to keep draw calls low. */
  update(time: number, dist: number, target: { x: number; z: number }): void {
    const k = MARKER_SCALE * (1 + 1.4 * smooth(60, 130, dist));
    // at world zoom resource-node icons are dropped (keeps draw calls under budget); POIs, villages and the capital stay
    const hideNodes = dist > 125;
    for (const v of this.views.values()) {
      v.obj.visible = v.show && !(hideNodes && v.kind === 'node');
      if (!v.obj.visible) continue;
      animateMarker(v.obj, time);
      const far = dist > 95 || Math.hypot(v.pos.x - target.x, v.pos.z - target.z) > 34;
      if (v.farMode !== far) {
        v.farMode = far;
        for (const c of v.obj.children) if (!(c as THREE.Sprite).isSprite && c !== v.ring) c.visible = !far;
      }
      const sc = far ? Math.max(k, MARKER_SCALE * 1.5) : k;
      v.obj.scale.setScalar(v.kind !== 'node' ? sc : sc * (0.62 + 0.38 * v.fill));
    }
  }

  items(): Pickable[] {
    const out: Pickable[] = [];
    for (const [key, v] of this.views) {
      if (!v.obj.visible) continue;
      out.push({ kind: v.selectKind === 'cap' ? 'cell' : v.selectKind, id: v.id, pos: v.pos.clone().setY(v.pos.y + 0.6), radiusPx: 30, priority: v.kind === 'capital' ? 1 : v.kind === 'poi' ? 2 : 1 });
      void key;
    }
    return out;
  }

  /** world position of a selectable thing */
  positionOf(kind: string, id: string): THREE.Vector3 | null {
    for (const v of this.views.values()) if (v.selectKind !== 'cap' && v.id === id && (v.selectKind === kind)) return v.pos;
    return null;
  }

  setHover(kind: string | null, id: string | null): void {
    let key: string | null = null;
    if (kind && id) for (const [k, v] of this.views) if (v.id === id && (v.selectKind === kind || (kind === 'cell' && v.selectKind === 'cap'))) key = k;
    if (key === this.hovered) return;
    const old = this.hovered ? this.views.get(this.hovered) : undefined;
    if (old) setHover(old.obj, false);
    const nv = key ? this.views.get(key) : undefined;
    if (nv) setHover(nv.obj, true);
    this.hovered = key;
  }

  dispose(): void {
    for (const v of this.views.values()) this.dispose1(v);
    this.views.clear();
    this.group.clear();
  }
}
