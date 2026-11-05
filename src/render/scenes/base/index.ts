// Base (city) scene: plateau terrain, buildings view model, placement ghost, selection, camera.
import * as THREE from 'three';
import type { GameEvent } from '../../../sim/events';
import { BUILDINGS } from '../../../sim/data/registry';
import { adjacencyBonus } from '../../../sim/city/adjacency';
import { proximityBonus } from '../../../sim/city/proximity';
import { buildingAtCell, cellError, placementError } from '../../../sim/city/territory';
import { SQ3, worldToCell } from '../../../gen/hex';
import { createCameraRig, type CameraRig } from '../../camera/rig';
import { animateSelectionRing, buildSelectionRing } from '../../meshes';
import { BuildingViews, HALL_SCALE } from '../../view/buildings';
import { ParticlePool, sparkGeo } from '../../fx/particles';
import { attachPointer, groundHit, pointerRay } from '../../picking';
import { emitWindow, settingFlag, type Quality } from '../../view/util';
import { BaseOverlay } from './overlay';
import { GainLabels } from './gains';
import { TownLife, setTownLifeDay } from './townLife';
import { PlacementGhost } from './ghost';
import { buildBaseGround, type BaseGround } from './terrain';
import type { CamState, SceneCtx, SceneModule } from '../types';

