import { useEffect, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { BALANCE, BUILDINGS, LORDS, TROOPS, buildingCost, buildingTicks } from '@sim/data/registry';
import { TRADING_POST, activeTraders, bestPartner, planTrade, traderCap, tradeState } from '@sim/systems/traders';
import type { TradeWeights } from '@sim/systems/traders';
import { validateCommand } from '@sim/commands';
import { getPopulation } from '@sim/city/pop';
import { trainCost, trainDuration } from '@sim/systems/military';
import { repairCost } from '@sim/systems/city';
import { tradeCooldownLeft, tradeLimitFor, tradeRatio } from '@sim/systems/economy';
import { getCaps } from '@sim/city/caps';
import { adjacencyBonus, hasAdjacency } from '@sim/city/adjacency';
import { proximityInfo } from '@sim/city/proximity';
import { computeProduction } from '@sim/city/production';
import type { Command } from '@sim/commands';
import type { GameState } from '@sim/state';
import { useGame } from '../hooks';
import { effectRows, fmtNum, fmtTicks } from '../format';
import { S, errText } from '../strings';
import { Bar, Cost, Icon } from './Common';

/** Troops of one type we have: at home, wounded, on marches and in training. */
function troopTotal(state: GameState, troop: string): number {
  let n = (state.troops[troop]?.healthy ?? 0) + (state.troops[troop]?.wounded ?? 0);
  for (const m of Object.values(state.marches)) n += m.troops[troop] ?? 0;
  for (const j of state.training) if (j.troop === troop) n += j.count;
  return n;
}

function trainMax(state: GameState, troop: string): number {
  const def = TROOPS[troop];
  if (!def) return 0;
  let max = Math.min(BALANCE.trainBatchMax, Math.floor(getPopulation(state).free / def.popCost));
  const one = trainCost(state, troop, 1);
  for (const r of Object.keys(one) as (keyof typeof one)[]) if ((one[r] ?? 0) > 0) max = Math.min(max, Math.floor(state.resources[r] / (one[r] ?? 1)));
  return Math.max(0, max);
}

function TrainSection({ id }: { id: string }): JSX.Element | null {
  const { client, state } = useGame();
  const b = state.city.buildings[id];
  const [troop, setTroop] = useState<string | null>(null);
  const [count, setCount] = useState(5);
  const [msg, setMsg] = useState('');
  if (!b || b.level < 1) return null;
  const troops = Object.values(TROOPS).filter((t) => t.building === b.type && t.role !== 'enemy');
  if (!troops.length) return null;
  const sel = troop && TROOPS[troop] ? troop : troops[0]!.id;
  const def = TROOPS[sel]!;
  const lockLevel = b.level < def.minBuildingLevel;
  const lockTech = def.requiresTech && !state.research.done.includes(def.requiresTech);
  const max = trainMax(state, sel);
  const n = Math.max(1, Math.min(count, Math.max(1, max)));
  const cost = trainCost(state, sel, n);
  const jobs = state.training.filter((j) => j.building === id);
  const submit = (): void => {
    const code = client.dispatch({ t: 'train', troop: sel, count: n });
    setMsg(code ? errText(code) : S.building.ok);
  };
  return (
    <div class="section">
      <h4>{S.building.train}</h4>
      <div class="troopcards">
        {troops.map((t) => {
          const locked = b.level < t.minBuildingLevel || (t.requiresTech && !state.research.done.includes(t.requiresTech));
          const owned = troopTotal(state, t.id);
          return (
            <button key={t.id} class={`tcard ${sel === t.id ? 'on' : ''} ${locked ? 'locked' : ''}`} onClick={() => { setTroop(t.id); setMsg(''); }}>
              <Icon id={t.class} size={26} /><div><b>{t.name}</b><div class="muted small">T{t.tier} · {S.building.have} <b>{owned}</b></div></div>
            </button>
          );
        })}
      </div>
      <div class="statline small">
        {(['atk', 'def', 'hp', 'speed', 'load'] as const).map((k) => <span key={k}>{S.building.stats[k]} <b>{def[k]}</b></span>)}
        <span>{S.building.upkeep} <b>{def.upkeepFoodPerMinute}</b>/min</span><span>{S.building.pop} <b>{def.popCost}</b></span>
      </div>
      {(lockLevel || lockTech) && <div class="lockmsg">{lockLevel ? `${S.building.needsLevel} ${def.minBuildingLevel}` : S.building.needsTech}</div>}
      <div class="trainrow">
        <label class="small">{S.building.count}
          <input type="range" min={1} max={Math.max(1, max)} value={n} onInput={(e) => setCount(Number((e.target as HTMLInputElement).value))} />
        </label>
        <input class="num" type="number" min={1} max={BALANCE.trainBatchMax} value={n} onInput={(e) => setCount(Math.max(1, Number((e.target as HTMLInputElement).value) || 1))} />
        <button class="btn small" onClick={() => setCount(Math.max(1, max))}>{S.building.max} ({max})</button>
      </div>
      <div class="trainrow">
        <Cost cost={cost} have={state.resources} /><span class="small muted">{fmtTicks(trainDuration(state, id, sel, n))}</span>
        <button class="btn primary" disabled={!!(lockLevel || lockTech) || max < 1} onClick={submit}>{S.building.trainBtn} {n}</button>
      </div>
      {msg && <div class="msg">{msg}</div>}
      {jobs.length > 0 && (
        <div class="subq">
          <h4>{S.building.queue}</h4>
          {jobs.map((j) => {
            const started = j.startTick !== null && j.endTick !== null;
            const total = started ? (j.endTick as number) - (j.startTick as number) : 1;
            const left = started ? (j.endTick as number) - state.tick : 0;
            return (
              <div class="qrow" key={j.id}>
                <Icon id={TROOPS[j.troop]?.class ?? 'infantry'} size={22} />
                <div class="qmain"><div class="qtitle">{j.count} {TROOPS[j.troop]?.name}</div>{started ? <Bar value={total - left} max={total} cls="train" /> : <div class="muted small">{S.queues.waiting}</div>}</div>
                <span class="qeta">{started ? fmtTicks(left) : ''}</span>
                <button class="btn small ghost" aria-label={S.queues.cancel} title={S.queues.cancel} onClick={() => client.dispatch({ t: 'cancelTrain', job: j.id })}>x</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function BonusSection({ id }: { id: string }): JSX.Element | null {
  const { state } = useGame();
  const b = state.city.buildings[id];
  if (!b) return null;
  const px = proximityInfo(state, b.type, b.cell);
  const adj = hasAdjacency(b.type) ? adjacencyBonus(state, b.type, b.cell) : 0;
  if (!px && !adj) return null;
  const rule = px ? BALANCE.proximity[b.type] : undefined;
  const rate = b.level >= 1 ? computeProduction(state).byBuilding[id] : undefined;
  const total = Math.round(adj + (px?.pct ?? 0));
  return (
    <div class="section bonus">
      <h4>{S.building.bonus.title} <span class={total > 0 ? 'pos' : 'muted'}>{total > 0 ? `+${total}%` : ''}</span></h4>
      {adj > 0 && <div class="tip-row small"><span>{S.building.bonus.adjacent}</span><b class="pos">+{Math.round(adj)}%</b></div>}
      {px && rule && (
        <div class="tip-row small"><span>{S.building.bonus.nearby} {S.building.bonus[px.label] ?? px.label} ({px.cells} {S.building.bonus.cells} {S.building.bonus.within} {rule.radius} {S.building.bonus.tiles})</span>
          <b class={px.pct > 0 ? 'pos' : 'muted'}>+{Math.round(px.pct)}% <span class="muted">/ {S.building.bonus.max} {px.max}%</span></b></div>
      )}
      {total === 0 && <div class="muted small">{S.building.bonus.none}</div>}
      {rate && rate.map((r) => <div class="tip-row small" key={r.res}><span>{S.building.bonus.effective}</span><b>{fmtNum(Math.round(r.perMinute * 10) / 10)}{S.rates.perMin} {S.resources[r.res]}</b></div>)}
    </div>
  );
}

const TRADE_RES = ['food', 'wood', 'stone', 'gold'] as const;
const fmtRes = (r: Record<string, number | undefined> | undefined): string => Object.entries(r ?? {}).filter(([, v]) => (v ?? 0) > 0).map(([k, v]) => `${v} ${S.resources[k] ?? k}`).join(', ');

/** Trading Post: target stock mix sliders (percent weights, even by default) for the traders' automatic trips. */
function TradeSection({ id }: { id: string }): JSX.Element | null {
  const { client, state } = useGame();
  const b = state.city.buildings[id];
  const t = tradeState(state);
  const [local, setLocal] = useState<TradeWeights | null>(null);
  if (!b || b.type !== TRADING_POST) return null;
  if (b.level < 1) return null;
  const w = local ?? t.weights;
  const sum = TRADE_RES.reduce((a, r) => a + w[r], 0) || 1;
  const commit = (on: boolean, weights: TradeWeights): void => { setLocal(null); client.dispatch({ t: 'setTrade', on, weights }); };
  const n = activeTraders(state);
  const partner = TRADE_RES.map((r) => bestPartner(state, r)).find((p) => !!p);
  const plan = planTrade(state);
  const left = BALANCE.traders.intervalTicks - (state.tick % BALANCE.traders.intervalTicks);
  return (
    <div class="section trade">
      <h4>{S.trade.title} <span class="muted small">{S.trade.traders} {n}/{traderCap(state)}</span></h4>
      <p class="small muted">{S.trade.hint}</p>
      <div class="row">
        <button class={`btn small ${t.on ? 'primary' : ''}`} onClick={() => commit(!t.on, t.weights)}>{t.on ? S.trade.on : S.trade.off}</button>
        <button class="btn small" onClick={() => commit(t.on, { food: 25, wood: 25, stone: 25, gold: 25 })}>{S.trade.even}</button>
      </div>
      {TRADE_RES.map((r) => (
        <label class="tradeslider small" key={r}>
          <Icon id={r} size={20} />
          <input type="range" min={0} max={100} step={5} value={w[r]} aria-label={`${S.resources[r]} ${S.trade.share}`}
            onInput={(e) => setLocal({ ...w, [r]: Number((e.target as HTMLInputElement).value) })}
            onChange={(e) => commit(t.on, { ...w, [r]: Number((e.target as HTMLInputElement).value) })} />
          <b class="tradepct">{Math.round((w[r] / sum) * 100)}%</b>
        </label>
      ))}
      {n === 0 && <div class="msg warn">{S.trade.noTraders}</div>}
      {n > 0 && !partner && <div class="msg warn">{S.trade.noPartners}</div>}
      {n > 0 && partner && t.on && (plan ? <div class="small muted">{S.trade.next}: {fmtTicks(left)}</div> : <div class="small muted">{S.trade.idle}</div>)}
      {t.last && <div class="small muted">{S.trade.last}: {S.trade.gave} {fmtRes(t.last.give)}, {S.trade.got} {fmtRes(t.last.get)} {S.trade.with} {LORDS[t.last.lord]?.name ?? t.last.lord}</div>}
    </div>
  );
}

function MarketSection({ id }: { id: string }): JSX.Element | null {
  const { client, state } = useGame();
  const b = state.city.buildings[id];
  const [give, setGive] = useState<(typeof TRADE_RES)[number]>('wood');
  const [get, setGet] = useState<(typeof TRADE_RES)[number]>('gold');
  const [amount, setAmount] = useState(100);
  const [msg, setMsg] = useState('');
  if (!b || b.type !== 'market') return null;
  if (b.level < 1) return <div class="section"><h4>{S.market.title}</h4><div class="muted small">{S.market.needsBuilt}</div></div>;
  const limit = tradeLimitFor(state);
  const [n, d] = tradeRatio(state);
  const amt = Math.max(1, Math.min(amount, limit, Math.floor(state.resources[give])));
  const got = Math.floor((amt * n) / d);
  const left = tradeCooldownLeft(state, give);
  const cmd: Command = { t: 'marketTrade', give, get, amount: amt };
  const err = give === get ? 'bad_trade' : validateCommand(state, cmd);
  const caps = getCaps(state);
  return (
    <div class="section market">
      <h4>{S.market.title}</h4>
      <div class="muted small">{S.market.hint}</div>
      <div class="statline small">
        <span>{S.market.ratio} <b>{d}:{n}</b></span>
        <span>{S.market.limit} <b>{fmtNum(limit)}</b></span>
      </div>
      <div class="trainrow">
        <label class="small">{S.market.give}
          <select value={give} onChange={(e) => { setGive((e.target as HTMLSelectElement).value as (typeof TRADE_RES)[number]); setMsg(''); }}>
            {TRADE_RES.map((r) => <option key={r} value={r}>{S.resources[r]} ({fmtNum(Math.floor(state.resources[r]))})</option>)}
          </select>
        </label>
        <label class="small">{S.market.get}
          <select value={get} onChange={(e) => { setGet((e.target as HTMLSelectElement).value as (typeof TRADE_RES)[number]); setMsg(''); }}>
            {TRADE_RES.map((r) => <option key={r} value={r}>{S.resources[r]} ({fmtNum(Math.floor(state.resources[r]))}/{fmtNum(caps[r])})</option>)}
          </select>
        </label>
      </div>
      <div class="trainrow">
        <label class="small">{S.market.amount}
          <input type="range" min={1} max={Math.max(1, Math.min(limit, Math.floor(state.resources[give])))} value={amt} onInput={(e) => setAmount(Number((e.target as HTMLInputElement).value))} />
        </label>
        <input class="num" type="number" min={1} max={limit} value={amt} onInput={(e) => setAmount(Math.max(1, Number((e.target as HTMLInputElement).value) || 1))} />
        <button class="btn small" onClick={() => setAmount(Math.min(limit, Math.floor(state.resources[give])))}>{S.building.max}</button>
      </div>
      <div class="trainrow">
        <span class="small">{S.market.youGet} <b>{fmtNum(got)}</b> {S.resources[get]}</span>
        <span class="small muted">{left > 0 ? `${S.market.cooldown} ${fmtTicks(left)}` : S.market.ready}</span>
        <button class="btn primary" disabled={!!err} onClick={() => { const code = client.dispatch(cmd); setMsg(code ? errText(code) : S.building.ok); }}>{S.market.trade}</button>
      </div>
      {err && err !== 'cooldown' && <div class="msg warn">{errText(err)}</div>}
      {msg && <div class="msg">{msg}</div>}
    </div>
  );
}

export function BuildingPanel({ id }: { id: string }): JSX.Element | null {
  const { client, state } = useGame();
  const [msg, setMsg] = useState('');
  const [confirm, setConfirm] = useState(false);
  useEffect(() => { setMsg(''); setConfirm(false); }, [id]);
  const b = state.city.buildings[id];
  if (!b) return null;
  const def = BUILDINGS[b.type];
  if (!def) return null;
  const job = state.city.queue.find((j) => j.building === id);
  const building = b.level < 1;
  const atMax = b.level >= def.maxLevel;
  const cur = effectRows(b.type, b.level);
  const nxt = atMax ? [] : effectRows(b.type, b.level + 1);
  const cost = atMax ? {} : buildingCost(b.type, b.level + 1);
  const upCmd: Command = { t: 'upgrade', building: id };
  const upErr = building || atMax ? null : validateCommand(state, upCmd);
  const send = (cmd: Command): void => { const code = client.dispatch(cmd); setMsg(code ? errText(code) : ''); };
  return (
    <div class="ctx-panel building-panel">
      <header class="panel-head">
        <Icon id={def.category} size={34} />
        <div class="grow"><h2>{def.name}</h2>
          <div class="muted small">{S.building.level} {Math.max(b.level, 0)}/{def.maxLevel}{building ? ` · ${S.building.underConstruction}` : ''}{b.damaged ? ` · ${S.building.damaged}` : ''}</div></div>
        <button class="btn small ghost" onClick={() => client.select(null)} aria-label={S.building.close}>x</button>
      </header>
      {job && job.startTick !== null && job.endTick !== null && <div class="section"><Bar value={state.tick - job.startTick} max={job.ticks} /><div class="small muted">{fmtTicks(job.endTick - state.tick)} {S.queues.eta}</div></div>}
      {cur.length > 0 && (
        <table class="fxtable small">
          <thead><tr><th /><th>{S.building.now}</th>{!atMax && <th>{S.building.next}</th>}</tr></thead>
          <tbody>
            {(nxt.length ? nxt : cur).map((n) => {
              const c = cur.find((x) => x.key === n.key);
              const diff = c ? n.value - c.value : n.value;
              return (
                <tr key={n.key}><td>{n.label}</td><td>{c ? `${fmtNum(c.value)}${c.suffix}` : '-'}</td>
                  {!atMax && <td><b>{fmtNum(n.value)}{n.suffix}</b> {diff !== 0 && <span class={diff > 0 ? 'pos' : 'neg'}>({diff > 0 ? '+' : ''}{fmtNum(diff)})</span>}</td>}</tr>
              );
            })}
          </tbody>
        </table>
      )}
      <BonusSection id={id} />
      {!building && !atMax && (
        <div class="section row">
          <div class="grow"><div class="small muted">{S.building.upgradeCost}</div><Cost cost={cost} have={state.resources} /> <span class="small muted">{fmtTicks(buildingTicks(b.type, b.level + 1))}</span></div>
          <button class="btn primary" disabled={!!upErr} onClick={() => send(upCmd)}>{S.building.upgrade} (U)</button>
        </div>
      )}
      {upErr && <div class="msg warn">{upErr === 'busy' ? S.building.upgrading : errText(upErr)}</div>}
      {atMax && <div class="msg">{S.building.maxLevel}</div>}
      {msg && <div class="msg warn">{msg}</div>}
      <TrainSection id={id} />
      <TradeSection id={id} />
      <MarketSection id={id} />
      <div class="section row actions">
        {job && <button class="btn small" onClick={() => send({ t: 'cancelBuild', building: id })}>{S.building.cancel}</button>}
        {b.damaged && <button class="btn small" onClick={() => send({ t: 'repair', building: id })}>{S.building.repair} <Cost cost={repairCost(state, id)} have={state.resources} /></button>}
        {b.type !== 'town_hall' && !building && !job && <button class="btn small" title={S.building.moveTip} onClick={() => client.startMove(id)}>{S.building.move}</button>}
        {b.type !== 'town_hall' && !building && (
          <button class={`btn small ${confirm ? 'danger' : ''}`} title={S.building.refund} onClick={() => { if (confirm) { send({ t: 'demolish', building: id }); client.select(null); } else setConfirm(true); }}>
            {confirm ? S.building.demolishConfirm : S.building.demolish}
          </button>
        )}
      </div>
    </div>
  );
}
