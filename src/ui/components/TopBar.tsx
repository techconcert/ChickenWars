import type { JSX } from 'preact';
import { getCaps, getPopulation, getRates } from '@sim/systems/economy';
import type { RateInfo } from '@sim/systems/economy';
import { seasonId, seasonLengths } from '@sim/systems/seasons';
import { SEASON_IDS } from '@sim/constants';
import type { ResourceId } from '@sim/state';
import { useGame } from '../hooks';
import { fmtNum, fmtRate, RES_ORDER } from '../format';
import { ui } from '../store';
import { closePanel, openPauseMenu } from '../menu';
import { S } from '../strings';
import { Icon, Tip } from './Common';
import type { Speed } from '@sim/state';

/** `caps` and `rates` are computed once per TopBar render and shared by all chips (they are whole-city values). */
function ResChip({ res, caps, rates }: { res: ResourceId; caps: Record<ResourceId, number>; rates: Record<ResourceId, RateInfo> }): JSX.Element {
  const { state } = useGame();
  const v = Math.floor(state.resources[res]);
  const cap = caps[res];
  const r = rates[res];
  const full = v >= cap * 0.95;
  const p = r.parts;
  const line = (label: string, n: number): JSX.Element | null => (Math.abs(n) < 0.05 ? null : <div class="tip-row"><span>{label}</span><b>{fmtRate(n)}</b></div>);
  const tip = (
    <div class="tip-table">
      <div class="tip-title">{S.resources[res]} {v}/{cap}</div>
      {line(S.rates.base, p.base)}{line(S.rates.adjacency, p.adjacency)}{line(S.rates.proximity, p.proximity)}{line(S.rates.research, p.research)}{line(S.rates.clan, p.clan)}
      {line(S.rates.buffs, p.buffs)}{line(S.rates.season, p.season)}{line(S.rates.damaged, p.damaged)}{line(S.rates.floor, p.floor)}
      {r.upkeep > 0 && <div class="tip-row"><span>{S.rates.upkeep}</span><b>{fmtRate(-r.upkeep)}</b></div>}
      <div class="tip-row tip-sum"><span>{S.rates.net}{S.rates.perMin}</span><b>{fmtRate(r.net)}</b></div>
    </div>
  );
  return (
    <Tip tip={tip}>
      <div class={`chip res ${full ? 'full' : ''} res-${res}`} tabIndex={0}>
        <Icon id={res} size={28} />
        <div class="chip-text">
          <span class="chip-val">{fmtNum(v)}<span class="chip-cap">/{fmtNum(cap)}</span></span>
          <span class={`chip-rate ${r.net < 0 ? 'neg' : r.net > 0 ? 'pos' : ''}`}>{fmtRate(r.net)}{S.rates.perMin}</span>
        </div>
      </div>
    </Tip>
  );
}

export function TopBar(): JSX.Element {
  const { client, state } = useGame();
  const pop = getPopulation(state);
  const caps = getCaps(state);
  const rates = getRates(state);
  const sid = seasonId(state);
  const len = seasonLengths(state)[state.season.index] ?? 20;
  const left = Math.max(0, len - state.season.dayOfSeason);
  const next = SEASON_IDS[(state.season.index + 1) % 4] ?? 'spring';
  const speeds: Speed[] = [0, 1, 2, 4];
  const world = client.scene === 'world';
  return (
    <header class="topbar">
      <div class="top-group">
        {RES_ORDER.filter((r) => r !== 'ember' || state.resources.ember > 0 || state.stats.bossesKilled > 0 || state.tick > 30000).map((r) => <ResChip key={r} res={r} caps={caps} rates={rates} />)}
        <Tip tip={<div class="tip-table"><div class="tip-row"><span>{S.popTip.troops}</span><b>{pop.troops}</b></div><div class="tip-row"><span>{S.popTip.workers}</span><b>{pop.workers}</b></div><div class="tip-row tip-sum"><span>{S.popTip.cap}</span><b>{pop.cap}</b></div></div>}>
          <div class={`chip res ${pop.free <= 0 ? 'full' : ''}`} tabIndex={0}>
            <Icon id="pop" size={28} />
            <div class="chip-text"><span class="chip-val">{pop.used}<span class="chip-cap">/{pop.cap}</span></span><span class="chip-rate">{S.topbar.pop}</span></div>
          </div>
        </Tip>
      </div>
      <div class="top-group center">
        <Tip tip={`${S.seasons[sid]} -> ${S.seasons[next]}: ${left} ${S.topbar.nextSeason}`}>
          <div class="chip clock" tabIndex={0}>
            <Icon id={sid} size={28} />
            <div class="chip-text">
              <span class="chip-val">{S.topbar.day} {state.season.day + 1}</span>
              <span class="chip-rate">{S.seasons[sid]}, {S.topbar.year} {state.season.year + 1} · {left}d</span>
            </div>
          </div>
        </Tip>
        <div class="speeds" role="group" aria-label={S.topbar.speed}>
          {speeds.map((sp) => (
            <button key={sp} class={`btn speed ${client.speed === sp ? 'on' : ''}`} onClick={() => client.setSpeed(sp)} title={sp === 0 ? S.topbar.pause : `${sp}x`}>{S.speedLabels[sp]}</button>
          ))}
        </div>
      </div>
      <div class="top-group right">
        <button class="btn scene-toggle" onClick={() => { client.setScene(world ? 'base' : 'world'); client.setPlacing(null); ui.set({ panel: null }); }}>
          {world ? S.topbar.toBase : S.topbar.toWorld}
        </button>
        <button class="btn" onClick={() => (ui.get().panel === 'menu' ? closePanel(client) : openPauseMenu(client))}>{S.topbar.menu}</button>
      </div>
    </header>
  );
}
