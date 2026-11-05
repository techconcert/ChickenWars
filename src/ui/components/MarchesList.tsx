import type { JSX } from 'preact';
import { HEROES } from '@sim/data/registry';
import { marchCell } from '@sim/nav/position';
import { useCollapsed, useGame } from '../hooks';
import { fmtTicks, costEntries } from '../format';
import { gatherTicksLeft, marchEta, slotsInfo } from '../marchInfo';
import { ui } from '../store';
import { S } from '../strings';
import { CollapseBtn, Icon } from './Common';

export function MarchesList(): JSX.Element {
  const { client, state } = useGame();
  const ids = Object.keys(state.marches);
  const slots = slotsInfo(state);
  const [folded, toggleFold] = useCollapsed('marches');
  return (
    <section class="side-card">
      <h3 class="panelhead"><span class="grow">{S.marches.title} <span class="muted">{ids.length}/{slots.max}</span></span><CollapseBtn collapsed={folded} onToggle={toggleFold} label={folded ? S.panel.expand : S.panel.collapse} /></h3>
      {!folded && <>
      {client.scene === 'world' && (
        <button class="btn small primary" onClick={() => ui.set({ marchReq: { kind: 'scout', target: { auto: true }, cell: -1, label: S.march.randomScout } })}>{S.march.randomScout}</button>
      )}
      {ids.length === 0 && <p class="muted small">{S.marches.none}</p>}
      {ids.map((id) => {
        const m = state.marches[id]!;
        const n = Object.keys(m.troops).reduce((a, t) => a + (m.troops[t] ?? 0), 0);
        const eta = marchEta(state, m) || gatherTicksLeft(state, m);
        const carried = costEntries(m.carried);
        const sel = client.selection?.kind === 'march' && client.selection.id === id;
        const icon = m.state === 'returning' ? 'march_return' : `march_${m.kind === 'garrison' || m.kind === 'rally' ? 'reinforce' : m.kind}`;
        return (
          <div key={id} class={`mrow ${sel ? 'sel' : ''}`}>
            <button class="mmain" onClick={() => { client.select({ kind: 'march', id }); client.setScene('world'); const c = marchCell(m); if (c >= 0) client.focusCell('world', c); }}>
              <Icon id={icon} size={28} />
              <div class="mtext">
                <div class="mtitle">{S.marches.kind[m.kind] ?? m.kind}: {HEROES[m.hero]?.name ?? m.hero}</div>
                <div class="muted small">{n} {S.marches.troops} · {S.marches.phase[m.state] ?? m.state}{eta > 0 ? ` · ${fmtTicks(eta)}` : ''}</div>
                {carried.length > 0 && <div class="small carried">{carried.map(([r, v]) => <span key={r}><Icon id={r} size={14} />{v} </span>)}</div>}
              </div>
            </button>
            {m.state !== 'returning' && m.state !== 'fighting' && <button class="btn small" onClick={() => client.dispatch({ t: 'recall', march: id })}>{S.marches.recall}</button>}
          </div>
        );
      })}
      </>}
    </section>
  );
}

