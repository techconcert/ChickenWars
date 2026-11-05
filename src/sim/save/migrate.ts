import { SAVE_VERSION } from '../constants';

export class SaveError extends Error {
  constructor(public code: 'newer_version' | 'bad_format', message: string) { super(message); }
}

/** migrations[v] upgrades raw state from version v to v+1. Each entry needs a fixture test. */
export const migrations: Record<number, (state: Record<string, unknown>) => Record<string, unknown>> = {
  /**
   * v0 -> v1 (pre-release saves): fields added before the first public format were missing, so they get their defaults:
   * `buffs`, `reports`, `log`, `chronicle`, `stats.bossesKilled`, `city.market`, `flags`.
   * Documented as the template for future migrations (see tests/sim/save.test.ts for the synthetic v0 fixture).
   */
  0: (s) => {
    const out = { ...s };
    out['buffs'] = Array.isArray(out['buffs']) ? out['buffs'] : [];
    out['reports'] = Array.isArray(out['reports']) ? out['reports'] : [];
    out['log'] = Array.isArray(out['log']) ? out['log'] : [];
    out['chronicle'] = Array.isArray(out['chronicle']) ? out['chronicle'] : [{ tick: 0, text: 'The first egg is laid. A new farm is founded.' }];
    out['flags'] = { won: false, sandbox: false, safeMode: false, ...((out['flags'] as object | undefined) ?? {}) };
    out['stats'] = { battlesWon: 0, battlesLost: 0, gathered: 0, campsCleared: 0, bossesKilled: 0, ...((out['stats'] as object | undefined) ?? {}) };
    const city = { ...((out['city'] as Record<string, unknown> | undefined) ?? {}) };
    city['market'] = (city['market'] as object | undefined) ?? {};
    out['city'] = city;
    return out;
  },
};

/** Brings a raw state object up to SAVE_VERSION. Refuses newer saves. */
export function migrateState(raw: Record<string, unknown>, fromVersion: number): Record<string, unknown> {
  if (fromVersion > SAVE_VERSION) throw new SaveError('newer_version', `Save version ${fromVersion} is newer than this game (${SAVE_VERSION}).`);
  let s = raw;
  for (let v = fromVersion; v < SAVE_VERSION; v++) {
    const m = migrations[v];
    if (!m) throw new SaveError('bad_format', `No migration from save version ${v}.`);
    s = m(s);
    s.version = v + 1;
  }
  return s;
}
