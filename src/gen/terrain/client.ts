import { fromTransferable, generateTerrainSync, terrainCacheKey, type TerrainBundle, type TerrainParams, type TerrainProgress } from './bundle';
import type { WorkerMessage } from './worker';

export * from './bundle';

const cache = new Map<string, Promise<TerrainBundle>>();

export function clearTerrainCache(): void {
  cache.clear();
}

/**
 * Generate terrain off the main thread. Cached by (seed, radius, start type id). Falls back to the synchronous
 * path when Workers are unavailable (tests, SSR).
 */
export function generateTerrainAsync(params: TerrainParams, onProgress?: TerrainProgress): Promise<TerrainBundle> {
  const key = terrainCacheKey(params);
  const hit = cache.get(key);
  if (hit) {
    void hit.then(() => onProgress?.(1, 'cached'));
    return hit;
  }
  const p = typeof Worker === 'undefined'
    ? Promise.resolve().then(() => generateTerrainSync(params, onProgress, () => (typeof performance !== 'undefined' ? performance.now() : 0)))
    : new Promise<TerrainBundle>((resolve, reject) => {
        const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
        let events = 0;
        worker.onmessage = (e: MessageEvent<WorkerMessage>): void => {
          const m = e.data;
          if (m.type === 'progress') { events++; onProgress?.(m.p, m.stage); }
          else if (m.type === 'done') {
            worker.terminate();
            resolve({ ...fromTransferable(m.data), viaWorker: true, progressEvents: events });
          } else {
            worker.terminate();
            reject(new Error(m.message));
          }
        };
        worker.onerror = (e: ErrorEvent): void => {
          worker.terminate();
          reject(new Error(e.message));
        };
        worker.postMessage(params);
      });
  cache.set(key, p);
  p.catch(() => cache.delete(key));
  return p;
}
