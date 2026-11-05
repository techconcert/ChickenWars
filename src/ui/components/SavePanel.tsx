import { useEffect, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { SLOTS, exportToFile, importFromFile, listSlots, loadFromSlot, saveToSlot, stashPending } from '@platform/save';
import type { SlotId } from '@platform/save';
import type { SaveMeta } from '@sim/save/serialize';
import { useGame } from '../hooks';
import { closePanel } from '../menu';
import { ui } from '../store';
import { S } from '../strings';
import { Modal } from './Common';

export function reloadClean(): void { location.href = location.pathname; }

export function SavePanel(): JSX.Element {
  const { client, state } = useGame();
  const [metas, setMetas] = useState<Record<SlotId, SaveMeta | null> | null>(null);
  const [msg, setMsg] = useState('');
  const [confirm, setConfirm] = useState<SlotId | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const refresh = (): void => { void listSlots().then(setMetas); };
  useEffect(refresh, []);
  const save = (slot: SlotId): void => {
    saveToSlot(slot, state).then(() => { setMsg(S.save.saved); refresh(); }).catch(() => setMsg(S.save.loadFail));
  };
  const load = (slot: SlotId): void => {
    if (confirm !== slot) { setConfirm(slot); return; }
    loadFromSlot(slot).then(async (r) => {
      if (!r) { setMsg(S.save.loadFail); return; }
      await stashPending(r);
      reloadClean();
    }).catch(() => setMsg(S.save.loadFail));
  };
  const onImport = (e: Event): void => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    importFromFile(f).then(async (r) => {
      if (!r.hashOk) ui.toast(S.save.hashWarn, 'warning');
      await stashPending(r);
      reloadClean();
    }).catch((err: unknown) => setMsg(`${S.save.importFail}: ${err instanceof Error ? err.message : ''}`));
  };
  return (
    <Modal title={S.save.title} onClose={() => closePanel(client)}>
      {SLOTS.map((slot) => {
        const m = metas?.[slot];
        return (
          <div class="slotrow" key={slot}>
            <div class="grow">
              <b>{slot === 'auto' ? S.save.auto : `${S.save.slot} ${slot.slice(4)}`}</b>
              <div class="small muted">{m ? `${m.title} · ${new Date(m.savedAt).toLocaleString()}` : S.save.empty}</div>
            </div>
            {slot !== 'auto' && <button class="btn small" onClick={() => save(slot)}>{S.save.save}</button>}
            <button class={`btn small ${confirm === slot ? 'danger' : ''}`} disabled={!m} title={confirm === slot ? S.save.confirmLoad : ''} onClick={() => load(slot)}>{confirm === slot ? S.common.ok : S.save.load}</button>
          </div>
        );
      })}
      {confirm && <p class="small muted">{S.save.confirmLoad}</p>}
      <div class="row actions">
        <button class="btn" onClick={() => exportToFile(state)}>{S.save.export}</button>
        <button class="btn" onClick={() => file.current?.click()}>{S.save.import}</button>
        <input ref={file} type="file" accept=".json,application/json" hidden onChange={onImport} />
      </div>
      {msg && <div class="msg">{msg}</div>}
    </Modal>
  );
}
