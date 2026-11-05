import type { JSX } from 'preact';
import { HEROES, LORDS, REQUESTS } from '@sim/data/registry';
import { ALLIED_REP, FRIENDLY_REP, lordStage, requestReady } from '@sim/allies';
import { offeredHero } from '@sim/systems/allies';
import type { GameClient } from '@app/game';
import type { GameState, LordRequest, LordState } from '@sim/state';
import { closePanel } from '../menu';
import { act } from '../act';
import { costEntries, fmtTicks } from '../format';
import { useGame } from '../hooks';
import { ui, useUI } from '../store';
import { S } from '../strings';
import { Icon, Modal, Portrait } from './Common';
import { GiftBox, RallyBox, TradeBox } from './DiploActions';

/** Reputation -100..100 with the three stage thresholds marked. */
export function StageBar({ rep }: { rep: number }): JSX.Element {
  const pct = (v: number): string => `${((v + 100) / 2).toFixed(1)}%`;
  return (
    <div class="stagebar" role="img" aria-label={`${S.diplomacy.rep} ${rep}`}>
      <div class="seg hostile" style={{ width: pct(-25) }} />
      <div class="seg wary" style={{ width: `${(50 / 2).toFixed(1)}%` }} />
      <div class="seg friendly" style={{ width: `${(40 / 2).toFixed(1)}%` }} />
      <div class="seg allied" style={{ width: `${(35 / 2).toFixed(1)}%` }} />
      {[-25, FRIENDLY_REP, ALLIED_REP].map((t) => <i key={t} class="tick" style={{ left: pct(t) }} title={String(t)} />)}
      <b class="pointer" style={{ left: pct(rep) }} />
    </div>
  );
}

/** Closes the panel and shows a world-map place (a camp or a village) with its info panel open. */
function showOnMap(client: GameClient, state: GameState, poi: string): void {
  const p = state.world.pois[poi];
  if (!p) return;
  closePanel(client);
  client.setScene('world');
  client.focusCell('world', p.cell);
  client.select({ kind: 'poi', id: p.id });
}

function requestText(r: LordRequest): string {
  if (r.kind === 'deliver') return S.diplomacy.deliver(Number(r.data.amount ?? 0), S.resources[String(r.data.res)] ?? String(r.data.res));
  return (S.diplomacy as unknown as Record<string, string>)[r.kind] ?? S.diplomacy.kinds[r.kind] ?? r.kind;
}

