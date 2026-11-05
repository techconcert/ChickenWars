import type { JSX } from 'preact';
import { TROOP_LIST } from '@sim/data/registry';
import { getPopulation, upkeepPerMinute } from '@sim/systems/economy';
import { healPerMinute, woundedCap, totalWounded } from '@sim/systems/military';
import { useGame } from '../hooks';
import { fmtRate } from '../format';
import { ui } from '../store';
import { S } from '../strings';
import { Icon, Modal } from './Common';

export function ArmyPanel(): JSX.Element {
  const { state } = useGame();
  const away: Record<string, number> = {};
  for (const m of Object.values(state.marches)) for (const t of Object.keys(m.troops)) away[t] = (away[t] ?? 0) + (m.troops[t] ?? 0);
  const rows = TROOP_LIST.filter((t) => (state.troops[t.id]?.healthy ?? 0) + (state.troops[t.id]?.wounded ?? 0) + (away[t.id] ?? 0) > 0);
  const pop = getPopulation(state);
  return (
    <Modal title={S.army.title} onClose={() => ui.set({ panel: null })}>
      {rows.length === 0 ? <p class="muted">{S.army.none}</p> : (
        <table class="armytable">
          <thead><tr><th /><th>{S.army.healthy}</th><th>{S.army.wounded}</th><th>{S.army.away}</th><th>{S.army.upkeep}</th></tr></thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id}>
                <td><Icon id={t.class} size={24} /> {t.name} <span class="muted small">T{t.tier}</span></td>
                <td>{state.troops[t.id]?.healthy ?? 0}</td><td>{state.troops[t.id]?.wounded ?? 0}</td><td>{away[t.id] ?? 0}</td>
                <td>{fmtRate(-(((state.troops[t.id]?.healthy ?? 0) + (away[t.id] ?? 0) + (state.troops[t.id]?.wounded ?? 0) * 0.5) * t.upkeepFoodPerMinute))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div class="statline">
        <span>{S.army.upkeep}: <b>{fmtRate(-upkeepPerMinute(state))}</b>/min</span>
        <span>{S.army.pop}: <b>{pop.used}/{pop.cap}</b> ({S.popTip.troops} {pop.troops})</span>
        <span>{S.army.infirmary}: {totalWounded(state)}/{woundedCap(state)} · {S.army.healRate} {healPerMinute(state).toFixed(1)}/min</span>
      </div>
    </Modal>
  );
}
