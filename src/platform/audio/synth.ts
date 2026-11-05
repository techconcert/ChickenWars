// Small WebAudio synthesis toolkit: glides, plucks, additive bells, woody thunks, chicken voices.
// Everything schedules short-lived nodes at time `t` into `out`; nothing here keeps state except one shared noise buffer.
// `Math.random` is used on purpose for per-play variation (platform code, never the sim).
export type Ctx = BaseAudioContext;

export const rand = (a: number, b: number): number => a + Math.random() * (b - a);
/** Random frequency multiplier within +/- `cents`. */
export const jit = (cents = 25): number => 2 ** (rand(-cents, cents) / 1200);
export const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)] as T;
/** MIDI-less helper: semitone offset above a root frequency. */
export const semi = (root: number, n: number): number => root * 2 ** (n / 12);

const noiseBufs = new WeakMap<BaseAudioContext, AudioBuffer>();
/** One second of fixed-seed white noise per context, reused by every burst. */
export function noise(ctx: Ctx): AudioBuffer {
  let b = noiseBufs.get(ctx);
  if (b) return b;
  b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = b.getChannelData(0);
  let s = 0x9e3779b9;
  for (let i = 0; i < d.length; i++) { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; d[i] = ((s >>> 0) / 4294967296) * 2 - 1; }
  noiseBufs.set(ctx, b);
  return b;
}

const FLOOR = 0.0001;
function env(g: AudioParam, t: number, peak: number, attack: number, dur: number): void {
  const a = Math.min(attack, dur * 0.5);
  g.setValueAtTime(FLOOR, t);
  g.linearRampToValueAtTime(Math.max(peak, FLOOR * 2), t + a);
  g.exponentialRampToValueAtTime(FLOOR, t + dur);
}

export interface ToneOpts {
  f: number;
  /** Pitch path: [fraction of duration, frequency multiplier] pairs, exponentially interpolated. */
  path?: ReadonlyArray<readonly [number, number]>;
  dur: number;
  type?: OscillatorType;
  gain?: number;
  attack?: number;
  /** Static lowpass cutoff, or a sweep [start, end]. */
  lp?: number | readonly [number, number];
  /** Vibrato [rate Hz, depth cents]. */
  vib?: readonly [number, number];
}

/** Oscillator with envelope, pitch path, optional lowpass sweep and vibrato. */
export function tone(ctx: Ctx, out: AudioNode, t: number, o: ToneOpts): void {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.f, t);
  for (const [fr, m] of o.path ?? []) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f * m), t + o.dur * fr);
  env(g.gain, t, o.gain ?? 0.3, o.attack ?? 0.006, o.dur);
  let last: AudioNode = osc;
  if (o.lp !== undefined) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    const [a, b] = typeof o.lp === 'number' ? [o.lp, o.lp] : o.lp;
    f.frequency.setValueAtTime(a, t);
    if (b !== a) f.frequency.exponentialRampToValueAtTime(b, t + o.dur);
    osc.connect(f); last = f;
  }
  last.connect(g); g.connect(out);
  let lfo: OscillatorNode | null = null;
  if (o.vib) {
    lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.frequency.value = o.vib[0]; depth.gain.value = o.vib[1];
    lfo.connect(depth); depth.connect(osc.detune);
    lfo.start(t); lfo.stop(t + o.dur + 0.05);
  }
  osc.start(t); osc.stop(t + o.dur + 0.05);
}

export interface BurstOpts { dur: number; type?: BiquadFilterType; f: number; f2?: number; q?: number; gain?: number; attack?: number }
/** Filtered noise burst with an optional cutoff sweep. */
export function burst(ctx: Ctx, out: AudioNode, t: number, o: BurstOpts): void {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = o.type ?? 'bandpass';
  f.frequency.setValueAtTime(o.f, t);
  if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + o.dur);
  f.Q.value = o.q ?? 1;
  const g = ctx.createGain();
  env(g.gain, t, o.gain ?? 0.3, o.attack ?? 0.004, o.dur);
  src.connect(f); f.connect(g); g.connect(out);
  src.start(t, Math.random() * 0.8); src.stop(t + o.dur + 0.05);
}

