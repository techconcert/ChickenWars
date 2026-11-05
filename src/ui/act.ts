// Dispatch helpers: run a command, toast the friendly reason when the sim refuses it.
import { validateCommand } from '@sim/commands';
import type { Command } from '@sim/commands';
import type { GameClient } from '@app/game';
import type { GameState } from '@sim/state';
import { ui } from './store';
import { errText } from './strings';

/** Dispatches `cmd`; returns true when accepted. A refusal shows a warning toast. */
export function act(client: GameClient, cmd: Command, ok?: string): boolean {
  const code = client.dispatch(cmd);
  if (code) { ui.toast(errText(code), 'warning'); return false; }
  if (ok) ui.toast(ok, 'success');
  return true;
}

/** Why `cmd` is not possible right now (friendly text), or '' when it is. Pure read of the sim validators. */
export function why(state: GameState, cmd: Command): string {
  return errText(validateCommand(state, cmd));
}
