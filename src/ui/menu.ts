// Menu helpers. The game never pauses by itself (D38): opening menus and panels leaves the speed alone; only the pause button or Space pauses.
import type { GameClient } from '@app/game';
import { ui } from './store';

export function openPauseMenu(_client: GameClient): void {
  ui.set({ panel: 'menu', resumeSpeed: null });
}

/** Closes whatever panel is open. */
export function closePanel(_client: GameClient): void {
  ui.set({ panel: null, resumeSpeed: null });
}
