// Player settings persisted in localStorage ('hl-settings'). Plain data + a tiny subscribe API.
export type ActionId =
  | 'pause' | 'speed1' | 'speed2' | 'speed3' | 'escape' | 'build' | 'heroes' | 'research' | 'toggleScene'
  | 'diplomacy' | 'tabScene' | 'debug' | 'quests' | 'upgrade';

export const DEFAULT_KEYBINDS: Record<ActionId, string> = {
  pause: 'Space', speed1: 'Digit1', speed2: 'Digit2', speed3: 'Digit3', escape: 'Escape', build: 'KeyB',
  heroes: 'KeyH', research: 'KeyR', toggleScene: 'KeyM', diplomacy: 'KeyT', tabScene: 'Tab', debug: 'Backquote', quests: 'KeyJ', upgrade: 'KeyU',
};

export type QualityLevel = 'low' | 'medium' | 'high';
export type TextSize = 'small' | 'normal' | 'large';

export interface Settings {
  uiScale: number;
  /** Graphics quality handed to renderer.setQuality. */
  quality: QualityLevel;
  /** Base text size multiplier (small 0.9, normal 1, large 1.2). */
  textSize: TextSize;
  reducedMotion: boolean;
  colourBlind: boolean;
  musicVolume: number;
  sfxVolume: number;
  muted: boolean;
  autoOpenReport: boolean;
  edgeScroll: boolean;
  keybinds: Record<ActionId, string>;
}

export const DEFAULT_SETTINGS: Settings = {
  uiScale: 1, quality: 'high', textSize: 'normal', reducedMotion: false, colourBlind: false, musicVolume: 0.5, sfxVolume: 0.7, muted: false,
  autoOpenReport: true, edgeScroll: true, keybinds: { ...DEFAULT_KEYBINDS },
};

const KEY = 'hl-settings';
let current: Settings = load();
const subs = new Set<() => void>();

function load(): Settings {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Settings>;
      return { ...DEFAULT_SETTINGS, ...p, keybinds: { ...DEFAULT_KEYBINDS, ...(p.keybinds ?? {}) } };
    }
  } catch { /* corrupt or blocked storage: fall back to defaults */ }
  // First run: honour the OS reduced-motion preference.
  const os = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return { ...DEFAULT_SETTINGS, reducedMotion: os, keybinds: { ...DEFAULT_KEYBINDS } };
}

export function getSettings(): Readonly<Settings> { return current; }

export function updateSettings(patch: Partial<Settings>): void {
  current = { ...current, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* ignore */ }
  for (const f of [...subs]) f();
}

export function setKeybind(action: ActionId, code: string): void {
  updateSettings({ keybinds: { ...current.keybinds, [action]: code } });
}

export function resetKeybinds(): void { updateSettings({ keybinds: { ...DEFAULT_KEYBINDS } }); }

export function subscribeSettings(fn: () => void): () => void { subs.add(fn); return () => { subs.delete(fn); }; }

/** Applies CSS-level settings to the document root. */
export function applySettingsToDom(): void {
  const root = document.documentElement;
  root.style.setProperty('--ui-scale', String(current.uiScale));
  root.classList.toggle('reduced-motion', current.reducedMotion);
  root.classList.toggle('colour-blind', current.colourBlind);
  document.body.dataset.colourblind = current.colourBlind ? 'true' : 'false'; // render may read this
  document.body.dataset.reducedMotion = current.reducedMotion ? 'true' : 'false';
  document.body.classList.toggle('colour-blind', current.colourBlind);
  root.style.setProperty('--text-scale', String({ small: 0.9, normal: 1, large: 1.2 }[current.textSize] ?? 1));
}