export function createBaseScene(ctx: SceneCtx): SceneModule {
  const { client, canvas } = ctx;
  const state0 = client.getState();
  const R = state0.city.radius;
  const ground: BaseGround = buildBaseGround(state0.city.terrain, R, state0.seed);
  const { hf, grid } = ground;
  const scene = new THREE.Scene();
  scene.add(ground.group);
  const camera = new THREE.PerspectiveCamera(30, 1, 1, 500);
  const overlay = new BaseOverlay(grid, hf.heightAt);
  const ghost = new PlacementGhost();
  const cellPos = (c: number): THREE.Vector3 => new THREE.Vector3(grid.x[c]!, hf.cellHeight(c), grid.z[c]!);
  const views = new BuildingViews(cellPos, (q, r) => grid.idxOf(q, r), (c) => [grid.q[c]!, grid.r[c]!]);
  const ring = buildSelectionRing(0.92);
  ring.visible = false;
  const sparks = new ParticlePool(96, sparkGeo(), 1);
  const gains = new GainLabels(views);
  const life = new TownLife(grid, hf, state0.city.terrain, state0.seed, ctx.quality);
  scene.add(overlay.group, views.group, ghost.group, ring, sparks.mesh, gains.floats.group, life.group);
  if (import.meta.env.DEV) (window as unknown as { __townLife?: unknown }).__townLife = { life, setDay: setTownLifeDay };

  const th0 = state0.city.buildings[state0.city.townHall];
  const cam: CamState = { x: th0 ? grid.x[th0.cell]! : 0, z: th0 ? grid.z[th0.cell]! : 0, dist: 17 };
  let rig: CameraRig | null = null;
  let detach: (() => void) | null = null;
  let hoverCell = -1;
  let hoverKey = '';
  let hoverBuilding: string | null = null;
  let lastPtr = { x: 0, y: 0, in: false };
  let t = 0;

  const unsub = client.on((evs: GameEvent[]) => {
    gains.onEvents(evs, client.getState(), t);
    for (const e of evs) {
      if (e.t === 'BuildingCompleted' || e.t === 'BuildingUpgraded') {
        const v = views.views.get(e.building);
        if (!v) continue;
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2;
          sparks.emit(v.root.position.x + Math.cos(a) * 0.5, v.root.position.y + 0.3, v.root.position.z + Math.sin(a) * 0.5, Math.cos(a) * 0.5, 1.4 + (i % 3) * 0.3, Math.sin(a) * 0.5, 1.1, 0.05, 0.16, i % 2 ? 0xe3b341 : 0xfff2b0, 1.2);
        }
      }
    }
  });

  const size = (): [number, number] => [canvas.clientWidth || 1, canvas.clientHeight || 1];
  const cellAtRay = (px: number, py: number): number => {
    if (!rig) return -1;
    const [w, h] = size();
    const hit = groundHit(pointerRay(camera, px, py, w, h), hf.heightAt, 3, -3);
    return hit ? worldToCell(grid, hit.x, hit.z) : -1;
  };

  function evalHover(px: number, py: number): void {
    const state = client.getState();
    const [w, h] = size();
    const ray = pointerRay(camera, px, py, w, h);
    const placing = client.placing;
    hoverBuilding = placing ? null : views.pick(ray);
    hoverCell = hoverBuilding ? state.city.buildings[hoverBuilding]!.cell : cellAtRay(px, py);
    const err = placing && hoverCell >= 0 ? (client.moving ? cellError(state, hoverCell) : placementError(state, placing, hoverCell)) : null;
    const bonus = placing && hoverCell >= 0 && !err ? adjacencyBonus(state, placing, hoverCell) + proximityBonus(state, placing, hoverCell) : 0;
    const key = `${hoverCell}|${hoverBuilding}|${placing}|${err}|${bonus}`;
    if (key !== hoverKey) {
      hoverKey = key;
      emitWindow('hl-hover', { scene: 'base', cell: hoverCell, kind: hoverBuilding ? 'building' : 'cell', id: hoverBuilding, type: placing, valid: placing ? !err : null, error: err, bonus, sx: px, sy: py });
    }
    views.setHovered(hoverBuilding);
  }

  function onClick(px: number, py: number, e: PointerEvent): void {
    evalHover(px, py);
    const placing = client.placing;
    if (placing) {
      if (hoverCell < 0) return;
      const code = client.moving ? client.dispatch({ t: 'moveBuilding', building: client.moving, cell: hoverCell }) : client.dispatch({ t: 'build', building: placing, cell: hoverCell });
      if (code) emitWindow('hl-place-error', { code, cell: hoverCell, type: placing });
      else if (!e.shiftKey || client.moving) client.setPlacing(null);
      return;
    }
    if (hoverBuilding) client.select({ kind: 'building', id: hoverBuilding });
    else {
      const c = hoverCell >= 0 ? buildingAtCell(client.getState(), hoverCell) : null;
      client.select(c ? { kind: 'building', id: c } : null);
    }
  }

  const scene_: SceneModule = {
    id: 'base', scene, camera,
    activate() {
      gains.setActive(true);
      const ext = (R + 1) * SQ3;
      rig = createCameraRig(camera, canvas, { bounds: { minX: -ext, maxX: ext, minZ: -ext, maxZ: ext }, zoomLevels: [8, 17, 46], pitchDeg: 38, fov: 30, start: { x: cam.x, z: cam.z } });
      rig.snapTo(cam.x, cam.z, cam.dist);
      rig.setEdgeScroll(settingFlag('edgeScroll', true));
      if (import.meta.env.DEV) (window as unknown as { __rig?: CameraRig }).__rig = rig;
      detach = attachPointer(canvas, {
        move(px, py) { lastPtr = { x: px, y: py, in: true }; evalHover(px, py); },
        click: onClick,
        rightClick() { if (client.placing) client.setPlacing(null); },
        leave() { lastPtr.in = false; hoverCell = -1; hoverBuilding = null; views.setHovered(null); hoverKey = ''; emitWindow('hl-hover', { scene: 'base', cell: -1, kind: 'none', id: null }); },
      });
    },
    deactivate() {
      gains.setActive(false);
      if (rig) { const tg = rig.getTarget(); cam.x = tg.x; cam.z = tg.z; cam.dist = rig.getDistance(); rig.dispose(); rig = null; }
      detach?.(); detach = null;
      views.setHovered(null);
    },
    update(dt, time) {
      t = time;
      const state = client.getState();
      rig?.setEdgeScroll(settingFlag('edgeScroll', true));
      rig?.update(dt);
      camera.updateMatrixWorld(true);
      views.sync(state);
      life.update(state, camera, dt, time);
      overlay.update(state, client.placing);
      sparks.update(dt);
      gains.update(state, dt, time);
      // ghost
      const placing = client.placing;
      if (placing && hoverCell >= 0 && lastPtr.in) {
        const err = client.moving ? cellError(state, hoverCell) : placementError(state, placing, hoverCell);
        ghost.show(placing, cellPos(hoverCell), !err);
        overlay.setHover(hoverCell, err ? 0xff6a5a : 0x7aff7a);
      } else {
        ghost.hide();
        overlay.setHover(hoverCell >= 0 && lastPtr.in && !hoverBuilding ? hoverCell : -1, 0xffffff);
      }
      // selection ring
      const sel = client.selection;
      const v = sel && sel.kind === 'building' ? views.views.get(sel.id) : undefined;
      views.setSelected(v ? v.id : null);
      ring.visible = !!v;
      if (v) {
        ring.position.set(v.root.position.x, v.root.position.y + 0.06, v.root.position.z);
        animateSelectionRing(ring, t);
        if (BUILDINGS[v.type]?.mesh === 'hall') ring.scale.multiplyScalar(HALL_SCALE * 1.12);
      }
    },
    focusCell(cell) {
      const x = grid.x[cell] ?? 0, z = grid.z[cell] ?? 0;
      if (rig) rig.focus(x, z, Math.min(rig.getDistance(), 16));
      else { cam.x = x; cam.z = z; cam.dist = Math.min(cam.dist, 16); }
    },
    setQuality(q: Quality) { life.setQuality(q); },
    dispose() {
      unsub();
      detach?.();
      rig?.dispose();
      life.dispose(); overlay.dispose(); gains.dispose(); ghost.dispose(); sparks.dispose(); ground.dispose();
    },
  };
  return scene_;
}
