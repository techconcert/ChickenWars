// World scene: async island terrain (chunked + LOD), props, water, fog of war, markers, marches, battle fx, picking.
import * as THREE from 'three';
import { SQ3, makeHexGrid, worldToCell, type HexGrid } from '../../../gen/hex';
import { generateTerrainAsync, type TerrainBundle } from '../../../gen/terrain/client';
import { STEP } from '../../../gen/terrain/types';
import { heightAt as fieldHeight } from '../../../gen/terrain/queries';
import { startTypeParams } from '../../../app/newGame';
import { LORDS } from '../../../sim/data/registry';
import type { GameEvent } from '../../../sim/events';
import { createCameraRig, type CameraRig } from '../../camera/rig';
import { animateSelectionRing, buildSelectionRing } from '../../meshes';
import { BattleFx } from '../../fx/battle';
import { FloatTexts } from '../../fx/floatText';
import { ParticlePool, dustGeo } from '../../fx/particles';
import { attachPointer, groundHit, pickScreen, pointerRay } from '../../picking';
import { RegionBorders } from '../../terrain/borders';
import { TerrainChunks } from '../../terrain/chunks';
import { createTerrainColourer, type TerrainColourer } from '../../terrain/colour';
import { FogLayer } from '../../terrain/fog';
import { PropsLayer } from '../../terrain/props';
import { buildWorldWater, type WorldWater } from '../../terrain/water';
import { BridgeLayer } from '../../view/bridges';
import { MarchViews } from '../../view/marchViews';
import { WorldModels } from '../../view/worldModels';
import { emitWindow, settingFlag, smooth, type Quality } from '../../view/util';
import type { CamState, SceneCtx, SceneModule } from '../types';

const RES_COL: Record<string, string> = { wood: '#d9b27a', food: '#f0dc7a', stone: '#d0cdc8', gold: '#ffd34d', ember: '#ff8a5a' };

export interface WorldSceneHandle extends SceneModule {
  readonly ready: boolean;
  stats(): { triangles: number; props: number; propTriangles: number };
  /** Smoothed terrain height under the camera target (weather floor). */
  groundY(): number;
  camDistance(): number;
}