function Requests({ l }: { l: LordState }): JSX.Element {
  const { client, state } = useGame();
  return (
    <div class="section">
      <h4>{S.diplomacy.requests}</h4>
      {l.requests.length === 0 && <p class="small muted">{S.diplomacy.noRequests}</p>}
      {l.requests.map((r) => {
        const ready = requestReady(state, l, r);
        const rw = r.template ? REQUESTS[r.template]?.reward : undefined;
        return (
          <div key={r.id} class={`request ${r.urgent ? 'urgent' : ''}`}>
            <div class="grow">
              <b>{S.diplomacy.kinds[r.kind] ?? r.kind}</b> {r.urgent && <span class="badge warn" title={S.diplomacy.urgent}>! {S.diplomacy.urgent}</span>} {r.accepted && <span class="badge ok">{S.diplomacy.accepted}</span>}
              <div class="small">{requestText(r)}</div>
              <div class="small muted">
                {S.diplomacy.expires} {fmtTicks(Math.max(0, r.expiresAt - state.tick))}
                {rw && <> · {S.diplomacy.reward}: +{rw.rep} {S.diplomacy.rep.toLowerCase()} {costEntries(rw.resources ?? {}).map(([k, n]) => <span key={k}> <Icon id={k} size={14} />{n}</span>)}</>}
              </div>
            </div>
            <div class="itemacts">
              {!r.accepted && <button class="btn small" onClick={() => act(client, { t: 'allyRequest', lord: l.id, choice: `accept:${r.id}` })}>{S.diplomacy.accept}</button>}
              {!r.accepted && <button class="btn small" onClick={() => act(client, { t: 'allyRequest', lord: l.id, choice: `refuse:${r.id}` })}>{S.diplomacy.refuse}</button>}
              {typeof r.data.camp === 'string' && r.data.camp && state.world.pois[r.data.camp] && <button class="btn small" onClick={() => showOnMap(client, state, String(r.data.camp))}>{S.diplomacy.showCamp}</button>}
              {r.kind === 'deliver' && <button class="btn small primary" disabled={!ready} onClick={() => act(client, { t: 'allyRequest', lord: l.id, choice: `fulfil:${r.id}` })}>{S.diplomacy.fulfil}</button>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LordCard({ l }: { l: LordState }): JSX.Element | null {
  const { client, state } = useGame();
  const def = LORDS[l.id];
  if (!def) return null;
  const stage = lordStage(l.rep);
  const offered = offeredHero(l.id);
  return (
    <div class="lordcard">
      <div class="lordhead">
        <Portrait id={l.id} size={72} cls="lord" accent={def.banner} ring={def.banner} />
        <div class="grow">
          <h3 class="herotitle"><span class="bannerdot" style={{ background: def.banner }} aria-hidden="true" /> {def.name}</h3>
          <div class="muted">{S.diplomacy.personality[def.personality]} · <b class={`stage-${stage}`}>{S.diplomacy.stages[stage]}</b> · {S.diplomacy.rep} <b>{l.rep}</b></div>
          <div class="small muted">{S.diplomacy.stageGives[stage]}</div>
          <div class="small">
            {S.diplomacy.likes}: {def.likes.map((r) => <Icon key={r} id={r} size={18} title={S.resources[r]} />)}
            {' '}{S.diplomacy.dislikes}: {def.dislikes.map((r) => <Icon key={r} id={r} size={18} title={S.resources[r]} />)}
          </div>
        </div>
      </div>
      {state.quests.counters[`heroOffer_${l.id}`] === 1 && offered && !state.heroes[offered] && (
        <div class="row"><span class="grow">{def.name} {S.diplomacy.heroOffer}: <b>{HEROES[offered]?.name ?? offered}</b></span><button class="btn primary" onClick={() => act(client, { t: 'acceptHeroOffer', lord: l.id })}>{S.diplomacy.acceptHero}</button></div>
      )}
      {state.world.pois[l.poi] && <div class="row"><button class="btn small" onClick={() => showOnMap(client, state, l.poi)}>{S.diplomacy.showVillage}</button></div>}
      <StageBar rep={l.rep} />
      <div class="stagelabels small muted"><span>{S.diplomacy.stages.hostile}</span><span>{S.diplomacy.stages.wary}</span><span>{S.diplomacy.stages.friendly}</span><span>{S.diplomacy.stages.allied}</span></div>
    </div>
  );
}

export function DiplomacyPanel(): JSX.Element {
  const { state } = useGame();
  const u = useUI();
  const lords = Object.keys(state.lords).sort().map((id) => state.lords[id]!).filter((l) => {
    const cell = state.world.pois[l.poi]?.cell ?? -1;
    return (state.world.fog[cell] ?? 0) > 0 || l.rep !== 0 || l.requests.length > 0 || l.id === u.lordId;
  });
  const sel = lords.find((l) => l.id === u.lordId) ?? lords[0];
  return (
    <Modal title={S.diplomacy.title} onClose={() => ui.set({ panel: null })} wide xl>
      {lords.length === 0 ? <p class="muted">{S.diplomacy.none}</p> : (
        <div class="herolayout">
          <div class="rosterlist">
            {lords.map((l) => {
              const def = LORDS[l.id];
              return (
                <button key={l.id} class={`rostercard ${sel?.id === l.id ? 'on' : ''}`} onClick={() => ui.set({ lordId: l.id })}>
                  <Portrait id={l.id} size={44} cls="lord" accent={def?.banner} ring={def?.banner} />
                  <div class="grow"><b>{def?.name ?? l.id}</b><div class="small muted">{S.diplomacy.stages[lordStage(l.rep)]} · {l.rep}</div></div>
                  {l.requests.length > 0 && <span class={`badge ${l.requests.some((r) => r.urgent) ? 'warn' : ''}`} title={S.diplomacy.requests}>{l.requests.length}</span>}
                </button>
              );
            })}
          </div>
          <div class="herodetail">
            {sel && <><LordCard l={sel} /><GiftBox lord={sel.id} /><TradeBox lord={sel.id} /><Requests l={sel} /></>}
            <RallyBox />
          </div>
        </div>
      )}
    </Modal>
  );
}
