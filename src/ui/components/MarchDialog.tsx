import { useMemo, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { HEROES, TROOPS } from '@sim/data/registry';
import { heroStats } from '@sim/heroStats';
import { carryCap } from '@sim/nav/marchCore';
import { useGame } from '../hooks';
import { fmtTicks } from '../format';
import { bestAttackTroops, estimateGather, estimateTravel, slotsInfo } from '../marchInfo';
import { ui, useUI } from '../store';
import { S, errText } from '../strings';
import { BattleBrief } from './BattleBrief';
import { Icon, Modal } from './Common';

const CLASS_ORDER = ['infantry', 'archer', 'cavalry', 'siege'];

export function MarchDialog(): JSX.Element | null {
  const { client, state } = useGame();
  const u = useUI();
  const req = u.marchReq;
  const free = Object.values(state.heroes).filter((h) => !h.march);
  const [hero, setHero] = useState<string | null>(null);
  const [troops, setTroops] = useState<Record<string, number> | null>(null);
  const [err, setErr] = useState('');
  const heroId = hero && free.some((h) => h.id === hero) ? hero : [...free].sort((a, b) => heroStats(state, b.id).lead - heroStats(state, a.id).lead)[0]?.id ?? null;
  const lead = heroId ? heroStats(state, heroId).lead : 0;
  const avail = useMemo(() => Object.values(TROOPS).filter((t) => t.role !== 'trader' && (state.troops[t.id]?.healthy ?? 0) > 0)
    .sort((a, b) => CLASS_ORDER.indexOf(a.class) - CLASS_ORDER.indexOf(b.class) || a.tier - b.tier), [state.tick]);
  const haveSig = avail.map((t) => `${t.id}:${state.troops[t.id]?.healthy ?? 0}`).join(',');
  // the counter-aware army is expensive (battle previews), so only recompute when its inputs change
  const campArmy = useMemo(() => {
    if (!req || (req.kind !== 'attack' && req.kind !== 'rally') || !req.target.poi || !heroId) return null;
    return bestAttackTroops(state, req.target.poi, heroId, avail.map((t) => t.id), (id) => state.troops[id]?.healthy ?? 0, lead);
  }, [req?.kind, req?.target.poi, heroId, lead, haveSig]);
  if (!req) return null;
  const close = (): void => { ui.set({ marchReq: null }); setTroops(null); setErr(''); };
  const haveOf = (id: string): number => state.troops[id]?.healthy ?? 0;
  const fillFor = (all: boolean): Record<string, number> => {
    // attacks on camps, lairs and bosses: the classes that counter the enemy (see bestAttackTroops)
    if (campArmy) return campArmy;
    return defaultTroops(req.kind, avail.map((t) => t.id), haveOf, lead, all);
  };
  const sel = troops ?? fillFor(false);
  const total = Object.values(sel).reduce((a, b) => a + b, 0);
  const eta = heroId && req.cell >= 0 ? estimateTravel(state, heroId, sel, req.cell) : null;
  const slots = slotsInfo(state);
  const setN = (id: string, v: number): void => {
    const others = total - (sel[id] ?? 0);
    const max = Math.min(state.troops[id]?.healthy ?? 0, Math.max(0, lead - others));
    setTroops({ ...sel, [id]: Math.max(0, Math.min(max, Math.floor(v))) });
  };
  const send = (): void => {
    if (!heroId) return;
    const t: Record<string, number> = {};
    for (const k of Object.keys(sel)) if ((sel[k] ?? 0) > 0) t[k] = sel[k]!;
    const code = req.kind === 'rally' && req.target.poi
      ? client.dispatch({ t: 'startRally', hero: heroId, troops: t, target: req.target.poi })
      : client.dispatch({ t: 'march', hero: heroId, troops: t, target: req.target, kind: req.kind });
    if (code) setErr(errText(code)); else { close(); }
  };
  return (
    <Modal title={`${S.march.title[req.kind] ?? S.marches.kind[req.kind]}: ${req.label}`} onClose={close}>
      <div class="section">
        <h4>{S.march.hero}</h4>
        {free.length === 0 ? <p class="muted">{S.march.noHero}</p> : (
          <div class="herorow">
            {free.map((h) => (
              <button key={h.id} class={`tcard ${heroId === h.id ? 'on' : ''}`} onClick={() => { setHero(h.id); setTroops(null); }}>
                <Icon id="hero" size={26} /><div><b>{HEROES[h.id]?.name ?? h.id}</b><div class="muted small">L{h.level} · {S.march.lead} {heroStats(state, h.id).lead}</div></div>
              </button>
            ))}
          </div>
        )}
      </div>
      <div class="section">
        <h4>{S.march.troops} <span class="muted small">{total}/{lead}</span></h4>
        {avail.length === 0 && <p class="muted">{S.army.none}</p>}
        {avail.map((t) => {
          const have = state.troops[t.id]?.healthy ?? 0;
          const v = sel[t.id] ?? 0;
          const max = Math.min(have, Math.max(0, lead - (total - v)));
          return (
            <div class="troopslider" key={t.id}>
              <Icon id={t.class} size={24} /><span class="tname">{t.name} <span class="muted small">/{have}</span></span>
              <input type="range" min={0} max={Math.max(0, max)} value={v} onInput={(e) => setN(t.id, Number((e.target as HTMLInputElement).value))} />
              <input class="num" type="number" min={0} max={max} value={v} onInput={(e) => setN(t.id, Number((e.target as HTMLInputElement).value) || 0)} />
            </div>
          );
        })}
        <div class="row actions">
          <button class="btn small" onClick={() => setTroops(fillFor(true))}>{S.march.all}</button>
          <button class="btn small" onClick={() => setTroops({})}>{S.march.none}</button>
        </div>
      </div>
      <div class="statline small">
        <span>{S.march.eta} <b>{eta === null ? '?' : fmtTicks(eta)}</b> ({S.march.roundTrip})</span>
        <span>{S.march.slots} <b>{slots.used}/{slots.max}</b></span>
        {req.kind === 'gather' && <span>{S.march.carry} <b>{carryCap(sel)}</b></span>}
        {req.kind === 'gather' && req.target.node && heroId && (() => { const g = estimateGather(state, heroId, sel, req.target.node!); return <span>{S.march.collect} <b>{g === null ? '?' : fmtTicks(g)}</b></span>; })()}
      </div>
      {(req.kind === 'attack' || req.kind === 'rally') && req.target.poi && <BattleBrief poi={req.target.poi} draft={heroId ? { hero: heroId, troops: sel } : null} />}
      {req.kind === 'scout' && <p class="muted small">{req.target.auto ? S.march.randomHint : S.march.scoutHint}</p>}
      {err && <div class="msg warn">{err}</div>}
      <div class="row actions end">
        <button class="btn" onClick={close}>{S.march.cancel}</button>
        <button class="btn primary" disabled={!heroId || total < 1} onClick={send}>{S.march.send}</button>
      </div>
    </Modal>
  );
}

/** Greedy default: gatherers prefer high gather rate; attacks fill from infantry up. */
function defaultTroops(kind: string, ids: string[], have: (id: string) => number, lead: number, all = false): Record<string, number> {
  const order = kind === 'gather' ? [...ids].sort((a, b) => (TROOPS[b]?.gatherRate ?? 0) - (TROOPS[a]?.gatherRate ?? 0)) : ids;
  const out: Record<string, number> = {};
  let room = kind === 'scout' && !all ? Math.min(lead, 6) : lead;
  if (kind === 'scout') order.sort((a, b) => (TROOPS[b]?.class === 'cavalry' ? 1 : 0) - (TROOPS[a]?.class === 'cavalry' ? 1 : 0));
  for (const id of order) {
    const n = Math.min(have(id), room);
    if (n > 0) { out[id] = n; room -= n; }
  }
  return out;
}
