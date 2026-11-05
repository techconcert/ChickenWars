import { useEffect, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { audio } from '@platform/audio';
import { codeLabel } from '@platform/input';
import { applySettingsToDom, resetKeybinds, setKeybind, updateSettings } from '@platform/settings';
import type { ActionId, Settings } from '@platform/settings';
import { useGame, useSettings } from '../hooks';
import { closePanel } from '../menu';
import { ui } from '../store';
import { S } from '../strings';
import { Modal } from './Common';

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }): JSX.Element {
  return <label class="setrow"><span>{label}</span><input type="checkbox" checked={value} onChange={(e) => onChange((e.target as HTMLInputElement).checked)} /></label>;
}
function Choice<T extends string>({ label, value, opts, onChange }: { label: string; value: T; opts: Record<string, string>; onChange: (v: T) => void }): JSX.Element {
  return (
    <div class="setrow"><span>{label}</span>
      <div class="segbtns" role="group" aria-label={label}>
        {Object.keys(opts).map((k) => <button key={k} type="button" class={`btn small ${value === k ? 'primary' : ''}`} aria-pressed={value === k} onClick={() => onChange(k as T)}>{opts[k]}</button>)}
      </div>
    </div>
  );
}
function Slider({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }): JSX.Element {
  return <label class="setrow"><span>{label} <b>{Math.round(value * 100)}%</b></span><input type="range" min={min} max={max} step={step} value={value} onInput={(e) => onChange(Number((e.target as HTMLInputElement).value))} /></label>;
}

export function SettingsPanel(): JSX.Element {
  const s = useSettings();
  const { client } = useGame();
  const [capture, setCapture] = useState<ActionId | null>(null);
  const set = (p: Partial<Settings>): void => { updateSettings(p); applySettingsToDom(); audio.setMuted(s.muted); };
  useEffect(() => {
    ui.set({ capturingKey: capture !== null });
    if (!capture) return;
    const onKey = (e: KeyboardEvent): void => {
      e.preventDefault(); e.stopPropagation();
      if (e.code !== 'Escape') setKeybind(capture, e.code);
      setCapture(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [capture]);
  return (
    <Modal title={S.settings.title} onClose={() => closePanel(client)}>
      <h4>{S.settings.display}</h4>
      <Choice label={S.settings.quality} value={s.quality} opts={S.settings.qualities} onChange={(v) => set({ quality: v })} />
      <Choice label={S.settings.textSize} value={s.textSize} opts={S.settings.textSizes} onChange={(v) => set({ textSize: v })} />
      <Slider label={S.settings.uiScale} value={s.uiScale} min={0.8} max={1.5} step={0.05} onChange={(v) => set({ uiScale: v })} />
      <Toggle label={S.settings.reducedMotion} value={s.reducedMotion} onChange={(v) => set({ reducedMotion: v })} />
      <Toggle label={`${S.settings.colourBlind} (${S.settings.colourBlindTip})`} value={s.colourBlind} onChange={(v) => set({ colourBlind: v })} />
      <h4>{S.settings.audio}</h4>
      <Slider label={S.settings.music} value={s.musicVolume} min={0} max={1} step={0.05} onChange={(v) => { set({ musicVolume: v }); audio.setVolumes(v, s.sfxVolume); }} />
      <Slider label={S.settings.sfx} value={s.sfxVolume} min={0} max={1} step={0.05} onChange={(v) => { set({ sfxVolume: v }); audio.setVolumes(s.musicVolume, v); }} />
      <Toggle label={S.settings.mute} value={s.muted} onChange={(v) => { updateSettings({ muted: v }); audio.setMuted(v); }} />
      <h4>{S.settings.gameplay}</h4>
      <Toggle label={S.settings.autoReport} value={s.autoOpenReport} onChange={(v) => set({ autoOpenReport: v })} />
      <Toggle label={S.settings.edgeScroll} value={s.edgeScroll} onChange={(v) => set({ edgeScroll: v })} />
      <h4>{S.settings.keys}</h4>
      <div class="keygrid">
        {(Object.keys(s.keybinds) as ActionId[]).map((a) => (
          <button key={a} class={`btn small keybtn ${capture === a ? 'on' : ''}`} onClick={() => setCapture(a)} title={S.settings.remap}>
            <span>{S.actions[a]}</span><kbd>{capture === a ? S.settings.press : codeLabel(s.keybinds[a])}</kbd>
          </button>
        ))}
      </div>
      <div class="row actions end"><button class="btn small" onClick={() => resetKeybinds()}>{S.settings.reset}</button></div>
    </Modal>
  );
}
