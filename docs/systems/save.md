# Save and load

- Format: `{ meta: {version, savedAt, playTicks, hash, title}, state: GameState }` JSON.
- Storage: IndexedDB database `hearthlands`, object store `saves`, keys `auto`, `slot1..3`. Autosave every 2 real minutes and on `visibilitychange` hidden, and after every completed boss kill.
- Export/import: download/upload `.json` file (no server). Import validates schema and version.
- Migration: `migrations[v]` functions `v -> v+1`, each with a test fixture. Unknown newer version = refuse with message.
- Integrity: `hash` = FNV-1a 32-bit over canonical JSON (sorted keys). Mismatch warns but allows loading.
- Terrain is regenerated from `state.seed` + `state.options`; if generation produces a different logic-layer hash than stored `terrainHash`, show an error (guards against generator changes breaking old saves). Bump `GENERATOR_VERSION` on any change to the generator and keep old generators only if backward compatibility is wanted (default: not, saves are invalidated with a clear message during development).
