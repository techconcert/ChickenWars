// SFX recipes: cartoony, organic, whimsical. Built from the toolkit in ./synth (glides, plucks, bells, chicken voices).
// Every recipe schedules nodes at `t` into `out`; each play gets a little random pitch/timing variation.
import {
  BELL, MARIMBA, XYLO, MUSICBOX, type Ctx, type Partials,
  boing, bloop, burst, bwak, chirp, clonk, cluck, crow, eggCrack, eggPop, jit, kazoo, peep, pick, rand, sadSlide, semi,
  sparkle, strike, thunk, tone,
} from './synth';

export type SfxId =
  | 'click' | 'build_start' | 'build_done' | 'upgrade_done' | 'train_done' | 'march_start' | 'march_return'
  | 'battle_start' | 'hit' | 'hero_skill' | 'battle_win' | 'battle_loss' | 'warning' | 'raid' | 'levelup'
  | 'loot' | 'coin' | 'quest' | 'error' | 'season' | 'win';

type Recipe = (ctx: Ctx, out: AudioNode, t: number) => void;

const C5 = 523.25;
/** Major-pentatonic arpeggio on a struck instrument; `lift` is a semitone shift of the whole figure. */
function arp(ctx: Ctx, out: AudioNode, t: number, steps: number[], o: { root?: number; step?: number; dur?: number; gain?: number; inst?: Partials } = {}): void {
  const root = (o.root ?? C5) * jit(30);
  const step = o.step ?? 0.09;
  steps.forEach((s, i) => strike(ctx, out, t + i * step * rand(0.94, 1.06), semi(root, s), (o.dur ?? 0.5), (o.gain ?? 0.22) * (1 + i * 0.04), o.inst ?? MARIMBA));
}

