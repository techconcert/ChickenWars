// Pure, DOM-free phrase generator for the whimsical folk-polka music. Same seed + mood => same phrase.
// A phrase is 4 bars of 4/4 in eighth-note steps (32 steps): melody over an "oom-pah" bass and chord accompaniment.
export type Mood = 'spring' | 'summer' | 'autumn' | 'winter';
export const MOODS: readonly Mood[] = ['spring', 'summer', 'autumn', 'winter'];
export type Lead = 'marimba' | 'xylo' | 'pluck' | 'musicbox' | 'kazoo';

export interface MoodDef {
  root: number;            // tonic frequency (Hz), melody octave
  minor: boolean;
  bpm: number;
  swing: number;           // 0..0.33 delay of off-beat eighths as a fraction of an eighth
  density: number;         // 0..1 chance to keep a weak-beat melody note
  leads: Lead[];
  wood: number;            // chance of a woodblock tick on the pah beats
  birds: number;           // expected bird/chicken ambience events per phrase
  pause: number;           // chance a phrase is followed by a quiet bar or two
  seed: number;
}

export const DEFS: Record<Mood, MoodDef> = {
  spring: { root: 261.63, minor: false, bpm: 108, swing: 0.2, density: 0.85, leads: ['marimba', 'pluck'], wood: 0.3, birds: 0.9, pause: 0.15, seed: 11 },
  summer: { root: 293.66, minor: false, bpm: 124, swing: 0.28, density: 0.95, leads: ['xylo', 'kazoo', 'pluck'], wood: 0.75, birds: 0.4, pause: 0.05, seed: 23 },
  autumn: { root: 246.94, minor: true, bpm: 92, swing: 0.24, density: 0.7, leads: ['pluck', 'marimba'], wood: 0.2, birds: 0.5, pause: 0.25, seed: 37 },
  winter: { root: 349.23, minor: false, bpm: 78, swing: 0.15, density: 0.55, leads: ['musicbox', 'marimba'], wood: 0, birds: 0.15, pause: 0.35, seed: 53 },
};

export const MAJOR_PENT = [0, 2, 4, 7, 9] as const;
export const MINOR_PENT = [0, 3, 5, 7, 10] as const;