/** Additive partial recipe: ratio to the fundamental, level, decay length relative to the note length. */
export type Partials = ReadonlyArray<{ r: number; g: number; d: number }>;
export const MARIMBA: Partials = [{ r: 1, g: 1, d: 1 }, { r: 4, g: 0.32, d: 0.22 }, { r: 9.9, g: 0.1, d: 0.08 }];
export const XYLO: Partials = [{ r: 1, g: 1, d: 0.7 }, { r: 3, g: 0.5, d: 0.35 }, { r: 6, g: 0.22, d: 0.18 }];
export const BELL: Partials = [{ r: 1, g: 1, d: 1 }, { r: 2.76, g: 0.4, d: 0.7 }, { r: 5.4, g: 0.2, d: 0.45 }, { r: 8.9, g: 0.1, d: 0.25 }];
export const MUSICBOX: Partials = [{ r: 1, g: 1, d: 1 }, { r: 3, g: 0.25, d: 0.45 }, { r: 5, g: 0.08, d: 0.3 }];

/** Struck bar / bell by additive synthesis. */
export function strike(ctx: Ctx, out: AudioNode, t: number, f: number, dur: number, gain: number, spec: Partials = MARIMBA): void {
  for (const p of spec) {
    const pf = f * p.r;
    if (pf > 9000) continue;
    tone(ctx, out, t, { f: pf, dur: Math.max(0.04, dur * p.d), gain: gain * p.g, attack: 0.002 });
  }
}

/** Plucked string (pizzicato / ukulele): soft triangle with a closing lowpass and a short octave. */
export function pluck(ctx: Ctx, out: AudioNode, t: number, f: number, dur: number, gain: number): void {
  tone(ctx, out, t, { f, dur, gain, type: 'triangle', attack: 0.002, lp: [Math.min(f * 7, 6000), Math.max(f * 1.4, 300)] });
  tone(ctx, out, t, { f: f * 2, dur: dur * 0.35, gain: gain * 0.25, attack: 0.002 });
}

/** Tuba / bass-pluck "oom": round sine+triangle with a little pitch drop. */
export function tuba(ctx: Ctx, out: AudioNode, t: number, f: number, dur: number, gain: number): void {
  tone(ctx, out, t, { f, path: [[0.12, 0.96]], dur, gain, type: 'triangle', attack: 0.01, lp: 520 });
  tone(ctx, out, t, { f: f * 0.5, dur: dur * 0.8, gain: gain * 0.6, attack: 0.012 });
}

