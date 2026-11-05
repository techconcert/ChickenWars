// Seeded randomness. State is a plain u32 stored in GameState.rng.

/** Mulberry32 step on the shared stream; returns a float in [0,1). */
export function rngNext(state: { rng: number }): number {
  state.rng = (state.rng + 0x6d2b79f5) >>> 0;
  let t = state.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Integer in [0, n). */
export function rngInt(state: { rng: number }, n: number): number {
  return Math.floor(rngNext(state) * n);
}

/** Integer in [lo, hi] inclusive. */
export function rngRange(state: { rng: number }, lo: number, hi: number): number {
  return lo + rngInt(state, hi - lo + 1);
}

/** FNV-1a over the string form of every part, then a murmur3 finaliser. Returns u32. */
export function hash32(...parts: (number | string)[]): number {
  let h = 0x811c9dc5;
  for (let p = 0; p < parts.length; p++) {
    const s = (p === 0 ? '' : '\u0001') + String(parts[p]);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Independent roll in [0,1) that does not consume the shared stream. */
export function hashRand(seed: number, tag: string, tick: number, id: number | string): number {
  return hash32(seed, tag, tick, id) / 4294967296;
}
