import * as THREE from 'three';
import { createCameraRig, type CameraRig } from './camera/rig';
import { createCelMaterial, getCelMaterial, getOutlineMaterial, createFogTexture, bindFogOfWar, setTime, setSeasonLook } from './materials';
import {
  BUILDING_MESH_IDS, GeoBuilder, animateUnit, PAL, animateMarch, animateMarker, animateSelectionRing, buildBuildingMesh, buildMarchGroup,
  buildPoiMarker, buildScaffoldMesh, buildSelectionRing, buildUnitMesh, NODE_KINDS, POI_KINDS, makeInstanced, makeOak, makePine,
  makeRockVariant, makeTuft, hexRGB, type MarkerKind,
} from './meshes';

export interface GalleryHandle {
  rig: CameraRig;
  view(name: string): void;
  views: Record<string, { x: number; z: number; dist: number }>;
  setSeason(s: 'spring' | 'summer' | 'autumn' | 'winter'): void;
  /** Swap every mesh to the fog-of-war materials with a test pattern (left unexplored, middle explored, right visible). */
  demoFog(): void;
  dispose(): void;
}

const COL = 2.3;
const ROW = 3.0;

function hexTile(col: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(1, 1, 0.1, 6).toNonIndexed();
  g.computeVertexNormals();
  const n = g.getAttribute('position').count;
  const c = new Float32Array(n * 3);
  const base = hexRGB(col);
  for (let i = 0; i < n; i++) c.set(base, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

/** Standalone debug view: every building/unit/marker on a grass plane with the cel + outline look. */
export function mountGallery(canvas: HTMLCanvasElement): GalleryHandle {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0xbfe0e4);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 1, 1000);
  const rig = createCameraRig(camera, canvas, {
    bounds: { minX: -20, maxX: 60, minZ: -40, maxZ: 20 },
    zoomLevels: [8, 20, 70],
    pitchDeg: 38,
    fov: 30,
    start: { x: 6, z: 3 },
  });

  const resize = (): void => {
    const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  const cel = createCelMaterial();
  const meadow = new THREE.Mesh((() => {
    const b = new GeoBuilder(1);
    b.ao = false;
    b.box(15, -0.4, -12, 100, 0.4, 80, PAL.meadow[0]!, { jitter: 0 });
    return b.build();
  })(), cel);
  scene.add(meadow);
  const tileGeos = [hexTile(PAL.meadow[1]!), hexTile(PAL.meadow[2]!)];
  const tile = (x: number, z: number, i: number): void => {
    const t = new THREE.Mesh(tileGeos[i % 2], cel);
    t.position.set(x, -0.1 + 0.1, z);
    t.position.y = 0;
    scene.add(t);
  };
  const animated: { obj: THREE.Object3D; kind: 'marker' | 'march' | 'ring' | 'scaffold'; moving?: boolean }[] = [];

  const views: GalleryHandle['views'] = {};

  // --- buildings: columns = type, rows = level 1/3/5/7/10 ---
  const levels = [1, 3, 5, 7, 10]; // stages 0..4
  BUILDING_MESH_IDS.forEach((id, ci) => {
    levels.forEach((lv, ri) => {
      const x = ci * COL, z = ri * ROW;
      tile(x, z, ci + ri);
      const g = buildBuildingMesh(id, lv);
      g.position.set(x, 0.05, z);
      scene.add(g);
    });
  });
  views['buildings-a'] = { x: 2.5 * COL, z: 2 * ROW, dist: 28 };
  views['buildings-b'] = { x: 8.5 * COL, z: 2 * ROW, dist: 28 };
  views['buildings-c'] = { x: 14.5 * COL, z: 2 * ROW, dist: 29 };
  views['buildings'] = { x: 8 * COL, z: 2 * ROW, dist: 60 };
  views['close'] = { x: 0, z: 0, dist: 8 };

  // --- town hall stages ---
  [1, 5, 10, 15, 20, 25].forEach((lv, i) => {
    const x = i * 2.6, z = -5.2;
    tile(x, z, i);
    const g = buildBuildingMesh('hall', lv);
    g.position.set(x, 0.05, z);
    scene.add(g);
  });
  views['halls'] = { x: 6.5, z: -4.2, dist: 20 };

  // --- scaffolds, damaged, banners / accents ---
  [0.1, 0.5, 0.9].forEach((p, i) => {
    const x = 17 + i * 2.4, z = -5.2;
    tile(x, z, i);
    const s = buildScaffoldMesh(p);
    s.position.set(x, 0.05, z);
    scene.add(s);
  });
  const dmg = buildBuildingMesh('house', 5, { damaged: true });
  dmg.position.set(24.2, 0.05, -5.2);
  tile(24.2, -5.2, 1);
  scene.add(dmg);
  const accent = buildBuildingMesh('barracks', 10, { banner: '#a83c3c', roofAccent: '#3c6ea8' });
  accent.position.set(26.5, 0.05, -5.2);
  tile(26.5, -5.2, 0);
  scene.add(accent);
  views['scaffold'] = { x: 21.5, z: -5.2, dist: 14 };

  // --- units ---
  const unitRow = -10;
  const specs: [Parameters<typeof buildUnitMesh>[0], string, 'ram' | 'catapult'][] = [
    ['infantry', '#3c6ea8', 'ram'], ['infantry', '#a83c3c', 'ram'], ['archer', '#3c6ea8', 'ram'], ['archer', '#a83c3c', 'ram'],
    ['cavalry', '#3c6ea8', 'ram'], ['cavalry', '#a83c3c', 'ram'], ['siege', '#3c6ea8', 'ram'], ['siege', '#a83c3c', 'catapult'], ['hero', '#3c6ea8', 'ram'],
  ];
  specs.forEach(([cls, tint, v], i) => {
    const u = buildUnitMesh(cls, tint, v, tint === '#a83c3c' ? 'human' : 'chicken');
    u.position.set(i * 1.3, 0, unitRow);
    scene.add(u);
    animated.push({ obj: u, kind: 'march', moving: i % 2 === 0 });
  });
  const compositions = [{ infantry: 8, archer: 2 }, { infantry: 30, archer: 20, cavalry: 10 }, { cavalry: 600, infantry: 700, siege: 100, archer: 200 }];
  compositions.forEach((c, i) => {
    const m = buildMarchGroup(c, i === 1 ? '#a83c3c' : '#3c6ea8', i === 1 ? 'human' : 'chicken');
    m.position.set(i * 3.0 + 1, 0, unitRow - 3);
    scene.add(m);
    animated.push({ obj: m, kind: 'march', moving: i !== 2 });
  });
  views['units'] = { x: 6, z: unitRow - 1.6, dist: 13 };

  // --- markers ---
  const rowA = -21, rowB = -24.5, rowC = -28, rowD = -31.5;
  const put = (m: THREE.Group, x: number, z: number, i: number): void => {
    tile(x, z, i);
    m.position.set(x, 0.05, z);
    scene.add(m);
    animated.push({ obj: m, kind: 'marker' });
  };
  [...POI_KINDS].forEach((k: MarkerKind, i) => put(buildPoiMarker(k, 3), i * 2.3, rowA, i));
  [1, 2, 3, 4, 5].forEach((t, i) => put(buildPoiMarker('camp', t), i * 2.3, rowB, i));
  [1, 2, 3, 4].forEach((t, i) => put(buildPoiMarker('lair', t), i * 2.3, rowC, i));
  put(buildPoiMarker('boss', 5), 4 * 2.3, rowC, 0);
  NODE_KINDS.forEach((k, i) => put(buildPoiMarker(k, 2), i * 2.3, rowD, i));
  const ring = buildSelectionRing();
  ring.position.set(12.5, 0.06, rowD);
  scene.add(ring);
  animated.push({ obj: ring, kind: 'ring' });
  const props = new THREE.Group();
  props.add(makeInstanced(makePine(1), null, Array.from({ length: 5 }, (_, i) => ({ x: 14 + i * 0.7, y: 0, z: rowD - 0.5 + (i % 2) * 0.8, scale: 0.7 })), true));
  props.add(makeInstanced(makeOak(0), null, [{ x: 17.5, y: 0, z: rowD, scale: 0.8 }], true));
  props.add(makeInstanced(makeRockVariant(2), null, [{ x: 18.8, y: 0.1, z: rowD }, { x: 19.5, y: 0.1, z: rowD + 0.4, scale: 0.6 }], true, 0.05));
  props.add(makeInstanced(makeTuft(0.3), null, Array.from({ length: 8 }, (_, i) => ({ x: 20.2 + (i % 4) * 0.3, y: 0, z: rowD + Math.floor(i / 4) * 0.3 })), false));
  scene.add(props);
  views['markers'] = { x: 8, z: rowA, dist: 15 };
  views['camps'] = { x: 5.5, z: rowB, dist: 13 };
  views['lairs'] = { x: 5.5, z: rowC, dist: 13 };
  views['nodes'] = { x: 6, z: rowD, dist: 12 };

  const setSeason = (s: 'spring' | 'summer' | 'autumn' | 'winter'): void => {
    setSeasonLook({ snowBlend: s === 'winter' ? 0.9 : 0, leafShift: s === 'autumn' ? 0.9 : 0 });
  };

  const demoFog = (): void => {
    const f = createFogTexture(64, 32);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 64; x++) f.data[y * 64 + x] = x < 22 ? 0 : x < 42 ? 128 : 255;
    f.texture.needsUpdate = true;
    bindFogOfWar(f.texture, -5, -40, 50, 50);
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (o.userData['isOutline']) m.material = getOutlineMaterial((o.userData['colour'] as number | null) ?? null, (o.userData['thickness'] as number) ?? 0.06, true);
      else if (m.material === cel || (m.material as THREE.Material).name === 'cel') m.material = getCelMaterial({ fogOfWar: true });
    });
  };

  let raf = 0;
  const clock = new THREE.Clock();
  const loop = (): void => {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.1, clock.getDelta());
    const t = clock.elapsedTime;
    setTime(t);
    rig.update(dt);
    for (const a of animated) {
      if (a.kind === 'marker') animateMarker(a.obj, t);
      else if (a.kind === 'ring') animateSelectionRing(a.obj as THREE.Mesh, t);
      else if (a.obj.userData['figures']) animateMarch(a.obj as THREE.Group, t, a.moving ?? false);
      else animateUnit(a.obj as THREE.Group, t, a.moving ?? false);
    }
    renderer.render(scene, camera);
  };
  loop();

  const handle: GalleryHandle = {
    rig,
    views,
    view(name) {
      const v = views[name];
      if (v) rig.snapTo(v.x, v.z, v.dist);
    },
    setSeason,
    demoFog,
    dispose() {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      rig.dispose();
      renderer.dispose();
    },
  };
  return handle;
}