/** Kazoo-ish buzzy reed: sawtooth through a bandpass with fast vibrato. */
export function kazoo(ctx: Ctx, out: AudioNode, t: number, f: number, dur: number, gain: number): void {
  const osc = ctx.createOscillator(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(f * 0.97, t);
  osc.frequency.exponentialRampToValueAtTime(f, t + 0.04);
  bp.type = 'bandpass'; bp.frequency.value = Math.max(900, f * 2.2); bp.Q.value = 2.2;
  env(g.gain, t, gain * 1.6, 0.025, dur);
  const lfo = ctx.createOscillator(), depth = ctx.createGain();
  lfo.frequency.value = 6 + Math.random(); depth.gain.value = 14;
  lfo.connect(depth); depth.connect(osc.detune);
  osc.connect(bp); bp.connect(g); g.connect(out);
  osc.start(t); osc.stop(t + dur + 0.05); lfo.start(t); lfo.stop(t + dur + 0.05);
}

/** Wooden thunk: low sine drop plus a dull noise puff. */
export function thunk(ctx: Ctx, out: AudioNode, t: number, f = 170, gain = 0.4): void {
  const p = jit(60);
  tone(ctx, out, t, { f: f * p, path: [[1, 0.45]], dur: 0.14, gain, attack: 0.002 });
  burst(ctx, out, t, { dur: 0.05, type: 'lowpass', f: 900, gain: gain * 0.5, attack: 0.001 });
}

/** Woodblock / clonk: two inharmonic sines and a tick of noise. */
export function clonk(ctx: Ctx, out: AudioNode, t: number, f = 800, gain = 0.3): void {
  const p = jit(40);
  tone(ctx, out, t, { f: f * p, path: [[1, 0.85]], dur: 0.07, gain, attack: 0.001 });
  tone(ctx, out, t, { f: f * p * 1.58, dur: 0.04, gain: gain * 0.45, attack: 0.001 });
  burst(ctx, out, t, { dur: 0.02, type: 'bandpass', f: 2400, q: 1.2, gain: gain * 0.35, attack: 0.001 });
}

/** Cartoon boing: pitch bounces up then settles, with a springy vibrato. */
export function boing(ctx: Ctx, out: AudioNode, t: number, f = 260, dur = 0.32, gain = 0.25): void {
  tone(ctx, out, t, { f: f * jit(40), path: [[0.15, 2.1], [0.4, 0.8], [0.7, 1.3], [1, 0.95]], dur, gain, type: 'triangle', attack: 0.004, lp: 2400, vib: [18, 35] });
}

/** Rising or falling bubble "bloop". */
export function bloop(ctx: Ctx, out: AudioNode, t: number, f = 520, up = true, gain = 0.25): void {
  const p = jit(50);
  tone(ctx, out, t, { f: f * p, path: [[1, up ? 2.1 : 0.5]], dur: 0.11, gain, attack: 0.004 });
  tone(ctx, out, t, { f: f * p * 2, path: [[1, up ? 2.1 : 0.5]], dur: 0.06, gain: gain * 0.25, attack: 0.004 });
}

/** Squeaky toy: fast wobbling glide up. */
export function squeak(ctx: Ctx, out: AudioNode, t: number, f = 900, gain = 0.15): void {
  tone(ctx, out, t, { f: f * jit(60), path: [[0.5, 1.5], [1, 1.25]], dur: 0.12, gain, type: 'triangle', attack: 0.004, lp: 3500, vib: [30, 60] });
}

/** Bird chirp: a quick sine sweep up and back. */
export function chirp(ctx: Ctx, out: AudioNode, t: number, f = 2600, gain = 0.1): void {
  const p = jit(120);
  tone(ctx, out, t, { f: f * p, path: [[0.4, 1.35], [1, 0.95]], dur: 0.09, gain, attack: 0.008, vib: [40, 80] });
}

export interface VoiceOpts { f0: number; f1?: number; dur: number; gain?: number; formant: readonly [number, number]; q?: number; attack?: number; type?: OscillatorType }
/** Throaty chicken-ish voice: buzzy source through a gliding formant bandpass. */
export function voice(ctx: Ctx, out: AudioNode, t: number, o: VoiceOpts): void {
  const osc = ctx.createOscillator(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
  osc.type = o.type ?? 'sawtooth';
  osc.frequency.setValueAtTime(o.f0, t);
  if (o.f1) osc.frequency.exponentialRampToValueAtTime(o.f1, t + o.dur);
  bp.type = 'bandpass'; bp.Q.value = o.q ?? 4;
  bp.frequency.setValueAtTime(o.formant[0], t);
  bp.frequency.exponentialRampToValueAtTime(o.formant[1], t + o.dur);
  env(g.gain, t, (o.gain ?? 0.2) * 2.2, o.attack ?? 0.01, o.dur);
  osc.connect(bp); bp.connect(g); g.connect(out);
  osc.start(t); osc.stop(t + o.dur + 0.05);
}

/** Short "buk" cluck. */
export function cluck(ctx: Ctx, out: AudioNode, t: number, gain = 0.2, pitch = 1): void {
  const p = jit(80) * pitch;
  voice(ctx, out, t, { f0: 420 * p, f1: 230 * p, dur: 0.07, gain, formant: [1300, 700], q: 5 });
}
/** Drawn-out "bwaaak". */
export function bwak(ctx: Ctx, out: AudioNode, t: number, gain = 0.2, pitch = 1): void {
  const p = jit(80) * pitch;
  voice(ctx, out, t, { f0: 360 * p, f1: 520 * p, dur: 0.05, gain, formant: [900, 1500], q: 4 });
  voice(ctx, out, t + 0.05, { f0: 520 * p, f1: 210 * p, dur: 0.2, gain, formant: [1500, 650], q: 4 });
}
/** Chick peep. */
export function peep(ctx: Ctx, out: AudioNode, t: number, gain = 0.12): void {
  const p = jit(150);
  tone(ctx, out, t, { f: 2300 * p, path: [[0.3, 1.4], [1, 1.1]], dur: 0.09, gain, attack: 0.006, vib: [26, 50] });
}
/** Rooster "cock-a-doodle-doo" fragment; `parts` 1..4 trims it for short fanfares. */
export function crow(ctx: Ctx, out: AudioNode, t: number, gain = 0.18, parts = 4, pitch = 1): void {
  const p = pitch * jit(40);
  const segs: VoiceOpts[] = [
    { f0: 520 * p, f1: 700 * p, dur: 0.11, gain, formant: [1100, 1500], q: 4 },
    { f0: 700 * p, f1: 640 * p, dur: 0.07, gain: gain * 0.8, formant: [1500, 1400], q: 4 },
    { f0: 880 * p, f1: 980 * p, dur: 0.16, gain, formant: [1700, 2000], q: 4 },
    { f0: 1000 * p, f1: 560 * p, dur: 0.5, gain, formant: [2000, 1000], q: 3.5 },
  ];
  const starts = [0, 0.13, 0.22, 0.4];
  for (let i = 0; i < Math.min(parts, 4); i++) voice(ctx, out, t + (starts[i] ?? 0), segs[i] as VoiceOpts);
}

/** Egg pop: quick rising blip plus a tick. */
export function eggPop(ctx: Ctx, out: AudioNode, t: number, gain = 0.25): void {
  tone(ctx, out, t, { f: 320 * jit(80), path: [[1, 2.8]], dur: 0.07, gain, attack: 0.002 });
  burst(ctx, out, t, { dur: 0.02, type: 'highpass', f: 3500, gain: gain * 0.3, attack: 0.001 });
}
/** Egg crack: two dry ticks and a wet little squelch. */
export function eggCrack(ctx: Ctx, out: AudioNode, t: number, gain = 0.2): void {
  burst(ctx, out, t, { dur: 0.025, type: 'bandpass', f: 3200 * jit(100), q: 2, gain, attack: 0.001 });
  burst(ctx, out, t + 0.04, { dur: 0.03, type: 'bandpass', f: 2200 * jit(100), q: 2, gain: gain * 0.8, attack: 0.001 });
  tone(ctx, out, t + 0.06, { f: 500, path: [[1, 0.55]], dur: 0.08, gain: gain * 0.5, attack: 0.004, lp: 1200 });
}

/** Gentle "sad trombone" slide: stepped downward bends with a wobbly last note. */
export function sadSlide(ctx: Ctx, out: AudioNode, t: number, f = 330, gain = 0.14): void {
  const p = jit(30);
  const steps: Array<[number, number, number]> = [[0, 1, 0.22], [0.24, 0.944, 0.22], [0.48, 0.891, 0.22]];
  for (const [dt, m, d] of steps) tone(ctx, out, t + dt, { f: f * p * m, dur: d, gain, type: 'sawtooth', attack: 0.03, lp: 800 });
  tone(ctx, out, t + 0.72, { f: f * p * 0.84, path: [[1, 0.7]], dur: 0.7, gain, type: 'sawtooth', attack: 0.04, lp: [900, 400], vib: [6, 40] });
}

/** Sparkle: a few random high bell blips on a pentatonic set. */
export function sparkle(ctx: Ctx, out: AudioNode, t: number, n = 4, gain = 0.07): void {
  const pent = [0, 2, 4, 7, 9];
  for (let i = 0; i < n; i++) strike(ctx, out, t + i * rand(0.04, 0.08), semi(1046.5, (pick(pent)) + 12 * (i % 2)), 0.3, gain, BELL);
}
