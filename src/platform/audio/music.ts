// Music: a generative whimsical folk-polka per season. Phrases come from the pure generator in ./phrases;
// this player schedules them ahead on the AudioContext clock (a 200 ms timer looks 0.8 s ahead), a handful of voices at a time.
import { DEFS, MOODS, makePhrase, restAfter, type Lead, type Mood, type Phrase, type PhraseEvent } from './phrases';
import { MARIMBA, MUSICBOX, XYLO, chirp, clonk, cluck, jit, kazoo, peep, pluck, semi, strike, tuba, type Ctx } from './synth';

export { MOODS, type Mood };

export class MusicPlayer {
  private mood: Mood | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private bus: GainNode | null = null;
  private phrase: Phrase | null = null;
  private phraseNo = 0;
  private cursor = 0;         // step within the current phrase (may exceed phrase.steps while resting)
  private restSteps = 0;
  private nextTime = 0;       // audio time of the next step's grid position
  private baseSeed = 1;
  constructor(private ctx: Ctx, private dest: AudioNode) {}

  setMood(m: Mood | null): void {
    if (m === this.mood) return;
    this.mood = m;
    this.stop();
    if (!m) return;
    this.bus = this.ctx.createGain();
    this.bus.gain.setValueAtTime(0.0001, this.ctx.currentTime);
    this.bus.gain.linearRampToValueAtTime(1, this.ctx.currentTime + 2);
    this.bus.connect(this.dest);
    this.nextTime = this.ctx.currentTime + 0.25;
    this.baseSeed = Math.floor(Math.random() * 1e6); // varies per session; each phrase is still a pure function of (mood, seed)
    this.phraseNo = 0;
    this.newPhrase();
    this.schedule();
  }
  getMood(): Mood | null { return this.mood; }

  stop(): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (this.bus) {
      const b = this.bus, t = this.ctx.currentTime;
      b.gain.cancelScheduledValues(t); b.gain.setValueAtTime(b.gain.value, t); b.gain.linearRampToValueAtTime(0.0001, t + 1);
      setTimeout(() => b.disconnect(), 1200);
      this.bus = null;
    }
  }

  private newPhrase(): void {
    if (!this.mood) return;
    const seed = this.baseSeed + this.phraseNo++;
    this.phrase = makePhrase(this.mood, seed);
    this.restSteps = restAfter(this.mood, seed);
    this.cursor = 0;
  }

  private schedule = (): void => {
    if (!this.mood || !this.bus || !this.phrase) return;
    const d = DEFS[this.mood], eighth = 30 / d.bpm;
    while (this.nextTime < this.ctx.currentTime + 0.8) {
      const step = this.cursor;
      const when = this.nextTime + (step % 2 === 1 ? d.swing * eighth : 0) + (Math.random() - 0.5) * 0.006; // swing + human timing
      if (step < this.phrase.steps) for (const e of this.phrase.events) if (e.step === step) this.play(e, when, eighth, d.root, this.phrase.lead);
      this.nextTime += eighth;
      this.cursor++;
      if (this.cursor >= this.phrase.steps + this.restSteps) this.newPhrase();
    }
    this.timer = setTimeout(this.schedule, 200);
  };

  private play(e: PhraseEvent, t: number, eighth: number, root: number, lead: Lead): void {
    const bus = this.bus;
    if (!bus) return;
    const vary = 0.9 + Math.random() * 0.2;
    switch (e.kind) {
      case 'bass': tuba(this.ctx, bus, t, semi(root / 2, e.semi + 12), eighth * 3.2, 0.5 * vary); break;
      case 'chord': for (const s of e.semis) pluck(this.ctx, bus, t, semi(root, s) * jit(6), eighth * 1.6, 0.13 * vary); break;
      case 'wood': clonk(this.ctx, bus, t, 1100, 0.07); break;
      case 'bird': {
        const x = this.ctx;
        if (e.what === 'chirp') { chirp(x, bus, t, 2600 * e.pitch, 0.09); chirp(x, bus, t + 0.1, 3000 * e.pitch, 0.07); }
        else if (e.what === 'peep') peep(x, bus, t, 0.08);
        else { cluck(x, bus, t, 0.09, e.pitch); cluck(x, bus, t + 0.12, 0.07, e.pitch * 0.95); }
        break;
      }
      case 'mel': {
        const f = semi(root, e.semi) * jit(5), len = Math.max(1, e.len) * eighth, g = 0.42 * e.vel * vary;
        if (lead === 'marimba') strike(this.ctx, bus, t, f, len * 1.8, g * 0.7, MARIMBA);
        else if (lead === 'xylo') strike(this.ctx, bus, t, f * 2, len * 1.4, g * 0.55, XYLO);
        else if (lead === 'musicbox') strike(this.ctx, bus, t, f * 2, len * 2.6, g * 0.5, MUSICBOX);
        else if (lead === 'kazoo') kazoo(this.ctx, bus, t, f, len * 0.9, g * 0.28);
        else pluck(this.ctx, bus, t, f, len * 1.7, g * 0.55);
        break;
      }
    }
  }
}
