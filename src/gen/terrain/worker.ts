/// <reference lib="webworker" />
import { generateTerrainSync, toTransferable, type TerrainParams } from './bundle';

interface WorkerScope {
  postMessage(msg: unknown, transfer?: Transferable[]): void;
  onmessage: ((e: MessageEvent<TerrainParams>) => void) | null;
}
const scope = self as unknown as WorkerScope;

export type WorkerMessage =
  | { type: 'progress'; p: number; stage: string }
  | { type: 'done'; data: ReturnType<typeof toTransferable>['data'] }
  | { type: 'error'; message: string };

/** Web Worker entry: receives {seed, radius, startType, ...}, posts progress, then the bundle with transferred buffers. */
scope.onmessage = (e: MessageEvent<TerrainParams>): void => {
  try {
    const bundle = generateTerrainSync(e.data, (p, stage) => scope.postMessage({ type: 'progress', p, stage } satisfies WorkerMessage), () => performance.now());
    const { data, buffers } = toTransferable(bundle);
    scope.postMessage({ type: 'done', data } satisfies WorkerMessage, buffers);
  } catch (err) {
    scope.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) } satisfies WorkerMessage);
  }
};
