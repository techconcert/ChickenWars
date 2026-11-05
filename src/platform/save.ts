// Saves: IndexedDB database 'hearthlands' (the old project name, kept so existing saves still load), object store 'saves', keys auto, slot1..3. Export/import as .json files.
import type { GameState } from '@sim/state';
import { deserialize, serialize, stringifySave } from '@sim/save/serialize';
import type { LoadResult, SaveFile, SaveMeta } from '@sim/save/serialize';
import { SaveError } from '@sim/save/migrate';

export type SlotId = 'auto' | 'slot1' | 'slot2' | 'slot3';
export const SLOTS: readonly SlotId[] = ['auto', 'slot1', 'slot2', 'slot3'];
const DB = 'hearthlands';
const STORE = 'saves';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('indexedDB open failed'));
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const r = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(r.result);
      t.onerror = () => reject(t.error ?? new Error('transaction failed'));
      t.onabort = () => reject(t.error ?? new Error('transaction aborted'));
    });
  } finally { db.close(); }
}

export function defaultTitle(state: GameState): string {
  return `Day ${state.season.day + 1}, year ${state.season.year + 1} (seed ${state.seed})`;
}

export async function saveToSlot(slot: SlotId, state: GameState, title = defaultTitle(state)): Promise<SaveMeta> {
  const file = serialize(state, Date.now(), title);
  await tx('readwrite', (s) => s.put(file, slot));
  return file.meta;
}

export async function loadFromSlot(slot: SlotId): Promise<LoadResult | null> {
  const file = await tx<SaveFile | undefined>('readonly', (s) => s.get(slot));
  return file ? deserialize(file) : null;
}

export async function listSlots(): Promise<Record<SlotId, SaveMeta | null>> {
  const out = { auto: null, slot1: null, slot2: null, slot3: null } as Record<SlotId, SaveMeta | null>;
  try {
    for (const slot of SLOTS) {
      const f = await tx<SaveFile | undefined>('readonly', (s) => s.get(slot));
      out[slot] = f?.meta ?? null;
    }
  } catch { /* IndexedDB unavailable: all empty */ }
  return out;
}

export async function deleteSlot(slot: SlotId): Promise<void> {
  await tx('readwrite', (s) => s.delete(slot));
}

/** Triggers a browser download of the state as a .json save file. */
export function exportToFile(state: GameState): void {
  const file = serialize(state, Date.now(), defaultTitle(state));
  const blob = new Blob([stringifySave(file)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `chickenwars-${state.seed}-d${state.season.day + 1}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Reads and validates a save file chosen by the player. Throws SaveError / Error with a friendly message. */
export async function importFromFile(file: File): Promise<LoadResult> {
  const text = await file.text();
  try {
    return deserialize(text);
  } catch (e) {
    if (e instanceof SaveError) throw e;
    throw new SaveError('bad_format', 'Could not read that save file.');
  }
}

export const AUTOSAVE_MS = 120_000;

/** Autosave every 2 real minutes and when the tab is hidden. Returns a stop function. */
export function startAutosave(getState: () => GameState, onSaved?: (m: SaveMeta) => void): () => void {
  const run = (): void => { void saveToSlot('auto', getState()).then((m) => onSaved?.(m)).catch(() => undefined); };
  const id = window.setInterval(run, AUTOSAVE_MS);
  const vis = (): void => { if (document.visibilityState === 'hidden') run(); };
  document.addEventListener('visibilitychange', vis);
  return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', vis); };
}

/** Loading replaces the whole world (terrain, renderer), so the chosen save is parked under 'pending' and the page reloads. */
export async function stashPending(res: LoadResult): Promise<void> {
  await tx('readwrite', (s) => s.put({ meta: res.meta, state: res.state } satisfies SaveFile, 'pending'));
}

export async function takePending(): Promise<LoadResult | null> {
  try {
    const f = await tx<SaveFile | undefined>('readonly', (s) => s.get('pending'));
    if (!f) return null;
    await tx('readwrite', (s) => s.delete('pending'));
    return deserialize(f);
  } catch { return null; }
}
