import { describe, expect, it } from 'vitest';
import { DEFS, MOODS, chordTones, ladder, makePhrase, makeRng, restAfter } from '../../src/platform/audio/phrases';

describe('music phrase generator', () => {
  it('is deterministic per mood and seed, and varies across seeds', () => {
    for (const m of MOODS) {
      expect(makePhrase(m, 5)).toEqual(makePhrase(m, 5));
      const sigs = new Set(Array.from({ length: 12 }, (_, s) => JSON.stringify(makePhrase(m, s).events)));
      expect(sigs.size).toBeGreaterThan(6);
    }
  });
  it('keeps notes in range, on the grid, ending on the tonic with an oom-pah accompaniment', () => {
    for (const m of MOODS) for (let seed = 0; seed < 40; seed++) {
      const p = makePhrase(m, seed), lad = ladder(DEFS[m].minor);
      expect(p.steps).toBe(32);
      for (const e of p.events) {
        expect(Number.isInteger(e.step) && e.step >= 0 && e.step < p.steps).toBe(true);
        if (e.kind === 'mel') { expect(lad).toContain(e.semi); expect(e.len).toBeGreaterThan(0); }
        if (e.kind === 'bird') expect(e.pitch).toBeGreaterThan(0.8);
      }
      const mel = p.events.filter((e) => e.kind === 'mel');
      expect(mel.length).toBeGreaterThan(5);
      const last = mel[mel.length - 1];
      expect(last && last.kind === 'mel' && last.semi).toBe(12);
      expect(p.events.filter((e) => e.kind === 'bass').length).toBe(8);
      expect(p.events.filter((e) => e.kind === 'chord').length).toBe(8);
    }
  });
  it('builds triads and rests sensibly', () => {
    expect(chordTones(0, false)).toEqual([0, 4, 7]);
    expect(chordTones(9, false)).toEqual([9, 12, 16]);
    expect(chordTones(0, true)).toEqual([0, 3, 7]);
    for (let s = 0; s < 50; s++) expect([0, 8, 16]).toContain(restAfter('winter', s));
    const r = makeRng(3);
    for (let i = 0; i < 100; i++) { const v = r(); expect(v >= 0 && v < 1).toBe(true); }
  });
});
