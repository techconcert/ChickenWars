// Boot: URL params -> loading screen -> load autosave or new game -> renderer -> rAF loop -> Preact UI.
import { GameClient } from '@app/game';
import { createNewGame } from '@app/newGame';
import { buildDemoState } from '@app/demo';
import { startAutosave, loadFromSlot, saveToSlot, takePending } from '@platform/save';
import { applySettingsToDom, getSettings, subscribeSettings } from '@platform/settings';
import { catchUp } from '@sim/tick';
import { START_TYPES } from '@sim/data/registry';
import { generateTerrainLogic } from '@gen/terrain/logic';
import { startTypeParams } from '@app/newGame';
import { TICKS_PER_SECOND } from '@sim/constants';
import type { GameOptions, GameState } from '@sim/state';
import type { GameEvent } from '@sim/events';
import { bindAudio } from '@platform/audio/bind';
import { registerServiceWorker } from '@platform/pwa';
import { mountUI, showAway } from '@ui/index';
import { S } from '@ui/strings';
import { ui } from '@ui/store';

interface RendererHandle { dispose(): void; setQuality?(q: string): void; frame(dtMs: number): void; getStats?(): Record<string, number> }
type RendererFactory = (canvas: HTMLCanvasElement, client: GameClient) => RendererHandle;

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('game') as HTMLCanvasElement;
const bar = document.getElementById('lbar-fill');
const text = document.getElementById('ltext');
const loading = document.getElementById('loading');
const setLoading = (p: number, msg: string): void => {
  if (bar) bar.style.width = `${Math.round(Math.max(0, Math.min(1, p)) * 100)}%`;
  if (text) text.textContent = msg;
};
const nextPaint = (): Promise<void> => new Promise((r) => setTimeout(r, 20));
const num = (k: string): number | null => { const v = params.get(k); return v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null; };

const debugParam = params.get('debug');
const wantDebug = params.has('debug');

async function loadRendererFactory(): Promise<RendererFactory | null> {
  const mods = import.meta.glob('./render/engine.ts');
  const loader = mods['./render/engine.ts'];
  if (!loader) return null;
  try {
    const m = (await loader()) as { createRenderer?: RendererFactory };
    return m.createRenderer ?? null;
  } catch (e) {
    console.warn('renderer failed to load', e);
    return null;
  }
}

function summarise(events: GameEvent[], ms: number) {
  let built = 0, trained = 0, returned = 0, gathered = 0, battles = 0, lost = 0;
  for (const e of events) {
    if (e.t === 'BuildingCompleted' || e.t === 'BuildingUpgraded') built++;
    else if (e.t === 'TroopsTrained') trained += e.count;
    else if (e.t === 'MarchReturned') { returned++; for (const k of Object.keys(e.carried) as (keyof typeof e.carried)[]) gathered += e.carried[k] ?? 0; }
    else if (e.t === 'BattleResolved') battles++;
    else if (e.t === 'ResourceOverflow') lost += e.lost;
  }
  return { ms, built, trained, returned, gathered, battles, lost };
}

/** Rebuilds the terrain logic hash from seed+options; a mismatch means the generator changed since the save. */
function terrainMatches(s: GameState): boolean {
  try {
    const l = generateTerrainLogic(s.seed, { radius: s.world.radius, startType: startTypeParams(s.options.startType) });
    return l.hash === s.world.terrainHash;
  } catch { return false; }
}

