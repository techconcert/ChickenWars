import { useEffect, useMemo, useRef } from 'preact/hooks';
import type { JSX } from 'preact';
import { makeHexGrid, worldToCell } from '@gen/hex';
import { marchCell } from '@sim/nav/position';
import type { GameState } from '@sim/state';
import { useGame } from '../hooks';
import { S } from '../strings';

const SIZE = 200;
const BIOME_COL: [number, number, number][] = [[228, 211, 160], [143, 191, 106], [79, 138, 71], [160, 147, 120], [236, 241, 243]];
const SEA: [number, number, number] = [102, 160, 178];
const RES_COL: Record<string, string> = { food: '#e6c14a', wood: '#7a5538', stone: '#cfd0cc', gold: '#ffd24a', ember: '#ff7a3a' };

interface Layout { g: ReturnType<typeof makeHexGrid>; scale: number; ox: number; oy: number; px: Float32Array; py: Float32Array }

function layoutFor(radius: number): Layout {
  const g = makeHexGrid(radius);
  const half = Math.sqrt(3) * (radius + 0.5);
  const hz = 1.5 * radius + 1;
  const scale = (SIZE / 2 - 3) / Math.max(half, hz);
  const px = new Float32Array(g.count);
  const py = new Float32Array(g.count);
  for (let i = 0; i < g.count; i++) { px[i] = SIZE / 2 + g.x[i]! * scale; py[i] = SIZE / 2 + g.z[i]! * scale; }
  return { g, scale, ox: SIZE / 2, oy: SIZE / 2, px, py };
}

/**
 * Cached terrain/fog layer: the per-cell squares only change when fog, region tiers or the world arrays change, so they are
 * drawn once into an offscreen canvas and copied (1:1, integer offset) on the 8 Hz redraws in between.
 */
interface TerrainLayer { cv: HTMLCanvasElement; L: Layout; fog: Uint8Array; tiers: number[]; regionOf: unknown; biome: unknown }
let layer: TerrainLayer | null = null;

function layerFresh(t: TerrainLayer, L: Layout, w: GameState['world']): boolean {
  if (t.L !== L || t.regionOf !== w.regionOf || t.biome !== w.biome || t.fog.length !== w.fog.length || t.tiers.length !== w.regions.length) return false;
  for (let i = 0; i < t.fog.length; i++) if (t.fog[i] !== (w.fog[i] ?? 0)) return false;
  for (let i = 0; i < t.tiers.length; i++) if (t.tiers[i] !== (w.regions[i]?.dangerTier ?? 1)) return false;
  return true;
}

function drawTerrain(c: CanvasRenderingContext2D, L: Layout, w: GameState['world']): void {
  const cs = Math.max(1.6, L.scale * 1.75);
  for (let i = 0; i < L.g.count; i++) {
    const reg = w.regionOf[i] ?? -1;
    const fog = w.fog[i] ?? 0;
    let col = SEA;
    if (reg >= 0) {
      col = BIOME_COL[w.biome[i] ?? 1] ?? BIOME_COL[1]!;
      const tier = w.regions[reg]?.dangerTier ?? 1;
      const k = Math.min(0.5, (tier - 1) * 0.08);
      col = [col[0] * (1 - k) + 168 * k, col[1] * (1 - k) + 60 * k, col[2] * (1 - k) + 60 * k];
    }
    const dim = fog === 2 ? 1 : fog === 1 ? 0.62 : reg >= 0 ? 0.45 : 0.6;
    const grey = fog === 0 ? 0.55 : 0;
    const r = col[0] * dim * (1 - grey) + 120 * grey * dim;
    const gg = col[1] * dim * (1 - grey) + 112 * grey * dim;
    const b = col[2] * dim * (1 - grey) + 100 * grey * dim;
    c.fillStyle = `rgb(${r | 0},${gg | 0},${b | 0})`;
    c.fillRect(L.px[i]! - cs / 2, L.py[i]! - cs / 2, cs, cs);
  }
}

