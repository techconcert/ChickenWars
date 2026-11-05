import { describe, expect, it } from 'vitest';
import { deserialize, serialize, stringifySave } from '@sim/save/serialize';
import { hashState } from '@sim/save/hash';
import { makeState } from '../helpers/makeState';
import { fuzzScript, runScript } from '../helpers/script';

const TICKS = 20000;

describe('determinism', () => {
  const script = fuzzScript(1337, TICKS);

  it('two runs from the same seed and command log produce the same hash', () => {
    const a = runScript(makeState({ seed: 1337 }), script, TICKS, 2000);
    const b = runScript(makeState({ seed: 1337 }), script, TICKS, 2000);
    expect(a.hash).toBe(b.hash);
    expect(a.checkpoints).toEqual(b.checkpoints);
    expect(a.events.length).toBe(b.events.length);
    expect(script.length).toBeGreaterThan(100);
  });

  it('a different seed diverges', () => {
    const a = runScript(makeState({ seed: 1337 }), [], 100);
    const b = runScript(makeState({ seed: 1338 }), [], 100);
    expect(a.hash).not.toBe(b.hash);
  });

  it('save -> load -> continue equals an uninterrupted run', () => {
    const whole = runScript(makeState({ seed: 1337 }), script, TICKS);
    const s = makeState({ seed: 1337 });
    runScript(s, script, TICKS / 2);
    const json = stringifySave(serialize(s, 123456, 'test'));
    const loaded = deserialize(json);
    expect(loaded.hashOk).toBe(true);
    expect(hashState(loaded.state)).toBe(hashState(s));
    const rest = runScript(loaded.state, script, TICKS / 2);
    expect(rest.hash).toBe(whole.hash);
  });

  it('state is JSON-safe (round trip is lossless)', () => {
    const s = makeState();
    runScript(s, script, 3000);
    expect(hashState(JSON.parse(JSON.stringify(s)))).toBe(hashState(s));
  });
});
