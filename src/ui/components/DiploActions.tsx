import { useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { BALANCE, LORDS } from '@sim/data/registry';
import { alliedLords, giftRep, tradeRatioPm, tradeYield, tradesLeft } from '@sim/allies';
import type { Res, ResourceId } from '@sim/state';
import { act, why } from '../act';
import { fmtTicks } from '../format';
import { useGame } from '../hooks';
import { ui } from '../store';
import { S, bossName } from '../strings';
import { Icon } from './Common';

const GIFT_RES: ResourceId[] = ['food', 'wood', 'stone', 'gold', 'ember'];
const TRADE_RES: ResourceId[] = ['food', 'wood', 'stone', 'gold'];

export function GiftBox({ lord }: { lord: string }): JSX.Element {
  const { client, state } = useGame();
  const [amt, setAmt] = useState<Record<string, number>>({});
  const def = LORDS[lord];
  const gift: Res = {};
  for (const r of GIFT_RES) if ((amt[r] ?? 0) > 0) gift[r] = Math.min(amt[r] ?? 0, Math.floor(state.resources[r]));
  const rep = giftRep(state, lord, gift);
  const cmd = { t: 'allyGift', lord, gift } as const;
  const reason = Object.keys(gift).length ? why(state, cmd) : S.diplomacy.gift;
  return (
    <div class="section">
      <h4>{S.diplomacy.gift}</h4>
      <div class="giftrow">
        {GIFT_RES.map((r) => {
          const mood = def?.likes.includes(r) ? 'like' : def?.dislikes.includes(r) ? 'dislike' : '';
          return (
            <label key={r} class={`giftres ${mood}`} title={`${S.resources[r]}${mood === 'like' ? ` (${S.diplomacy.likes})` : mood === 'dislike' ? ` (${S.diplomacy.dislikes})` : ''}`}>
              <Icon id={r} size={22} />
              <input class="num" type="number" min={0} max={Math.floor(state.resources[r])} value={amt[r] ?? 0}
                onInput={(e) => setAmt({ ...amt, [r]: Math.max(0, Math.floor(Number((e.target as HTMLInputElement).value) || 0)) })} />
              <button class="btn small" onClick={() => setAmt({ ...amt, [r]: Math.min(Math.floor(state.resources[r]), (amt[r] ?? 0) + 50) })}>+50</button>
            </label>
          );
        })}
      </div>
      <div class="row actions">
        <span class="small">{S.diplomacy.predicted}: <b class="pos">+{rep}</b></span>
        <span class="grow" />
        <button class="btn primary" disabled={Object.keys(gift).length === 0 || (reason !== '' && reason !== S.diplomacy.gift)} title={reason}
          onClick={() => { if (act(client, cmd)) setAmt({}); }}>{S.diplomacy.giveGift}</button>
      </div>
    </div>
  );
}

export function TradeBox({ lord }: { lord: string }): JSX.Element {
  const { client, state } = useGame();
  const [give, setGive] = useState<ResourceId>('wood');
  const [get, setGet] = useState<ResourceId>('gold');
  const left = tradesLeft(state, lord);
  const yieldN = tradeYield(state, lord, give);
  const pm = tradeRatioPm(state, lord, give);
  const cmd = { t: 'allyTrade', lord, give, get } as const;
  const reason = why(state, cmd);
  const lot = BALANCE.allies.tradeLot;
  const sel = (v: ResourceId, set: (r: ResourceId) => void): JSX.Element => (
    <select value={v} onChange={(e) => set((e.target as HTMLSelectElement).value as ResourceId)}>
      {TRADE_RES.map((r) => <option key={r} value={r}>{S.resources[r]}</option>)}
    </select>
  );
  return (
    <div class="section">
      <h4>{S.diplomacy.trade}</h4>
      {state.lords[lord] && pm === 0 ? <p class="small muted">{S.diplomacy.hostileTrade}</p> : (
        <div class="row">
          <label class="small">{S.diplomacy.give} {sel(give, setGive)}</label>
          <label class="small">{S.diplomacy.get} {sel(get, setGet)}</label>
          <span class="small"><b>{lot}</b> <Icon id={give} size={16} /> {'->'} <b>{yieldN}</b> <Icon id={get} size={16} /> <span class="muted">({(pm / 1000).toFixed(2)}x)</span></span>
          <span class="grow" />
          <span class="small muted">{S.diplomacy.tradesLeft}: <b>{left}</b></span>
          <button class="btn" disabled={reason !== ''} title={reason} onClick={() => act(client, cmd)}>{S.diplomacy.doTrade}</button>
        </div>
      )}
    </div>
  );
}

export function RallyBox(): JSX.Element {
  const { state, client } = useGame();
  const allies = alliedLords(state);
  const sel = client.selection;
  const poi = sel?.kind === 'poi' ? state.world.pois[sel.id] : undefined;
  const target = poi && poi.active && (poi.kind === 'bandit_camp' || poi.kind === 'lair' || poi.kind === 'boss') ? poi : undefined;
  const rallies = Object.values(state.rallies);
  const tName = target ? (target.kind === 'boss' ? bossName(target.bossId) ?? S.world.poiNames.boss : S.world.poiNames[target.kind]) : '';
  return (
    <div class="section rallybox">
      <h4><Icon id="march_attack" size={18} /> {S.diplomacy.rally}</h4>
      <p class="small muted">{S.diplomacy.rallyHint} {S.diplomacy.share}.</p>
      <div class="row">
        <span class="small grow">{S.diplomacy.rallyTarget}: <b>{target ? `${tName} (${S.world.tier} ${target.tier})` : S.diplomacy.rallyNoTarget}</b></span>
        <button class="btn primary" disabled={!target || allies.length === 0} title={allies.length === 0 ? S.diplomacy.rallyNeed : ''}
          onClick={() => { if (target) { ui.set({ panel: null, marchReq: { kind: 'rally', target: { poi: target.id }, cell: target.cell, label: tName ?? '' } }); client.setScene('world'); } }}>
          {S.diplomacy.startRally}
        </button>
      </div>
      {allies.length === 0 && <div class="small muted">{S.diplomacy.rallyNeed}</div>}
      <h4>{S.diplomacy.rallies}</h4>
      {rallies.length === 0 && <div class="small muted">{S.diplomacy.noRally}</div>}
      {rallies.map((r) => {
        const p = state.world.pois[r.target];
        return (
          <div class="statrow" key={r.id}>
            <span>{p ? S.world.poiNames[p.kind] : r.target} · {S.diplomacy.waitLeft} {fmtTicks(Math.max(0, r.waitUntil - state.tick))}</span>
            <span class="small">{r.lords.map((l) => <span key={l} class={`pill ${r.arrived.includes(l) ? 'ok' : ''}`}>{LORDS[l]?.name ?? l}: {r.arrived.includes(l) ? S.diplomacy.arrived : S.diplomacy.coming}</span>)}</span>
          </div>
        );
      })}
    </div>
  );
}