const RAW: Record<SfxId, Recipe> = {
  // Tiny wooden "tok" or bubble "pop", picked at random so rapid clicking never sounds the same twice.
  click: (c, o, t) => {
    if (Math.random() < 0.5) clonk(c, o, t, 1000, 0.16);
    else bloop(c, o, t, 560, Math.random() < 0.5, 0.14);
  },
  // Soft wobbly "uh-oh": a gentle falling slide, never harsh.
  error: (c, o, t) => {
    const f = 300 * jit(40);
    tone(c, o, t, { f, path: [[0.5, 0.88], [1, 0.8]], dur: 0.26, gain: 0.12, type: 'triangle', attack: 0.015, lp: 900, vib: [9, 40] });
    tone(c, o, t + 0.12, { f: f * 0.8, path: [[1, 0.7]], dur: 0.3, gain: 0.1, type: 'triangle', attack: 0.015, lp: 700, vib: [9, 40] });
  },
  // Hammering: two wood clonks and a thunk, with a cheeky sawing scrape.
  build_start: (c, o, t) => {
    clonk(c, o, t, 700, 0.3); thunk(c, o, t + 0.01, 150, 0.22);
    clonk(c, o, t + 0.14 * rand(0.9, 1.1), 860, 0.26);
    burst(c, o, t + 0.28, { dur: 0.14, type: 'bandpass', f: 2500, f2: 1500, q: 2, gain: 0.05, attack: 0.03 });
  },
  build_done: (c, o, t) => { arp(c, o, t, [0, 4, 7, 12], { step: 0.085 }); sparkle(c, o, t + 0.35, 3, 0.06); peep(c, o, t + 0.42, 0.08); },
  upgrade_done: (c, o, t) => { bloop(c, o, t, 420, true, 0.18); arp(c, o, t + 0.08, [0, 4, 7, 12, 16], { root: 587.33, inst: XYLO, step: 0.075, dur: 0.45 }); },
  // Chicks hatch and a kazoo plays a "da-da-daa".
  train_done: (c, o, t) => {
    peep(c, o, t, 0.1); peep(c, o, t + 0.09, 0.09);
    const r = 330 * jit(20);
    kazoo(c, o, t + 0.2, r, 0.14, 0.1); kazoo(c, o, t + 0.36, r * 1.26, 0.14, 0.1); kazoo(c, o, t + 0.52, r * 1.5, 0.3, 0.11);
  },
  // Pebbles and golden eggs: pop and sparkle.
  loot: (c, o, t) => { eggPop(c, o, t, 0.18); strike(c, o, t + 0.07, semi(1318.5, pick([0, 2, 4])), 0.35, 0.14, BELL); strike(c, o, t + 0.15, 1760 * jit(20), 0.4, 0.12, BELL); sparkle(c, o, t + 0.2, 2, 0.05); },
  // "ba-bloop": cheerful egg coin.
  coin: (c, o, t) => { bloop(c, o, t, 700, true, 0.17); strike(c, o, t + 0.07, pick([1568, 1760, 2093]) * jit(15), 0.3, 0.13, BELL); },
  // Parade of wood blocks and a jaunty kazoo.
  march_start: (c, o, t) => {
    clonk(c, o, t, 600, 0.22); clonk(c, o, t + 0.15, 780, 0.2); clonk(c, o, t + 0.3, 600, 0.22);
    const r = 262 * jit(20);
    kazoo(c, o, t + 0.12, r, 0.16, 0.09); kazoo(c, o, t + 0.34, r * 1.5, 0.35, 0.1);
  },
  march_return: (c, o, t) => {
    const r = 392 * jit(20);
    kazoo(c, o, t, r, 0.16, 0.09); kazoo(c, o, t + 0.18, r * 0.75, 0.3, 0.09);
    clonk(c, o, t + 0.1, 700, 0.16); clonk(c, o, t + 0.28, 560, 0.16); cluck(c, o, t + 0.5, 0.1);
  },
  // Four wooden knocks and a bwak, instead of war drums.
  battle_start: (c, o, t) => {
    for (let i = 0; i < 4; i++) { clonk(c, o, t + i * 0.15, i === 3 ? 520 : 680 + (i % 2) * 90, 0.28); thunk(c, o, t + i * 0.15, 130, 0.14); }
    bwak(c, o, t + 0.62, 0.12, 0.9);
  },
  // Bonk: a thunk, a rubbery boing and a puff of feathers.
  hit: (c, o, t) => {
    thunk(c, o, t, 190, 0.34); boing(c, o, t + 0.01, 340, 0.2, 0.1);
    burst(c, o, t, { dur: 0.1, type: 'bandpass', f: 1800, f2: 600, q: 1, gain: 0.1 });
  },
  hero_skill: (c, o, t) => {
    burst(c, o, t, { dur: 0.4, type: 'bandpass', f: 400, f2: 3500, q: 3, gain: 0.14, attack: 0.18 });
    boing(c, o, t, 220, 0.3, 0.12); arp(c, o, t + 0.22, [0, 7, 12, 19], { root: 880, inst: BELL, step: 0.06, gain: 0.13 });
  },
  battle_win: (c, o, t) => { crow(c, o, t, 0.15, 3); arp(c, o, t + 0.1, [0, 4, 7, 12], { root: 392, step: 0.11, dur: 0.55 }); clonk(c, o, t, 700, 0.2); },
  // Gentle trombone slide and a sleepy cluck.
  battle_loss: (c, o, t) => { sadSlide(c, o, t, 300, 0.1); cluck(c, o, t + 1.2, 0.09, 0.8); },
  warning: (c, o, t) => { cluck(c, o, t, 0.15); cluck(c, o, t + 0.11, 0.13, 0.92); tone(c, o, t + 0.25, { f: 400 * jit(30), path: [[1, 0.8]], dur: 0.2, gain: 0.08, type: 'triangle', lp: 900 }); },
  // Cluckly alarm: three flustered "bwak-bwak!" with woodblock tick, rising in panic but soft.
  raid: (c, o, t) => {
    for (let i = 0; i < 3; i++) {
      const b = t + i * 0.55, p = 1 + i * 0.08;
      bwak(c, o, b, 0.14, p); cluck(c, o, b + 0.26, 0.11, p * 1.1); cluck(c, o, b + 0.36, 0.1, p * 1.15); clonk(c, o, b, 520, 0.1);
    }
  },
  // A tiny crow fragment plus a bell run.
  levelup: (c, o, t) => { crow(c, o, t, 0.13, 3, 1.1); arp(c, o, t + 0.1, [0, 4, 7, 12, 16], { root: 659.25, inst: XYLO, step: 0.07, dur: 0.5 }); sparkle(c, o, t + 0.45, 3, 0.05); },
  quest: (c, o, t) => { arp(c, o, t, [0, 4, 7], { root: 659.25, step: 0.11, dur: 0.6 }); strike(c, o, t + 0.4, 1318.5 * jit(15), 0.9, 0.14, MUSICBOX); peep(c, o, t + 0.5, 0.07); },
  // Seasons turn: soft music-box chords on a breeze with a couple of birds.
  season: (c, o, t) => {
    arp(c, o, t, [0, 4, 7, 11], { root: 440, inst: MUSICBOX, step: 0.2, dur: 1.2, gain: 0.12 });
    burst(c, o, t, { dur: 1.3, type: 'bandpass', f: 500, f2: 1600, q: 1, gain: 0.035, attack: 0.5 });
    chirp(c, o, t + 0.5, 2800, 0.06); chirp(c, o, t + 0.62, 3200, 0.05); chirp(c, o, t + 1.1, 2500, 0.05);
  },
  // Full cock-a-doodle-doo, a fanfare of marimba and bells, and two happy clucks.
  win: (c, o, t) => {
    crow(c, o, t, 0.17, 4);
    arp(c, o, t + 0.5, [0, 4, 7, 12, 7, 12, 16], { root: 523.25, step: 0.13, dur: 0.9, gain: 0.22 });
    sparkle(c, o, t + 1.1, 5, 0.06); cluck(c, o, t + 1.45, 0.1); cluck(c, o, t + 1.55, 0.1, 1.1);
    eggCrack(c, o, t + 0.45, 0.06);
  },
};

/** Per-sound loudness trim, measured by offline rendering so quiet UI sounds and big fanfares sit at comparable levels. */
const TRIM: Partial<Record<SfxId, number>> = { click: 2.2, hit: 2.4, error: 1.7, warning: 1.7, train_done: 2.4, coin: 1.5, march_return: 1.4, battle_loss: 1.6, loot: 1.3, raid: 1.4, win: 0.85 };

export const RECIPES = Object.fromEntries((Object.keys(RAW) as SfxId[]).map((id) => [id, ((c, o, t) => {
  const trim = TRIM[id];
  if (trim === undefined) { RAW[id](c, o, t); return; }
  const g = c.createGain();
  g.gain.value = trim; g.connect(o);
  RAW[id](c, g, t);
}) as Recipe])) as Record<SfxId, Recipe>;

/** Minimum gap (seconds) before the same sound can retrigger. */
export const THROTTLE: Partial<Record<SfxId, number>> = { click: 0.04, hit: 0.07, coin: 0.08, loot: 0.15, error: 0.25, warning: 0.4, raid: 1.5 };
export const DEFAULT_THROTTLE = 0.12;
