import type { JSX } from 'preact';
import { cityDefence, raidCell } from '@sim/raids';
import { fmtNum, fmtTicks } from '../format';
import { useGame } from '../hooks';
import { S } from '../strings';
import { Icon } from './Common';

/** Persistent banner for the soonest warned raid: ETA, raiders' strength against the town's defence, camera button. */
export function RaidBanner(): JSX.Element | null {
  const { client, state } = useGame();
  const raids = Object.values(state.raids).filter((r) => r.warned === true && state.tick < r.arriveAt)
    .sort((a, b) => a.arriveAt - b.arriveAt);
  const r = raids[0];
  if (!r) return null;
  const power = cityDefence(state).power;
  const ratio = r.strength / Math.max(1, power);
  const verdict = ratio > 1.15 ? S.raid.behind : ratio < 0.85 ? S.raid.ahead : S.raid.even;
  return (
    <div class={`raid-banner ${ratio > 1.15 ? 'bad' : ''}`} role="alert">
      <Icon id="skull" size={34} />
      <div class="raidtext">
        <b>{S.raid.banner}{raids.length > 1 ? ` (x${raids.length})` : ''}</b>
        <span>{S.raid.eta} <b>{fmtTicks(r.arriveAt - state.tick)}</b></span>
      </div>
      <div class="raidtext">
        <span>{S.raid.raiders} <b>{fmtNum(r.strength)}</b> · {S.raid.defence} <b>{fmtNum(power)}</b></span>
        <span class="small">{verdict}</span>
      </div>
      <button class="btn small" onClick={() => { client.setScene('world'); client.focusCell('world', raidCell(state, r)); }}>{S.raid.focus}</button>
    </div>
  );
}
