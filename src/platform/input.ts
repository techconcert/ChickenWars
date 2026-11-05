// Global keymap: maps KeyboardEvent.code to action ids using the (remappable) settings keybinds.
import { DEFAULT_KEYBINDS, getSettings } from './settings';
import type { ActionId } from './settings';

export type ActionHandlers = Partial<Record<ActionId, () => void>>;

export function codeLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code === 'Backquote') return '`';
  return code;
}

/** Installs a capture-phase keydown listener. Returns an uninstall function. */
export function installInput(handlers: ActionHandlers, isCapturing: () => boolean = () => false): () => void {
  const onKey = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.metaKey || e.altKey || isCapturing()) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) {
      if (e.code !== 'Escape') return;
    }
    const kb = { ...DEFAULT_KEYBINDS, ...getSettings().keybinds }; // older saved settings lack newer actions
    for (const id of Object.keys(kb) as ActionId[]) {
      if (kb[id] === e.code) {
        const h = handlers[id];
        if (h) {
          e.preventDefault();
          if (!e.repeat) h();
          return;
        }
      }
    }
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}
