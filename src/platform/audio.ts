// Procedural audio (WebAudio only, no files). Starts silent until a user gesture unlocks the AudioContext.
// Sim never calls this: events reach sounds only through the `eventSounds` table via `playForEvents`.
import type { GameEvent } from '@sim/events';
import { DEFAULT_THROTTLE, RECIPES, THROTTLE, type SfxId } from './audio/sfx';
import { MOODS, MusicPlayer, type Mood } from './audio/music';

export type { SfxId } from './audio/sfx';

/** GameEvent.t -> sfx id. Events not listed are silent. */
export const eventSounds: Partial<Record<GameEvent['t'], SfxId>> = {
  BuildingStarted: 'build_start', BuildingCompleted: 'build_done', BuildingUpgraded: 'upgrade_done',
  TroopsTrained: 'train_done', MarchStarted: 'march_start', MarchReturned: 'march_return',
  BuildingDamaged: 'hit',
  BattleResolved: 'battle_win', CampCleared: 'loot', BossDefeated: 'win', RaidWarning: 'raid',
  RaidResolved: 'warning', HeroLevelUp: 'levelup', ItemDropped: 'loot', Starvation: 'warning',
  ResourceOverflow: 'warning', CommandRejected: 'error', SeasonChanged: 'season', Won: 'win',
  QuestCompleted: 'quest', LordGift: 'coin', RequestFulfilled: 'coin', ResearchCompleted: 'upgrade_done',
};

let muted = true;
let musicId: string | null = null;
const volumes = { music: 0.5, sfx: 0.7 };
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfxBus: GainNode | null = null;
let musicBus: GainNode | null = null;
let player: MusicPlayer | null = null;
const lastPlayed = new Map<SfxId, number>();
const MUSIC_LEVEL = 0.22; // music sits well below effects

function applyLevels(): void {
  if (!ctx || !master || !sfxBus || !musicBus) return;
  const t = ctx.currentTime;
  master.gain.setTargetAtTime(muted ? 0 : 1, t, 0.03);
  sfxBus.gain.setTargetAtTime(volumes.sfx, t, 0.03);
  musicBus.gain.setTargetAtTime(volumes.music * MUSIC_LEVEL, t, 0.05);
}
function applyMusic(): void {
  if (!player) return;
  player.setMood(muted || !musicId || !MOODS.includes(musicId as Mood) ? null : (musicId as Mood));
}

export const audio = {
  /** Plays a one-shot effect. No-op while locked, muted or throttled. */
  play(id: SfxId): void {
    if (!ctx || !sfxBus || muted || volumes.sfx <= 0 || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    if (now - (lastPlayed.get(id) ?? -1) < (THROTTLE[id] ?? DEFAULT_THROTTLE)) return;
    lastPlayed.set(id, now);
    try { RECIPES[id](ctx, sfxBus, now + 0.005); } catch { /* audio must never break the game */ }
  },
  /** Season mood ('spring' | 'summer' | 'autumn' | 'winter') or null for silence. */
  setMusic(id: string | null): void { musicId = id; applyMusic(); },
  getMusic(): string | null { return musicId; },
  setMuted(m: boolean): void { muted = m; applyLevels(); applyMusic(); },
  isMuted(): boolean { return muted; },
  setVolumes(music: number, sfx: number): void { volumes.music = music; volumes.sfx = sfx; applyLevels(); },
  isUnlocked(): boolean { return ctx !== null && ctx.state === 'running'; },
  /** Call from a user gesture to create/resume the AudioContext (browsers block autoplay). */
  unlock(): void {
    try {
      if (!ctx) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        ctx = new Ctor();
        master = ctx.createGain(); sfxBus = ctx.createGain(); musicBus = ctx.createGain();
        const comp = ctx.createDynamicsCompressor();
        sfxBus.connect(master); musicBus.connect(master); master.connect(comp); comp.connect(ctx.destination);
        player = new MusicPlayer(ctx, musicBus);
        applyLevels(); applyMusic();
      }
      if (ctx.state === 'suspended') void ctx.resume().then(() => { applyLevels(); applyMusic(); }).catch(() => undefined);
    } catch { /* no WebAudio: stay silent */ }
  },
};

export function playForEvents(events: readonly GameEvent[]): void {
  for (const e of events) {
    const id = eventSounds[e.t];
    if (id) audio.play(id);
  }
}
