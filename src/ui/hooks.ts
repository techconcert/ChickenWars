import { createContext } from 'preact';
import { useContext, useEffect, useRef, useState } from 'preact/hooks';
import type { GameClient } from '@app/game';
import type { GameState } from '@sim/state';
import { subscribeSettings, getSettings } from '@platform/settings';
import type { Settings } from '@platform/settings';

export interface GameCtxValue {
  client: GameClient;
  state: Readonly<GameState>;
  /** bumped on each throttled change notification: forces consumers to re-read the mutable state */
  rev: number;
  getRenderStats: () => Record<string, number> | null;
}

export const GameCtx = createContext<GameCtxValue | null>(null);

export function useGame(): GameCtxValue {
  const v = useContext(GameCtx);
  if (!v) throw new Error('useGame outside <GameCtx.Provider>');
  return v;
}

/** Subscribes to client change notifications and re-renders at most `hz` times per second. */
export function useClientRev(client: GameClient, hz = 8): number {
  const [rev, setRev] = useState(0);
  const timer = useRef<number | null>(null);
  useEffect(() => {
    const bump = (): void => {
      if (timer.current !== null) return;
      timer.current = window.setTimeout(() => { timer.current = null; setRev((n) => n + 1); }, 1000 / hz);
    };
    const off = client.subscribe(bump);
    return () => { off(); if (timer.current !== null) window.clearTimeout(timer.current); };
  }, [client, hz]);
  return rev;
}

export function useSettings(): Readonly<Settings> {
  const [, setN] = useState(0);
  useEffect(() => subscribeSettings(() => setN((n) => n + 1)), []);
  return getSettings();
}

/** Panel collapsed flag remembered per panel in localStorage (a per-viewer convenience: reads and writes never throw). */
export function useCollapsed(key: string): [boolean, () => void] {
  const k = `hl-collapsed-${key}`;
  const [v, setV] = useState<boolean>(() => { try { return localStorage.getItem(k) === '1'; } catch { return false; } });
  const toggle = (): void => {
    const n = !v;
    setV(n);
    try { localStorage.setItem(k, n ? '1' : '0'); } catch { /* storage unavailable */ }
  };
  return [v, toggle];
}
