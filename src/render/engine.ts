// Renderer entry point (contract section 7/8): one WebGLRenderer, two scene modules swapped on client.scene.
// The renderer does NOT run its own loop: main.ts calls `client.frame(dt)` then `renderer.frame(dt)` every rAF.
import * as THREE from 'three';
import type { ClientView, SceneId } from '../app/clientView';
import { setTime } from './materials';
import { createBaseScene } from './scenes/base';
import type { SceneModule } from './scenes/types';
import { createWorldScene, type WorldSceneHandle } from './scenes/world';
import { updateSeasonLook } from './view/season';
import { Weather } from './fx/weather';
import { reducedMotion } from './view/util';
import type { Quality } from './view/util';

const TICKS_PER_DAY = 600; // D25: day rollover at tick % 600

export type { Quality } from './view/util';

export interface RenderStats { fps: number; drawCalls: number; triangles: number; terrainTriangles?: number; propInstances?: number; propTriangles?: number }

export interface RendererHandle {
  /** Render one frame; dtMs is the real frame time in milliseconds. */
  frame(dtMs: number): void;
  setQuality(q: Quality): void;
  getStats(): RenderStats;
  /** Debug: the three.js scene of a module. */
  getScene(id: SceneId): THREE.Scene;
  dispose(): void;
}

type FocusClient = ClientView & { registerFocus?: (fn: (scene: SceneId, cell: number) => void) => void };

const PIXEL_RATIO: Record<Quality, number> = { low: 1, medium: 1.5, high: 2 };

export function createRenderer(canvas: HTMLCanvasElement, client: ClientView): RendererHandle {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  let quality: Quality = 'medium';
  const applyRatio = (): void => renderer.setPixelRatio(Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, PIXEL_RATIO[quality]));
  applyRatio();
  renderer.setClearColor(0xbfe0e4);
  renderer.info.autoReset = true;

  const base: SceneModule = createBaseScene({ canvas, client, quality });
  const world: WorldSceneHandle = createWorldScene({ canvas, client, quality });
  const mods: Record<SceneId, SceneModule> = { base, world };
  let active: SceneId | null = null;
  let time = 0;
  let w = 0;
  let h = 0;
  let fpsAvg = 60;
  const stats: RenderStats = { fps: 60, drawCalls: 0, triangles: 0 };
  const clearCol = new THREE.Color();
  const weather = new Weather();

  (client as FocusClient).registerFocus?.((scene, cell) => mods[scene].focusCell(cell));

  function resize(): void {
    const cw = canvas.clientWidth || window.innerWidth;
    const ch = canvas.clientHeight || window.innerHeight;
    if (cw === w && ch === h) return;
    w = cw;
    h = ch;
    renderer.setSize(w, h, false);
    for (const m of Object.values(mods)) {
      m.camera.aspect = w / h;
      m.camera.updateProjectionMatrix();
    }
  }

  function frame(dtMs: number): void {
    const dt = Math.min(0.1, Math.max(0.0001, dtMs / 1000));
    time += dt;
    resize();
    if (active !== client.scene) {
      if (active) { mods[active].deactivate(); mods[active].scene.remove(weather.points); }
      active = client.scene;
      mods[active].scene.add(weather.points);
      mods[active].activate();
      resize();
      w = 0; h = 0; resize();
    }
    const state = client.getState();
    const fogHex = updateSeasonLook(dt, state.season.index, false, (state.tick % TICKS_PER_DAY) / TICKS_PER_DAY);
    clearCol.setHex(fogHex);
    renderer.setClearColor(clearCol);
    setTime(time);
    const m = mods[active];
    m.update(dt, time);
    weather.setEnabled(quality !== 'low' && !reducedMotion());
    weather.update(dt, state.season.index, m.camera, active === 'world' ? world.groundY() : 0, active === 'world' ? Math.max(8, world.camDistance()) : 17, time);
    renderer.render(m.scene, m.camera);
    stats.drawCalls = renderer.info.render.calls;
    stats.triangles = renderer.info.render.triangles;
    if (active === 'world') { const ws = world.stats(); stats.terrainTriangles = ws.triangles; stats.propInstances = ws.props; stats.propTriangles = ws.propTriangles; }
    fpsAvg += (1 / dt - fpsAvg) * 0.05;
    stats.fps = Math.round(fpsAvg);
  }

  return {
    frame,
    setQuality(q) {
      quality = q;
      applyRatio();
      w = 0; h = 0;
      base.setQuality(q);
      world.setQuality(q);
    },
    getStats: () => ({ ...stats }),
    getScene: (id) => mods[id].scene,
    dispose() {
      active && mods[active].deactivate();
      weather.dispose();
      base.dispose();
      world.dispose();
      renderer.dispose();
    },
  };
}