/** The terrain layer canvas for the current world, redrawn only when its inputs changed; null when no 2D context. */
function terrainLayer(L: Layout, w: GameState['world']): HTMLCanvasElement | null {
  if (layer && layerFresh(layer, L, w)) return layer.cv;
  const cv = layer?.cv ?? document.createElement('canvas');
  cv.width = SIZE;
  cv.height = SIZE;
  const c = cv.getContext('2d');
  if (!c) return null;
  c.clearRect(0, 0, SIZE, SIZE);
  drawTerrain(c, L, w);
  layer = { cv, L, fog: Uint8Array.from(w.fog, (v) => v ?? 0), tiers: w.regions.map((r) => r?.dangerTier ?? 1), regionOf: w.regionOf, biome: w.biome };
  return cv;
}

function draw(cv: HTMLCanvasElement, L: Layout, s: Readonly<GameState>): void {
  const c = cv.getContext('2d');
  if (!c) return;
  const w = s.world;
  c.clearRect(0, 0, SIZE, SIZE);
  const base = terrainLayer(L, w);
  if (base) c.drawImage(base, 0, 0);
  else drawTerrain(c, L, w);
  for (const id of Object.keys(w.nodes)) {
    const n = w.nodes[id]!;
    if ((w.fog[n.cell] ?? 0) < 1) continue;
    c.fillStyle = RES_COL[n.resource] ?? '#fff';
    c.fillRect(L.px[n.cell]! - 1, L.py[n.cell]! - 1, 2, 2);
  }
  for (const id of Object.keys(w.pois)) {
    const p = w.pois[id]!;
    if ((w.fog[p.cell] ?? 0) < 1 || !p.active) continue;
    const fight = p.kind === 'bandit_camp' || p.kind === 'lair' || p.kind === 'boss';
    c.fillStyle = fight ? '#d63a3a' : p.kind === 'village' ? '#4c8a3e' : '#e0e0e0';
    c.beginPath(); c.arc(L.px[p.cell]!, L.py[p.cell]!, fight ? (p.kind === 'boss' ? 3.5 : 2.4) : 2, 0, Math.PI * 2); c.fill();
    if (fight) { c.strokeStyle = '#2a1a1a'; c.lineWidth = 0.8; c.stroke(); }
  }
  const cap = w.capitalCell;
  c.fillStyle = '#ffd24a'; c.strokeStyle = '#3a2f26'; c.lineWidth = 1.2;
  c.fillRect(L.px[cap]! - 3.5, L.py[cap]! - 3.5, 7, 7); c.strokeRect(L.px[cap]! - 3.5, L.py[cap]! - 3.5, 7, 7);
  for (const id of Object.keys(s.marches)) {
    const m = s.marches[id]!;
    const cell = marchCell(m);
    if (cell < 0) continue;
    c.fillStyle = '#fff'; c.strokeStyle = '#2a4a8a'; c.lineWidth = 1.2;
    c.beginPath(); c.arc(L.px[cell]!, L.py[cell]!, 2.8, 0, Math.PI * 2); c.fill(); c.stroke();
  }
}

export function Minimap(): JSX.Element {
  const { client, state } = useGame();
  const ref = useRef<HTMLCanvasElement>(null);
  const L = useMemo(() => layoutFor(state.world.radius), [state.world.radius]);
  useEffect(() => { if (ref.current) draw(ref.current, L, state); });
  const click = (e: MouseEvent): void => {
    const cv = ref.current;
    if (!cv) return;
    const rect = cv.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * SIZE;
    const y = ((e.clientY - rect.top) / rect.height) * SIZE;
    const cell = worldToCell(L.g, (x - L.ox) / L.scale, (y - L.oy) / L.scale);
    if (cell >= 0) client.focusCell('world', cell);
  };
  return (
    <div class="minimap" aria-label={S.minimap}>
      <canvas ref={ref} width={SIZE} height={SIZE} onClick={click} title={S.fogTip} />
    </div>
  );
}
