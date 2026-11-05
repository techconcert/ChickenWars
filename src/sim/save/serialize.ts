import { SAVE_VERSION } from '../constants';
import type { GameState } from '../state';
import { hashState } from './hash';
import { migrateState, SaveError } from './migrate';

export interface SaveMeta { version: number; savedAt: number; playTicks: number; hash: number; title: string }
export interface SaveFile { meta: SaveMeta; state: GameState }

/** `savedAt` is passed in (wall clock is read only in platform/). */
export function serialize(state: GameState, savedAt: number, title = ''): SaveFile {
  const copy = JSON.parse(JSON.stringify(state)) as GameState;
  return { meta: { version: state.version, savedAt, playTicks: state.tick, hash: hashState(copy), title }, state: copy };
}

export const stringifySave = (file: SaveFile): string => JSON.stringify(file);

export interface LoadResult { state: GameState; meta: SaveMeta; hashOk: boolean }

/** Parses, hash-checks (mismatch warns via hashOk but still loads) and migrates a save. */
export function deserialize(input: string | unknown): LoadResult {
  let raw: unknown = input;
  if (typeof input === 'string') {
    try { raw = JSON.parse(input); } catch { throw new SaveError('bad_format', 'Save is not valid JSON.'); }
  }
  const f = raw as Partial<SaveFile> | null;
  if (!f || typeof f !== 'object' || !f.meta || !f.state || typeof f.meta.version !== 'number') throw new SaveError('bad_format', 'Save file has an unexpected shape.');
  const hashOk = hashState(f.state) === f.meta.hash;
  const migrated = migrateState(f.state as unknown as Record<string, unknown>, f.meta.version) as unknown as GameState;
  return { state: migrated, meta: { ...f.meta, version: SAVE_VERSION }, hashOk };
}