async function boot(): Promise<void> {
  applySettingsToDom();
  if (debugParam === 'gallery') {
    loading?.remove();
    const { mountGallery } = await import('./render/gallery');
    (window as unknown as { __gallery?: unknown }).__gallery = mountGallery(canvas);
    return;
  }
  if (debugParam === 'terrain') {
    // standalone terrain inspector: no game state, no HUD (src/render/terrainDebug.ts)
    loading?.remove();
    const { mountTerrainDebug } = await import('./render/terrainDebug');
    mountTerrainDebug(canvas, document.getElementById('ui') ?? document.body);
    return;
  }
  setLoading(0.05, S.loading);
  await nextPaint();

  const seedParam = num('seed');
  const size = (params.get('size') === 'standard' ? 'standard' : 'small') as GameOptions['size'];
  const opts = {
    seed: seedParam ?? 1337, size,
    difficulty: (['easy', 'normal', 'hard'].includes(params.get('difficulty') ?? '') ? params.get('difficulty') : 'normal') as GameOptions['difficulty'],
    startType: START_TYPES[params.get('start') ?? ''] ? (params.get('start') as string) : 'river_valley', clan: params.get('clan') ?? 'oakwarden',
  };
  let client: GameClient | null = null;
  let away: ReturnType<typeof summarise> | null = null;
  let staleSave = false;
  const forceNew = params.has('demo') || params.get('new') === '1' || seedParam !== null;

  if (!forceNew) {
    try {
      const pending = await takePending();
      const res = pending ?? (await loadFromSlot('auto'));
      if (res && terrainMatches(res.state)) {
        const st = res.state;
        if (!pending) {
          const ticks = Math.floor(((Date.now() - res.meta.savedAt) / 1000) * TICKS_PER_SECOND);
          if (ticks >= 600) {
            setLoading(0.3, S.loadingCatchUp);
            await nextPaint();
            // one call: runOffline plays the first minutes exactly and fast-forwards the rest (D47); chunking it would replay the exact part every chunk
            const total = Math.min(ticks, 288000);
            const events: GameEvent[] = [...catchUp(st, total)];
            away = summarise(events, ticks * 100);
          }
        }
        client = new GameClient(st);
      } else if (res) { staleSave = true; console.warn('saved terrain no longer matches the generator; starting a new game'); }
    } catch (e) { console.warn('could not load save', e); }
  }
  if (!client) {
    setLoading(0.15, S.loadingSim);
    await nextPaint();
    opts.seed = seedParam ?? (params.has('demo') ? 1337 : Date.now() >>> 0);
    client = createNewGame(opts);
    if (params.has('demo')) { setLoading(0.25, S.loadingSim); await nextPaint(); client = new GameClient(buildDemoState(client.getState() as GameState)); }
    void saveToSlot('auto', client.getState()).catch(() => undefined);
  }
  const scene = params.get('scene');
  if (scene === 'world' || scene === 'base') client.setScene(scene);

  const onTerrain = (e: Event): void => {
    const d = (e as CustomEvent<{ p: number; stage: string }>).detail;
    if (d) { setLoading(0.4 + 0.6 * d.p, `${S.loadingTerrain} (${d.stage})`); if (d.p >= 1) finish(); }
  };
  let finished = false;
  const finish = (): void => {
    if (finished) return;
    finished = true;
    window.removeEventListener('hl-terrain-progress', onTerrain);
    loading?.classList.add('done');
    setTimeout(() => loading?.remove(), 600);
    if (away) showAway(away);
  };
  window.addEventListener('hl-terrain-progress', onTerrain);
  setLoading(0.4, S.loadingTerrain);

  let renderer: RendererHandle | null = null;
  const factory = debugParam === 'terrain' ? null : await loadRendererFactory();
  if (factory) {
    try { renderer = factory(canvas, client); } catch (e) { console.error('createRenderer failed', e); }
  }
  if (renderer) {
    const r = renderer;
    let lastQ = '';
    const applyQuality = (): void => { const q = getSettings().quality; if (q !== lastQ) { lastQ = q; r.setQuality?.(q); } };
    applyQuality();
    subscribeSettings(applyQuality);
  }
  if (debugParam === 'terrain') {
    const mods = import.meta.glob('./render/terrainDebug.ts');
    const l = mods['./render/terrainDebug.ts'];
    if (l) { const m = (await l()) as { mountTerrainDebug?: (c: HTMLCanvasElement) => void }; m.mountTerrainDebug?.(canvas); }
  }
  let fallback: CanvasRenderingContext2D | null = null;
  if (!renderer) {
    fallback = canvas.getContext('2d');
    canvas.width = window.innerWidth; canvas.height = window.innerHeight;
    if (fallback) { fallback.fillStyle = '#bfe0e4'; fallback.fillRect(0, 0, canvas.width, canvas.height); }
    finish();
  } else {
    setTimeout(finish, 25000); // never trap the player behind the loading screen
    setTimeout(() => { if (!finished && Object.keys(client!.getState().world.nodes).length >= 0 && !terrainSeen) finish(); }, 2500);
  }
  let terrainSeen = false;
  window.addEventListener('hl-terrain-progress', () => { terrainSeen = true; }, { once: true });

  const c = client;
  mountUI(document.getElementById('ui') as HTMLElement, c, () => renderer?.getStats?.() ?? null, wantDebug);
  if (staleSave) ui.toast(S.staleSave, 'warning', true);
  startAutosave(() => c.getState() as GameState);
  bindAudio(c);
  registerServiceWorker();

  let last = performance.now();
  const loop = (now: number): void => {
    const dt = Math.min(250, now - last);
    last = now;
    c.frame(dt);
    renderer?.frame(dt);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  if (import.meta.env.DEV || wantDebug) {
    (window as unknown as { __game: unknown }).__game = {
      client: c,
      advanceTicks: (n: number) => c.advanceTicks(n),
      get state() { return c.getState(); },
      get renderer() { return renderer; },
    };
  }
}

boot().catch((e) => {
  console.error(e);
  if (text) text.textContent = `Could not start: ${e instanceof Error ? e.message : String(e)}`;
});