/** Seeded xorshift32 in [0,1). */
export function makeRng(seed: number): () => number {
  let s = (Math.imul(seed | 0, 2654435761) >>> 0) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

export type PhraseEvent =
  | { kind: 'mel'; step: number; semi: number; len: number; vel: number }
  | { kind: 'bass'; step: number; semi: number }
  | { kind: 'chord'; step: number; semis: number[] }
  | { kind: 'wood'; step: number }
  | { kind: 'bird'; step: number; what: 'chirp' | 'cluck' | 'peep'; pitch: number };

export interface Phrase { steps: number; lead: Lead; events: PhraseEvent[]; chords: number[] }

const STEPS_PER_BAR = 8;
const PROGS_MAJ = [[0, 5, 7, 0], [0, 7, 5, 0], [0, 9, 5, 0], [0, 5, 9, 0]];
const PROGS_MIN = [[0, 5, 10, 0], [0, 10, 5, 0], [0, 3, 10, 0], [0, 5, 3, 0]];
/** Melody rhythm templates: onset steps within a bar. */
const RHYTHMS = [[0, 1, 2, 3, 4, 6], [0, 2, 3, 4, 5, 6], [0, 3, 4, 6], [0, 1, 2, 4, 6], [0, 2, 4, 5, 6, 7], [0, 3, 4, 7], [0, 2, 4, 6], [0, 1, 3, 4, 6]];

/** Triad above a chord root, as semitone offsets from the tonic. */
export function chordTones(rootSemi: number, minorKey: boolean): number[] {
  const r = ((rootSemi % 12) + 12) % 12;
  const minorChord = minorKey ? r !== 10 && r !== 3 : r === 9;
  return [r, r + (minorChord ? 3 : 4), r + 7];
}

/** Scale ladder of semitone offsets over `octaves` octaves starting at the tonic. */
export function ladder(minorKey: boolean, octaves = 2): number[] {
  const sc = minorKey ? MINOR_PENT : MAJOR_PENT;
  const out: number[] = [];
  for (let o = 0; o < octaves; o++) for (const s of sc) out.push(o * 12 + s);
  out.push(octaves * 12);
  return out;
}

const mod12 = (n: number): number => ((n % 12) + 12) % 12;

export function makePhrase(mood: Mood, seed: number): Phrase {
  const d = DEFS[mood], rnd = makeRng(seed * 7919 + d.seed);
  const pickOf = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)] as T;
  const lad = ladder(d.minor);
  const chords = pickOf(d.minor ? PROGS_MIN : PROGS_MAJ);
  const events: PhraseEvent[] = [];

  // Accompaniment: oom (root, then fifth) on beats 1 and 3, pah (triad) on the off-beats.
  chords.forEach((cr, bar) => {
    const b0 = bar * STEPS_PER_BAR, tones = chordTones(cr, d.minor);
    events.push({ kind: 'bass', step: b0, semi: cr - 12 }, { kind: 'bass', step: b0 + 4, semi: (bar % 2 === 0 ? cr + 7 : cr) - 12 });
    events.push({ kind: 'chord', step: b0 + 2, semis: tones }, { kind: 'chord', step: b0 + 6, semis: tones });
    if (rnd() < d.wood) events.push({ kind: 'wood', step: b0 + 2 }, { kind: 'wood', step: b0 + 6 });
  });

  // Melody: one 2-bar motif (rhythm + contour), restated, varied, then a cadence on the tonic.
  const nearestTone = (idx: number, tones: number[]): number => {
    let best = idx, bd = 99;
    lad.forEach((s, i) => { if (tones.includes(mod12(s))) { const dist = Math.abs(i - idx); if (dist < bd) { bd = dist; best = i; } } });
    return best;
  };
  const rhythmA = pickOf(RHYTHMS), rhythmB = pickOf(RHYTHMS);
  const contour = (n: number): number[] => Array.from({ length: n }, () => pickOf([-2, -1, -1, 0, 1, 1, 2]));
  const motif = [rhythmA, rhythmB].map((r) => ({ r, c: contour(r.length) }));
  let idx = 3 + Math.floor(rnd() * 3);
  const noteAt = (bar: number, step: number, i: number, len: number, mutate: boolean): void => {
    const tones = chordTones(chords[bar] ?? 0, d.minor);
    const strong = step % 4 === 0;
    const delta = (motif[bar % 2]?.c[i] ?? 0) + (mutate && rnd() < 0.3 ? pickOf([-1, 1]) : 0);
    idx = Math.max(0, Math.min(lad.length - 1, idx + delta));
    if (strong) idx = nearestTone(idx, tones);
    if (!strong && rnd() > d.density) return;
    events.push({ kind: 'mel', step: bar * STEPS_PER_BAR + step, semi: lad[idx] ?? 0, len, vel: strong ? 1 : 0.8 });
  };
  for (let bar = 0; bar < 3; bar++) {
    const r = motif[bar % 2]?.r ?? RHYTHMS[0] as number[];
    r.forEach((st, i) => noteAt(bar, st, i, Math.min(3, (r[i + 1] ?? STEPS_PER_BAR) - st), bar === 2));
  }
  // Cadence bar: a short run-in then the tonic held.
  const cad = pickOf([[0, 4], [0, 2, 4], [0, 3, 4]]);
  cad.forEach((st, i) => {
    const last = i === cad.length - 1;
    if (last) idx = lad.findIndex((s) => s === 12);
    else idx = Math.max(0, Math.min(lad.length - 1, idx + pickOf([-1, 1])));
    events.push({ kind: 'mel', step: 3 * STEPS_PER_BAR + st, semi: lad[Math.max(0, idx)] ?? 12, len: last ? 4 : 2, vel: last ? 1 : 0.85 });
  });

  // Ambience: occasional distant birds and chicken chatter in the gaps.
  let birdBudget = d.birds;
  while (birdBudget > 0) {
    if (rnd() < Math.min(1, birdBudget)) {
      const what = pickOf(['chirp', 'chirp', 'peep', 'cluck'] as const);
      events.push({ kind: 'bird', step: Math.floor(rnd() * 31) + 1, what, pitch: 0.9 + rnd() * 0.4 });
    }
    birdBudget -= 1;
  }
  events.sort((a, b) => a.step - b.step);
  return { steps: 4 * STEPS_PER_BAR, lead: pickOf(d.leads), events, chords };
}

/** Number of quiet steps (0, one or two bars) to leave after a phrase. */
export function restAfter(mood: Mood, seed: number): number {
  const rnd = makeRng(seed * 104729 + 5), d = DEFS[mood];
  return rnd() < d.pause ? (rnd() < 0.5 ? STEPS_PER_BAR : 2 * STEPS_PER_BAR) : 0;
}
