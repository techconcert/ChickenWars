import { describe, expect, it } from 'vitest';
import { compareKeys, sortedKeys } from '@sim/util';
import { BUILDING_LIST, effectsAt } from '@sim/data/registry';

const reference = (rec: Record<string, unknown>): string[] => Object.keys(rec).sort(compareKeys);

describe('sortedKeys fast paths (docs/12-performance-review.md)', () => {
  it('matches a plain sort while keys are added, removed and re-added', () => {
    const rec: Record<string, number> = {};
    const ids = ['b', '10', 'a', '2', 'node_7', '007', 'node_10', '1', 'Z', '99999999999999999999'];
    for (const id of ids) {
      rec[id] = 1;
      expect(sortedKeys(rec)).toEqual(reference(rec));
      expect(sortedKeys(rec)).toEqual(reference(rec)); // cached path
    }
    delete rec['a'];
    expect(sortedKeys(rec)).toEqual(reference(rec));
    rec['a'] = 2; // same key set as before the delete, different insertion order
    expect(sortedKeys(rec)).toEqual(reference(rec));
  });

  it('returns a fresh array each call (callers may mutate it)', () => {
    const rec = { b: 1, a: 1, c: 1 };
    const first = sortedKeys(rec);
    first.reverse();
    expect(sortedKeys(rec)).toEqual(['a', 'b', 'c']);
  });
});

describe('effectsAt cache', () => {
  it('returns the same frozen list as a fresh resolution', () => {
    for (const b of BUILDING_LIST) {
      for (const lvl of [0, 1, 3, 25]) {
        for (const e of b.effects) {
          const a = effectsAt(b.id, e.kind, lvl);
          if (lvl < 1) { expect(a).toEqual([]); continue; }
          expect(effectsAt(b.id, e.kind, lvl)).toBe(a);
          expect(Object.isFrozen(a)).toBe(true);
          expect(a.length).toBe(b.effects.filter((x) => x.kind === e.kind).length);
        }
      }
    }
  });
});