export function createWorldScene(ctx: SceneCtx): WorldSceneHandle {
  const { client, canvas } = ctx;
  const st0 = client.getState();
  const R = st0.world.radius;
  const grid: HexGrid = makeHexGrid(R);
  const cellXZ = (c: number): [number, number] => [grid.x[c] ?? 0, grid.z[c] ?? 0];
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 1, 2000);
  const [cx0, cz0] = cellXZ(st0.world.capitalCell);
  const cam: CamState = { x: cx0, z: cz0, dist: 42 };
  let rig: CameraRig | null = null;
  let detach: (() => void) | null = null;
  let quality: Quality = ctx.quality;
  let gy = 0;

  // pieces created when the terrain is ready
  let bundle: TerrainBundle | null = null;
  let chunks: TerrainChunks | null = null;
  let props: PropsLayer | null = null;
  let water: WorldWater | null = null;
  let fog: FogLayer | null = null;
  let borders: RegionBorders | null = null;
  let colourer: TerrainColourer | null = null;
  let models: WorldModels | null = null;
  let bridges: BridgeLayer | null = null;
  let marches: MarchViews | null = null;
  const ring = buildSelectionRing(0.95);
  ring.visible = false;
  scene.add(ring);
  const heightFn = (x: number, z: number): number => (bundle ? fieldHeight(bundle.field, x, z) : 0);
  const dust = new ParticlePool(160, dustGeo(), 0.75);
  const floats = new FloatTexts();
  const battles = new BattleFx(heightFn);
  scene.add(dust.mesh, floats.group, battles.group);

  let lockSig = '';
  let fogVersion = 0;
  let hover: { kind: string; id: string } | null = null;
  let hoverKey = '';
  let lastSelKey = '';
  let lastTick = -1;
  let time = 0;

  const isLocked = (r: number): boolean => client.getState().world.regions[r]?.unlocked === false;

  function onReady(b: TerrainBundle): void {
    bundle = b;
    if (import.meta.env.DEV) (window as unknown as { __terrain?: TerrainBundle }).__terrain = b;
    const st = client.getState();
    if (b.logic.hash !== st.world.terrainHash) {
      console.warn(`[render] terrain hash mismatch: state ${st.world.terrainHash}, regenerated ${b.logic.hash}`);
      emitWindow('hl-terrain-mismatch', { expected: st.world.terrainHash, actual: b.logic.hash });
    }
    const F = b.field;
    colourer = createTerrainColourer(F, b.logic.regionOf);
    colourer.setLocked(isLocked);
    chunks = new TerrainChunks(F, colourer);
    chunks.setQuality(quality);
    scene.add(chunks.group);
    let maxY = 0;
    for (let i = 0; i < F.n; i += 7) if (F.H[i]! > maxY) maxY = F.H[i]!;
    // trees only where there is a wood node to gather: keeps the map readable and tells the player where wood is
    const woodCells = new Set(Object.values(st.world.nodes).filter((n) => n.resource === 'wood').map((n) => n.cell));
    // rocks never stand on a marker (capital, outposts, villages, nodes), so no model hides behind boulders or sinks into them
    const markers: [number, number][] = [st.world.capitalCell, ...Object.values(st.world.pois).map((p) => p.cell), ...Object.values(st.world.nodes).map((n) => n.cell)].map((c) => cellXZ(c));
    const nearMarker = (x: number, z: number): boolean => markers.some(([mx, mz]) => Math.hypot(x - mx, z - mz) < 1.25);
    const placements = { ...b.placements, trees: b.placements.trees.filter((t) => woodCells.has(worldToCell(grid, t.x, t.z))), rocks: b.placements.rocks.filter((r) => !nearMarker(r.x, r.z)) };
    props = new PropsLayer(F, placements, maxY, (x, z) => worldToCell(grid, x, z));
    props.setQuality(quality);
    scene.add(props.group);
    water = buildWorldWater(F);
    scene.add(water.group);
    fog = new FogLayer(F, R);
    fog.update(st.world.fog, st.tick, true);
    fog.bind();
    borders = new RegionBorders(F, b.logic.regionOf, heightFn);
    scene.add(borders.points);
    bridges = new BridgeLayer(grid, heightFn);
    scene.add(bridges.group);
    bridges.sync(st);
    models = new WorldModels(heightFn, cellXZ);
    scene.add(models.group);
    marches = new MarchViews(heightFn, cellXZ, dust);
    marches.setRamps(b.logic.ramps);
    marches.isLevelStep = (x, y) => (st.world.level[x] ?? 0) !== (st.world.level[y] ?? 0);
    scene.add(marches.group);
    models.sync(st, true);
    if (rig) {
      rig.setBounds({ minX: F.x0 + 6, maxX: F.x0 + (F.GW - 1) * F.h - 6, minZ: F.z0 + 6, maxZ: F.z0 + (F.GH - 1) * F.h - 6 });
      fog.bind();
    }
    emitWindow('hl-terrain-progress', { p: 1, stage: 'ready' });
  }

  void generateTerrainAsync({ seed: st0.seed, radius: R, startType: startTypeParams(st0.options.startType) }, (p, stage) => emitWindow('hl-terrain-progress', { p: p * 0.98, stage }))
    .then(onReady)
    .catch((e: unknown) => { console.error('[render] world terrain failed', e); emitWindow('hl-terrain-progress', { p: 1, stage: 'error' }); });

  const unsub = client.on((evs: GameEvent[]) => {
    const st = client.getState();
    for (const e of evs) {
      // battle animations and gain labels only play while the world map is shown; later the marches simply show their state
      if (!rig && (e.t === 'BattleResolved' || e.t === 'MarchReturned')) continue;
      if (e.t === 'BattleResolved') {
        const rep = st.reports.find((r) => r.id === e.report);
        if (!rep) continue;
        const poi = e.target ? st.world.pois[e.target] : undefined;
        const [x, z] = cellXZ(poi ? poi.cell : st.world.capitalCell);
        battles.play(rep, { x, z });
      } else if (e.t === 'MarchReturned') {
        const [x, z] = cellXZ(st.world.capitalCell);
        let i = 0;
        for (const k of Object.keys(e.carried)) {
          const v = Math.round((e.carried as Record<string, number>)[k] ?? 0);
          if (v <= 0) continue;
          floats.add(`+${v} ${k}`, RES_COL[k] ?? '#fff', x, heightFn(x, z) + 2.2 + i * 0.55, z);
          i++;
        }
      } else if (e.t === 'FogRevealed' && fog) fog.dirty = true;
    }
  });

  const size = (): [number, number] => [canvas.clientWidth || 1, canvas.clientHeight || 1];

  function evalHover(px: number, py: number): void {
    if (!bundle || !models || !marches) return;
    const [w, h] = size();
    const items = [...models.items(), ...marches.items()];
    const hit = pickScreen(items, camera, w, h, px, py);
    const gh = groundHit(pointerRay(camera, px, py, w, h), heightFn, bundle.field.maxLv * STEP + 3, -3);
    const cell = gh ? worldToCell(grid, gh.x, gh.z) : -1;
    hover = hit ? { kind: hit.kind, id: hit.id } : cell >= 0 ? { kind: 'cell', id: String(cell) } : null;
    const key = hover ? `${hover.kind}:${hover.id}` : '';
    models.setHover(hit && hit.kind !== 'march' ? hit.kind : null, hit && hit.kind !== 'march' ? hit.id : null);
    marches.setHover(hit?.kind === 'march' ? hit.id : null);
    if (key !== hoverKey) {
      hoverKey = key;
      emitWindow('hl-hover', { scene: 'world', cell, kind: hover?.kind ?? 'none', id: hover?.id ?? null, sx: px, sy: py });
    }
  }

  const mod: WorldSceneHandle = {
    id: 'world', scene, camera,
    get ready() { return bundle !== null; },
    groundY: () => gy,
    camDistance: () => (rig ? rig.getDistance() : cam.dist),
    stats: () => ({ triangles: chunks?.triangles ?? 0, props: props?.instances ?? 0, propTriangles: props?.triangles ?? 0 }),
    activate() {
      const ext = R * SQ3 + 8;
      rig = createCameraRig(camera, canvas, { bounds: bundle ? { minX: bundle.field.x0 + 6, maxX: bundle.field.x0 + (bundle.field.GW - 1) * bundle.field.h - 6, minZ: bundle.field.z0 + 6, maxZ: bundle.field.z0 + (bundle.field.GH - 1) * bundle.field.h - 6 } : { minX: -ext, maxX: ext, minZ: -ext, maxZ: ext }, zoomLevels: [16, 42, 150], pitchDeg: 38, fov: 30, start: { x: cam.x, z: cam.z } });
      rig.snapTo(cam.x, cam.z, cam.dist);
      rig.setEdgeScroll(settingFlag('edgeScroll', true));
      if (import.meta.env.DEV) (window as unknown as { __rig?: CameraRig }).__rig = rig;
      fog?.bind();
      detach = attachPointer(canvas, {
        move: evalHover,
        click(px, py) {
          evalHover(px, py);
          if (!hover) { client.select(null); return; }
          client.select({ kind: hover.kind as 'node', id: hover.id });
        },
        rightClick() { /* camera pans with right drag */ },
        leave() { hover = null; hoverKey = ''; models?.setHover(null, null); marches?.setHover(null); emitWindow('hl-hover', { scene: 'world', cell: -1, kind: 'none', id: null }); },
      });
    },
    deactivate() {
      if (rig) { const t = rig.getTarget(); cam.x = t.x; cam.z = t.z; cam.dist = rig.getDistance(); rig.dispose(); rig = null; }
      detach?.(); detach = null;
      battles.clear(); floats.clear();
    },
    update(dt, t) {
      time = t;
      const st = client.getState();
      rig?.setEdgeScroll(settingFlag('edgeScroll', true));
      rig?.update(dt);
      if (rig && bundle) {
        const tg = rig.getTarget();
        gy += (heightFn(tg.x, tg.z) - gy) * (1 - Math.exp(-dt * 6));
        camera.position.y += gy;
        camera.lookAt(tg.x, gy, tg.z);
      }
      camera.updateMatrixWorld(true);
      dust.update(dt);
      floats.update(dt);
      battles.update(dt);
      if (!bundle || !chunks || !props || !fog || !models || !marches || !borders || !colourer) return;
      const tg = rig ? rig.getTarget() : cam;
      const dist = rig ? rig.getDistance() : cam.dist;
      chunks.update(camera.position);
      props.update(camera, tg, !!rig && (rig.zoomLevelName() === 'world' || dist > 110), st.world.fog, fogVersion);
      borders.setOpacity(smooth(55, 95, dist) * 0.95);
      borders.setSize(0.5 + dist * 0.008);
      if (st.tick !== lastTick) {
        lastTick = st.tick;
        const sig = st.world.regions.map((r) => (r.unlocked ? 1 : 0)).join('');
        if (sig !== lockSig) {
          lockSig = sig;
          colourer.setLocked(isLocked);
          chunks.invalidateColours();
          borders.recolour(isLocked);
        }
        if (fog.update(st.world.fog, st.tick)) fogVersion++;
        models.sync(st);
        bridges?.sync(st);
      }
      models.update(t, dist, tg);
      const sel = client.selection;
      marches.update(st, client.getAlpha(), dt, t, sel?.kind === 'march' ? sel.id : null);
      // selection ring
      let p: THREE.Vector3 | null = null;
      let r = 0.95;
      if (sel) {
        if (sel.kind === 'march') { p = marches.positionOf(sel.id); r = 0.8; }
        else if (sel.kind === 'cell') { const c = Number(sel.id); if (c >= 0) { const [x, z] = cellXZ(c); p = new THREE.Vector3(x, heightFn(x, z), z); r = 0.95; } }
        else if (sel.kind === 'lord') { const poi = LORDS[sel.id] ? Object.values(st.world.pois).find((q) => q.lordId === sel.id) : undefined; if (poi) { const [x, z] = cellXZ(poi.cell); p = new THREE.Vector3(x, heightFn(x, z), z); } }
        else p = models.positionOf(sel.kind, sel.id);
      }
      ring.visible = !!p;
      if (p) {
        ring.position.set(p.x, p.y + 0.1, p.z);
        animateSelectionRing(ring, time);
        ring.scale.x *= r;
        ring.scale.z *= r;
      }
      lastSelKey = sel ? `${sel.kind}:${sel.id}` : '';
      void lastSelKey;
    },
    focusCell(cell) {
      const [x, z] = cellXZ(cell);
      if (rig) rig.focus(x, z, Math.min(rig.getDistance(), 42));
      else { cam.x = x; cam.z = z; cam.dist = Math.min(cam.dist, 42); }
    },
    setQuality(q) {
      quality = q;
      chunks?.setQuality(q);
      props?.setQuality(q);
    },
    dispose() {
      unsub();
      detach?.();
      rig?.dispose();
      chunks?.dispose(); props?.dispose(); water?.dispose(); fog?.dispose(); borders?.dispose(); models?.dispose(); marches?.dispose(); bridges?.dispose();
      dust.dispose(); floats.dispose(); battles.dispose();
    },
  };
  return mod;
}
