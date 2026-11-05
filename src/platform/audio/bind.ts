// Wires audio to the app: unlock on first gesture, settings, delegated UI click, game events, season music.
import type { ClientView } from '@app/clientView';
import { getSettings, subscribeSettings } from '../settings';
import { audio, playForEvents } from '../audio';
import type { Mood } from './music';

const SEASON_MOOD: Mood[] = ['spring', 'summer', 'autumn', 'winter'];
const CLICKABLE = 'button, .btn, [role="button"], .chip, .bcard';

export function bindAudio(client: ClientView): void {
  const sync = (): void => { const s = getSettings(); audio.setVolumes(s.musicVolume, s.sfxVolume); audio.setMuted(s.muted); };
  sync();
  subscribeSettings(sync);

  const unlock = (): void => { audio.unlock(); };
  for (const ev of ['pointerdown', 'keydown', 'touchend'] as const) window.addEventListener(ev, unlock, { capture: true, passive: true });

  // One delegated listener for every UI button.
  document.addEventListener('click', (e) => {
    const el = (e.target as Element | null)?.closest?.(CLICKABLE);
    if (el && !(el as HTMLButtonElement).disabled && el.closest('#ui')) audio.play('click');
  }, true);

  client.on((events) => {
    playForEvents(events);
    for (const e of events) if (e.t === 'SeasonChanged') audio.setMusic(SEASON_MOOD[e.season] ?? 'spring');
  });
  const idx = client.getState().season.index;
  audio.setMusic(SEASON_MOOD[idx] ?? 'spring');
}
