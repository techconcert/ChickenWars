import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { SAVE_VERSION } from '@sim/constants';
import { canonicalJson, hashState } from '@sim/save/hash';
import { migrateState, SaveError } from '@sim/save/migrate';
import { deserialize, serialize, stringifySave } from '@sim/save/serialize';
import { advance } from '@sim/tick';
import { makeState } from '../helpers/makeState';

describe('save', () => {
  it('canonical json sorts keys and hash matches FNV-1a of it', () => {
    expect(canonicalJson({ b: 1, a: [2, { d: 1, c: undefined }] })).toBe('{"a":[2,{"d":1}],"b":1}');
    let h = 0x811c9dc5;
    for (const ch of canonicalJson({ z: 'x', a: 1 })) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193); }
    expect(hashState({ a: 1, z: 'x' })).toBe(h >>> 0);
    expect(hashState({ a: 1, b: 2 })).toBe(hashState({ b: 2, a: 1 }));
  });

  it('serialize/deserialize round trip, tamper warns but loads', () => {
    const s = makeState();
    const file = serialize(s, 1000, 'hello');
    expect(file.meta).toMatchObject({ version: SAVE_VERSION, savedAt: 1000, playTicks: 0, title: 'hello' });
    const ok = deserialize(stringifySave(file));
    expect(ok.hashOk).toBe(true);
    const bad = JSON.parse(stringifySave(file));
    bad.state.resources.wood += 1;
    const r = deserialize(bad);
    expect(r.hashOk).toBe(false);
    expect(r.state.resources.wood).toBe(s.resources.wood + 1);
  });

  it('refuses newer versions and malformed files', () => {
    expect(() => migrateState({}, SAVE_VERSION + 1)).toThrow(SaveError);
    expect(() => deserialize('not json')).toThrow(SaveError);
    expect(() => deserialize({ meta: {}, state: {} })).toThrow(SaveError);
  });

  it('migrates a synthetic v0 save (template for future migrations)', () => {
    const s = makeState();
    const old = JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
    // what a v0 file looked like: later-added fields are absent
    for (const k of ['buffs', 'reports', 'log', 'chronicle', 'flags']) delete old[k];
    delete (old['stats'] as Record<string, unknown>)['bossesKilled'];
    delete (old['city'] as Record<string, unknown>)['market'];
    old['version'] = 0;
    const file = { meta: { version: 0, savedAt: 1, playTicks: 0, hash: hashState(old), title: 'old' }, state: old };
    const r = deserialize(JSON.stringify(file));
    expect(r.hashOk).toBe(true);
    expect(r.meta.version).toBe(SAVE_VERSION);
    expect(r.state.version).toBe(SAVE_VERSION);
    expect(r.state.buffs).toEqual([]);
    expect(r.state.reports).toEqual([]);
    expect(r.state.flags).toEqual({ won: false, sandbox: false, safeMode: false });
    expect(r.state.stats.bossesKilled).toBe(0);
    expect(r.state.city.market).toEqual({});
    expect(r.state.seed).toBe(s.seed);
    advance(r.state); // the migrated state is playable
    expect(r.state.tick).toBe(1);
    expect(() => migrateState({}, -1)).toThrow(SaveError); // no migration below v0
  });

  it('loads the committed v1 fixture and migrates it to the current version', () => {
    const raw = readFileSync(new URL('./fixtures/save_v1.json', import.meta.url), 'utf8');
    const r = deserialize(raw);
    expect(r.hashOk).toBe(true);
    expect(r.meta.version).toBe(SAVE_VERSION);
    expect(r.state.version).toBe(SAVE_VERSION);
    expect(r.state.seed).toBe(99);
  });
});
