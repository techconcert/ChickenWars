import { render } from 'preact';
import { h } from 'preact';
import type { GameClient } from '@app/game';
import { applySettingsToDom } from '@platform/settings';
import { App } from './App';
import { ui } from './store';
import type { AwaySummary } from './store';
import './styles.css';

export function mountUI(root: HTMLElement, client: GameClient, getRenderStats: () => Record<string, number> | null, debug: boolean): void {
  applySettingsToDom();
  render(h(App, { client, getRenderStats, debug }), root);
}

export function showAway(a: AwaySummary): void { ui.set({ away: a }); }
export { ui };
