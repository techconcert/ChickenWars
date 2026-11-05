// ?debug=terrain: standalone terrain inspector reproducing the prototype's controls (seed, toggles, ramp fly-to, stats)
// plus generation timings from the worker, triangle / draw-call counts and a frame-time meter. Plain DOM controls.
import * as THREE from 'three';
import { makeHexGrid, worldToCell, type HexGrid } from '../gen/hex';
import { generateTerrainAsync, type TerrainBundle } from '../gen/terrain/client';
import { heightAt } from '../gen/terrain/queries';
import { NO_REGION } from '../gen/terrain/types';
import { createCameraRig, type CameraRig } from './camera/rig';
import { sharedUniforms } from './materials';
import { TerrainChunks } from './terrain/chunks';
import { createTerrainColourer, type TerrainColourer } from './terrain/colour';
import { PropsLayer } from './terrain/props';
import { buildWorldWater, type WorldWater } from './terrain/water';
import { updateSeasonLook } from './view/season';

const START_TYPES: Record<string, { id: string; river: boolean; snowBaseline: number; islands: number } | undefined> = {
  default: undefined,
  river_valley: { id: 'river_valley', river: true, snowBaseline: 0, islands: 1 },
  frozen_north: { id: 'frozen_north', river: false, snowBaseline: 1, islands: 1 },
  islands: { id: 'islands', river: false, snowBaseline: 0, islands: 4 },
};

export interface TerrainDebugHandle {
  generate(seed: number, radius: number, start: string): Promise<void>;
  stats(): Record<string, number | string>;
  gotoRamp(i: number): void;
  set(opts: Partial<DebugToggles>): void;
  rig(): CameraRig;
  props(): PropsLayer | null;
}

export interface DebugToggles { rocks: boolean; raw: boolean; trees: boolean; grid: boolean; region: boolean; ramps: boolean; fogOff: boolean }

declare global {
  interface Window { __terrainDebug?: TerrainDebugHandle }
}

const CSS = `
#tdbg{position:fixed;top:10px;left:10px;background:rgba(20,32,32,.82);color:#e8f0ee;padding:10px 12px;border-radius:8px;min-width:250px;
 font:12px/1.4 system-ui,sans-serif;user-select:none;z-index:50;pointer-events:auto}
#tdbg h1{font-size:13px;margin:0 0 6px;font-weight:600}
#tdbg label{display:block;margin:3px 0;cursor:pointer}
#tdbg input[type=number]{width:90px;background:#142020;color:#e8f0ee;border:1px solid #456;border-radius:4px;padding:2px 4px}
#tdbg select{background:#142020;color:#e8f0ee;border:1px solid #456;border-radius:4px;padding:2px 4px}
#tdbg button{background:#3f7d58;color:#fff;border:0;border-radius:4px;padding:3px 10px;cursor:pointer}
#tdbg button:hover{background:#4c9569}
#tdbg .row{display:flex;gap:6px;align-items:center;margin:0 0 6px}
#tdbg pre{margin:8px 0 0;font:11px ui-monospace,Menlo,monospace;opacity:.9;white-space:pre}
#tdbg-err{position:fixed;bottom:8px;left:10px;color:#ff8d8d;font:12px monospace;white-space:pre-wrap;max-width:80vw;z-index:50}
`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> & { id?: string } = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  Object.assign(e, props);
  for (const k of kids) e.append(k);
  return e;
}

