# Audio

WebAudio synthesis only (no files). `src/platform/audio.ts` exposes `play(sfxId)`, `setMusic(mood)`, volumes, mute. Starts muted until first user interaction (browser policy).

SFX recipes (oscillator + noise + envelope + filter): ui click, build start, build complete (rising chime), coin/resource pickup, march horn, battle start (drum), hit, hero skill (whoosh + chime), raid warning (alarm horn), level up, quest complete, season change.
Music: one short pentatonic loop per season mood generated from a seeded sequencer; low priority (M10).

Events -> sounds via a single mapping table `eventSounds` (no direct calls from sim).
