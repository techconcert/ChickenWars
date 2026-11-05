// Small UI-only store (open panels, toasts, hover info). Not game state: never serialised.
import { useEffect, useState } from 'preact/hooks';
import type { MarchKind, Speed, Target } from '@sim/state';
import type { Severity } from './strings';

export type PanelId = 'build' | 'army' | 'menu' | 'save' | 'settings' | 'report' | 'away' | 'heroes' | 'research' | 'diplomacy' | 'newgame' | 'quests' | 'end' | null;

export interface Toast { id: number; text: string; sev: Severity; until: number; sticky?: boolean }
export interface HoverInfo { cell: number; valid?: boolean; error?: string; bonus?: number; kind?: string; id?: string }
export interface MarchRequest { kind: MarchKind; target: Target; cell: number; label: string }
export interface AwaySummary { ms: number; built: number; trained: number; returned: number; gathered: number; battles: number; lost: number }
export interface Raid { raid: string; arriveAt: number }

export interface UIState {
  panel: PanelId;
  buildTab: string;
  marchReq: MarchRequest | null;
  reportId: number | null;
  toasts: Toast[];
  hover: HoverInfo | null;
  debug: boolean;
  raid: Raid | null;
  away: AwaySummary | null;
  capturingKey: boolean;
  notice: string | null;
  /** Speed to restore when the pause menu closes (null when the menu did not pause the game). */
  resumeSpeed: Speed | null;
  /** Hero shown in the heroes panel, tab, and lord shown in the diplomacy panel. */
  heroId: string | null;
  heroTab: 'roster' | 'talents' | 'gear' | 'tavern';
  lordId: string | null;
  questTab: 'quests' | 'reign' | 'chronicle';
}

let state: UIState = {
  panel: null, buildTab: 'core', marchReq: null, reportId: null, toasts: [], hover: null, debug: false, raid: null, away: null,
  capturingKey: false, notice: null,
  resumeSpeed: null, heroId: null, heroTab: 'roster', lordId: null, questTab: 'quests',
};
const subs = new Set<() => void>();
let toastSeq = 1;

export const ui = {
  get(): Readonly<UIState> { return state; },
  set(patch: Partial<UIState>): void {
    state = { ...state, ...patch };
    for (const f of [...subs]) f();
  },
  subscribe(fn: () => void): () => void { subs.add(fn); return () => { subs.delete(fn); }; },
  openPanel(p: PanelId): void { ui.set({ panel: state.panel === p ? null : p }); },
  openHero(id: string | null, tab: UIState['heroTab'] = 'roster'): void { ui.set({ panel: 'heroes', heroId: id, heroTab: tab }); },
  openLord(id: string | null): void { ui.set({ panel: 'diplomacy', lordId: id }); },
  toast(text: string, sev: Severity = 'info', sticky = false): void {
    const t: Toast = { id: toastSeq++, text, sev, until: Date.now() + (sev === 'danger' ? 7000 : 4500), sticky };
    ui.set({ toasts: [...state.toasts.filter((x) => x.text !== text), t].slice(-5) });
  },
  prune(): void {
    const now = Date.now();
    if (state.toasts.some((t) => !t.sticky && t.until < now)) ui.set({ toasts: state.toasts.filter((t) => t.sticky || t.until >= now) });
  },
};

export function useUI(): Readonly<UIState> {
  const [, setN] = useState(0);
  useEffect(() => ui.subscribe(() => setN((n) => n + 1)), []);
  return state;
}