export function mountTerrainDebug(canvas: HTMLCanvasElement, root: HTMLElement = document.body): TerrainDebugHandle {
  const style = el('style', { textContent: CSS });
  document.head.append(style);
  const errBox = el('div', { id: 'tdbg-err' });
  document.body.append(errBox);
  window.addEventListener('error', (e) => { errBox.textContent += `${e.message}\n`; });
  window.addEventListener('unhandledrejection', (e) => { errBox.textContent += `${String(e.reason)}\n`; });

  const q = new URLSearchParams(location.search);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 1, 2000);
  const fogHex = updateSeasonLook(0, 1, true);
  renderer.setClearColor(fogHex);
  const rig: CameraRig = createCameraRig(camera, canvas, { bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 }, zoomLevels: [16, 42, 150], pitchDeg: 38, fov: 30 });
  rig.snapTo(0, 0, 150);

  const tog: DebugToggles = { rocks: true, raw: false, trees: true, grid: false, region: false, ramps: false, fogOff: false };
  // ---- DOM ----
  const seedIn = el('input', { id: 'seed', type: 'number', value: q.get('seed') ?? '1337' });
  const radiusSel = el('select', { id: 'radius' });
  for (const r of [34, 40, 60]) radiusSel.append(el('option', { value: String(r), textContent: `radius ${r}${r === 40 ? ' (Small)' : r === 60 ? ' (Standard)' : ''}` }));
  radiusSel.value = q.get('radius') ?? '40';
  const startSel = el('select', { id: 'start' });
  for (const k of Object.keys(START_TYPES)) startSel.append(el('option', { value: k, textContent: k }));
  startSel.value = q.get('start') ?? 'default';
  const genBtn = el('button', { id: 'gen', textContent: 'New island' });
  const nextBtn = el('button', { id: 'nextRamp', textContent: 'Go to next ramp' });
  const stats = el('pre', { id: 'stats', textContent: '...' });
  const checks: Record<keyof DebugToggles, HTMLInputElement> = {} as never;
  const box = (key: keyof DebugToggles, label: string, id: string): HTMLLabelElement => {
    const cb = el('input', { type: 'checkbox', id, checked: tog[key] });
    checks[key] = cb;
    cb.onchange = (): void => { tog[key] = cb.checked; apply(); };
    return el('label', {}, cb, ` ${label}`);
  };
  const panel = el('div', { id: 'tdbg' },
    el('h1', { textContent: 'Hex island (terrain debug)' }),
    el('div', { className: 'row' }, 'Seed ', seedIn, genBtn),
    el('div', { className: 'row' }, radiusSel, startSel),
    box('rocks', 'show rocks', 'tRocks'), box('raw', 'show raw cliffs (hide rocks)', 'tRaw'), box('trees', 'show trees', 'tTrees'),
    box('grid', 'hex grid overlay', 'tGrid'), box('region', 'colour by region (debug)', 'tDbg'), box('ramps', 'highlight ramps', 'tRamp'),
    box('fogOff', 'fog off', 'tFog'),
    el('div', { className: 'row' }, nextBtn),
    stats,
  );
  checks.rocks.checked = true;
  checks.trees.checked = true;
  root.append(panel);

  // ---- scene pieces ----
  let bundle: TerrainBundle | null = null;
  let chunks: TerrainChunks | null = null;
  let props: PropsLayer | null = null;
  let water: WorldWater | null = null;
  let colourer: TerrainColourer | null = null;
  let gridLines: THREE.LineSegments | null = null;
  let grid: HexGrid | null = null;
  let rampIdx = -1;
  let genInfo = { wallMs: 0, progress: 0, stage: 'idle', events: 0, worker: false };
  let gen = 0;

  function clearWorld(): void {
    for (const o of [chunks?.group, props?.group, water?.group, gridLines]) if (o) scene.remove(o);
    chunks?.dispose(); props?.dispose(); water?.dispose();
    gridLines?.geometry.dispose();
    chunks = null; props = null; water = null; gridLines = null;
  }

  function buildGridLines(b: TerrainBundle): THREE.LineSegments {
    const g = b.logic.grid;
    const pos: number[] = [];
    const F = b.field;
    const SUB = 4;
    for (let c = 0; c < g.count; c++) {
      if ((b.logic.regionOf[c] ?? NO_REGION) === NO_REGION) continue;
      const cx = g.x[c]!;
      const cz = g.z[c]!;
      for (let k = 0; k < 6; k++) {
        const nb = g.nb[c * 6 + k]!;
        if (nb >= 0 && nb < c && (b.logic.regionOf[nb] ?? NO_REGION) !== NO_REGION) continue;
        const a0 = ((60 * k - 30) * Math.PI) / 180;
        const a1 = ((60 * k + 30) * Math.PI) / 180;
        for (let s = 0; s < SUB; s++) {
          const t0 = s / SUB;
          const t1 = (s + 1) / SUB;
          const p = (t: number): [number, number] => [cx + Math.cos(a0) + (Math.cos(a1) - Math.cos(a0)) * t, cz + Math.sin(a0) + (Math.sin(a1) - Math.sin(a0)) * t];
          const [x0, z0] = p(t0);
          const [x1, z1] = p(t1);
          pos.push(x0, heightAt(F, x0, z0) + 0.12, z0, x1, heightAt(F, x1, z1) + 0.12, z1);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const ls = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xfff6d8, transparent: true, opacity: 0.55, depthWrite: false }));
    ls.frustumCulled = false;
    ls.renderOrder = 5;
    return ls;
  }

  function apply(): void {
    if (tog.raw) tog.rocks = false;
    sharedUniforms.uFog.value.set(tog.fogOff ? 1e6 : 420, tog.fogOff ? 2e6 : 900);
    if (colourer && chunks) {
      colourer.setDebug({ region: tog.region, ramps: tog.ramps });
      chunks.invalidateColours();
    }
    props?.setKinds({ rocks: tog.rocks && !tog.raw, trees: tog.trees });
    if (gridLines) gridLines.visible = false;
    if (tog.grid && bundle) {
      if (!gridLines) { gridLines = buildGridLines(bundle); scene.add(gridLines); }
      gridLines.visible = true;
    }
  }

  async function generate(seed: number, radius: number, start: string): Promise<void> {
    const my = ++gen;
    seedIn.value = String(seed);
    radiusSel.value = String(radius);
    startSel.value = start;
    genInfo = { wallMs: 0, progress: 0, stage: 'starting', events: 0, worker: false };
    const t0 = performance.now();
    const params = { seed, radius, startType: START_TYPES[start] };
    const b = await generateTerrainAsync(params, (p, stage) => { if (my === gen) { genInfo.progress = p; genInfo.stage = stage; genInfo.events++; } });
    if (my !== gen) return;
    genInfo.wallMs = performance.now() - t0;
    genInfo.worker = b.viaWorker === true;
    genInfo.events = b.progressEvents ?? genInfo.events;
    clearWorld();
    bundle = b;
    grid = makeHexGrid(radius);
    const F = b.field;
    colourer = createTerrainColourer(F, b.logic.regionOf);
    chunks = new TerrainChunks(F, colourer);
    scene.add(chunks.group);
    let maxY = 0;
    for (let i = 0; i < F.n; i += 7) if (F.H[i]! > maxY) maxY = F.H[i]!;
    props = new PropsLayer(F, b.placements, maxY, (x, z) => (grid ? worldToCell(grid, x, z) : -1));
    scene.add(props.group);
    water = buildWorldWater(F);
    scene.add(water.group);
    rig.setBounds({ minX: F.x0 + 6, maxX: F.x0 + (F.GW - 1) * F.h - 6, minZ: F.z0 + 6, maxZ: F.z0 + (F.GH - 1) * F.h - 6 });
    rig.snapTo(0, 0, radius >= 60 ? 90 : 70);
    rampIdx = -1;
    apply();
    genInfo.progress = 1;
    genInfo.stage = 'ready';
  }

  function gotoRamp(i: number): void {
    if (!bundle || !bundle.field.ramps.length) return;
    const R = bundle.field.ramps;
    rampIdx = ((i % R.length) + R.length) % R.length;
    const r = R[rampIdx]!;
    rig.focus(r.px, r.pz, 24);
  }

  genBtn.onclick = (): void => { void generate(Number(seedIn.value) || 1, Number(radiusSel.value), startSel.value); };
  nextBtn.onclick = (): void => gotoRamp(rampIdx + 1);
  radiusSel.onchange = startSel.onchange = (): void => { void generate(Number(seedIn.value) || 1, Number(radiusSel.value), startSel.value); };

  // ---- frame loop + frame-time meter ----
  const frames: number[] = [];
  let last = performance.now();
  let lastText = 0;
  let w = 0;
  let h = 0;
  const snapshot = (): Record<string, number | string> => {
    const n = frames.length || 1;
    const avg = frames.reduce((a, b) => a + b, 0) / n;
    const sorted = [...frames].sort((a, b) => a - b);
    const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0;
    const info = renderer.info.render;
    const F = bundle?.field;
    return {
      fps: Math.round(1000 / Math.max(avg, 0.01)),
      frameMs: Math.round(avg * 10) / 10,
      frameP95Ms: Math.round(p95 * 10) / 10,
      triangles: info.triangles,
      terrainTriangles: chunks?.triangles ?? 0,
      propTriangles: props?.triangles ?? 0,
      drawCalls: info.calls,
      ramps: F?.stats.rampCount ?? 0,
      rampsOk: F?.stats.okCount ?? 0,
      maxSlope: F ? Math.round(F.stats.maxSlope * 100) / 100 : 0,
      logicMs: Math.round(bundle?.timings.logicMs ?? 0),
      fieldMs: Math.round(bundle?.timings.fieldMs ?? 0),
      placementMs: Math.round(bundle?.timings.placementMs ?? 0),
      totalMs: Math.round(bundle?.timings.totalMs ?? 0),
      wallMs: Math.round(genInfo.wallMs),
      worker: genInfo.worker ? 'yes' : 'no',
      progressEvents: genInfo.events,
    };
  };
  function loop(now: number): void {
    const dt = now - last;
    last = now;
    frames.push(dt);
    if (frames.length > 120) frames.shift();
    const cw = canvas.clientWidth || window.innerWidth;
    const ch = canvas.clientHeight || window.innerHeight;
    if (cw !== w || ch !== h) { w = cw; h = ch; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
    sharedUniforms.uTime.value = now / 1000;
    rig.update(Math.min(0.1, dt / 1000));
    if (bundle && chunks && props) {
      const tg = rig.getTarget();
      camera.position.y += heightAt(bundle.field, tg.x, tg.z);
      camera.lookAt(tg.x, heightAt(bundle.field, tg.x, tg.z), tg.z);
      camera.updateMatrixWorld(true);
      chunks.update(camera.position);
      props.update(camera, tg, rig.getDistance() > 110, null, 0);
    }
    renderer.render(scene, camera);
    if (now - lastText > 400) {
      lastText = now;
      const s = snapshot();
      const F = bundle?.field;
      const L = bundle?.logic.stats;
      const state = genInfo.stage === 'ready' ? '' : `generating ${(genInfo.progress * 100).toFixed(0)}% (${genInfo.stage})\n`;
      stats.textContent = `${state}gen: logic ${s['logicMs']} / field ${s['fieldMs']} / placements ${s['placementMs']} ms (worker ${s['worker']}, wall ${s['wallMs']} ms, ${s['progressEvents']} progress msgs)\n` +
        `land ${L?.landCells ?? 0} cells, ${L?.landRegions ?? 0} regions, ${L?.lakes ?? 0} lakes, ${F?.n ?? 0} samples\n` +
        `ramps ${s['ramps']} (slope ok ${s['rampsOk']}), max slope ${s['maxSlope']}${rampIdx >= 0 ? `, viewing ramp ${rampIdx + 1}` : ''}\n` +
        `triangles ${s['triangles']} (terrain ${s['terrainTriangles']}, props ${s['propTriangles']}), draw calls ${s['drawCalls']}\n` +
        `frame ${s['frameMs']} ms avg / ${s['frameP95Ms']} ms p95 = ${s['fps']} fps`;
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  const handle: TerrainDebugHandle = {
    generate,
    stats: snapshot,
    gotoRamp,
    set(o) {
      Object.assign(tog, o);
      for (const k of Object.keys(checks) as (keyof DebugToggles)[]) checks[k].checked = tog[k];
      apply();
    },
    rig: () => rig,
    props: () => props,
  };
  window.__terrainDebug = handle;
  void generate(Number(seedIn.value) || 1337, Number(radiusSel.value), startSel.value);
  return handle;
}
