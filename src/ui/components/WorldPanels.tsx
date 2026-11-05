import type { JSX } from 'preact';
import { HEROES, LORDS, TROOPS, WORLD } from '@sim/data/registry';
import { expectedLootValue, rewardLabel } from '@sim/combat/loot';
import { stacksPower, recordToStacks } from '@sim/combat/power';
import { battlePreview } from '@sim/combat/preview';
import { heroStats } from '@sim/heroStats';
import { townHallLevel } from '@sim/city/territory';
import { cellDistance, gridFor } from '@sim/nav';
import { cellsWithin } from '@sim/nav/hex';
import { MARCH_VISION } from '@sim/nav/constants';
import type { GameState, PoiState } from '@sim/state';
import { useGame } from '../hooks';
import { fmtTicks, fmtNum } from '../format';
import { bestAttackTroops, gatherTicksLeft, marchEta } from '../marchInfo';
import { ui } from '../store';
import { S, bossName } from '../strings';
import { BattleBrief } from './BattleBrief';
import { Bar, Icon } from './Common';

function Head({ icon, title, sub, onClose }: { icon: string; title: string; sub?: string; onClose: () => void }): JSX.Element {
  return (
    <header class="panel-head">
      <Icon id={icon} size={34} />
      <div class="grow"><h2>{title}</h2>{sub && <div class="muted small">{sub}</div>}</div>
      <button class="btn small ghost" onClick={onClose} aria-label={S.world.close}>x</button>
    </header>
  );
}

const fuzz = (n: number): string => { const step = n >= 40 ? 10 : 5; return `~${Math.max(step, Math.round(n / step) * step)}`; };

export function NodePanel({ id }: { id: string }): JSX.Element | null {
  const { client, state } = useGame();
  const n = state.world.nodes[id];
  if (!n) return null;
  const free = !n.gatherer && n.amount > 0 && n.respawnAt === null;
  return (
    <div class="ctx-panel">
      <Head icon={n.resource} title={S.world.nodeNames[n.type] ?? n.type} sub={`${S.world.tier} ${n.tier}`} onClose={() => client.select(null)} />
      <div class="section"><div class="small muted">{S.world.amount}: {fmtNum(n.amount)}/{fmtNum(n.maxAmount)}</div><Bar value={n.amount} max={n.maxAmount} /></div>
      {(() => {
        const gm = n.gatherer ? state.marches[n.gatherer] : undefined;
        if (!gm) return null;
        const left = gm.state === 'gathering' ? gatherTicksLeft(state, gm) : marchEta(state, gm);
        return <div class="small">{gm.state === 'gathering' ? S.world.collectDone : S.world.collectArrives}: <b>{fmtTicks(left)}</b></div>;
      })()}
      <div class="small">{S.world.gatherer}: {n.gatherer ? S.world.taken : n.respawnAt !== null ? S.world.respawn : n.blockedUntil > state.tick ? S.world.blocked : S.world.free}</div>
      <div class="section row actions">
        <button class="btn primary" disabled={!free} onClick={() => ui.set({ marchReq: { kind: 'gather', target: { node: id }, cell: n.cell, label: S.world.nodeNames[n.type] ?? n.type } })}>{S.world.gather}</button>
      </div>
    </div>
  );
}

/** The army we would actually send: the hero with the biggest lead, filled by `bestAttackTroops` (so power and win chance are comparable to the enemy's). */
function bestArmy(state: GameState, poi: string): { hero: string; troops: Record<string, number>; power: number } | null {
  const heroes = Object.values(state.heroes).filter((h) => !h.march);
  const hero = [...heroes].sort((a, b) => heroStats(state, b.id).lead - heroStats(state, a.id).lead)[0];
  if (!hero) return null;
  const ids = Object.values(TROOPS).filter((t) => t.role !== 'trader' && (state.troops[t.id]?.healthy ?? 0) > 0).map((t) => t.id);
  const troops = bestAttackTroops(state, poi, hero.id, ids, (id) => state.troops[id]?.healthy ?? 0, heroStats(state, hero.id).lead);
  if (!Object.keys(troops).length) return null;
  return { hero: hero.id, troops, power: stacksPower(recordToStacks(troops)) };
}

function poiTitle(p: PoiState): string {
  if (p.kind === 'boss') return bossName(p.bossId) ?? S.world.poiNames.boss ?? 'Boss';
  if (p.kind === 'bandit_camp') return S.world.campNames[Math.max(0, Math.min(4, p.tier - 1))] ?? 'Human farm';
  return S.world.poiNames[p.kind] ?? p.kind;
}

export function PoiPanel({ id }: { id: string }): JSX.Element | null {
  const { client, state } = useGame();
  const p = state.world.pois[id];
  if (!p) return null;
  const fight = p.kind === 'bandit_camp' || p.kind === 'lair' || p.kind === 'boss';
  const th = townHallLevel(state);
  const delta = p.level - th;
  const label = fight ? rewardLabel(p, th) : null;
  const total = p.troops.reduce((a, s) => a + s.count, 0);
  const g = gridFor(state.world.radius);
  const lord = p.lordId ? state.lords[p.lordId] : undefined;
  const lordDef = lord ? LORDS[lord.id] : undefined;
  const scoutable = (p.kind === 'ruin' || p.kind === 'cache' || p.kind === 'shrine') && p.active && !p.explored;
  const army = fight ? bestArmy(state, id) : null;
  const theirPower = fight ? battlePreview(state, null, id)?.enemyPower ?? p.strength : 0;
  return (
    <div class="ctx-panel">
      <Head icon={fight ? 'skull' : p.kind === 'village' ? 'gift' : 'quest'} title={poiTitle(p)} sub={`${S.world.tier} ${p.tier}${fight ? ` · ${S.world.level} ${p.level}` : ''} · ${cellDistance(g, state.world.capitalCell, p.cell)} tiles`} onClose={() => client.select(null)} />
      {fight && (
        <>
          <div class="statline small">
            <span>{S.world.theirPower} <b>{fmtNum(Math.round(theirPower))}</b></span>
            <span>{S.world.yourPower} <b>{fmtNum(Math.round(army?.power ?? 0))}</b></span>
            <span>{S.world.troops} <b>{fuzz(total)}</b></span>
          </div>
          <div class={`reward ${label}`}>
            <b>{S.world.reward}:</b> {delta > 0 ? S.world.harder : delta < 0 ? S.world.easier : S.world.even}: {S.world[label ?? 'fair']}
            <span class="muted small"> ({Math.round(expectedLootValue(p, th))})</span>
          </div>
          <BattleBrief poi={id} draft={army ? { hero: army.hero, troops: army.troops } : null} />
          <div class="section row actions">
            <button class="btn primary danger" disabled={!p.active} onClick={() => ui.set({ marchReq: { kind: 'attack', target: { poi: id }, cell: p.cell, label: poiTitle(p) } })}>{S.world.attack}</button>
            {Object.keys(state.lords).length > 0 && <button class="btn" disabled={!p.active} onClick={() => ui.set({ panel: 'diplomacy' })} title={S.diplomacy.rallyHint}>{S.world.rally}</button>}
          </div>
        </>
      )}
      {(p.kind === 'ruin' || p.kind === 'cache' || p.kind === 'shrine') && (
        <div class="section row actions">
          <span class="small muted grow">{p.explored ? S.world.explored : S.world.unexplored}</span>
          <button class="btn primary" disabled={!scoutable} onClick={() => ui.set({ marchReq: { kind: 'scout', target: { poi: id }, cell: p.cell, label: poiTitle(p) } })}>{S.world.scout}</button>
        </div>
      )}
      {p.kind === 'village' && (
        <div class="section">
          <div>{S.world.lord}: <b>{lordDef?.name ?? '?'}</b>{lord && <span class="muted"> · {S.world.rep} {lord.rep}</span>}</div>
          <div class="section row actions"><button class="btn primary" disabled={!lord} onClick={() => ui.openLord(lord?.id ?? null)}>{S.world.gift}</button></div>
        </div>
      )}
    </div>
  );
}

export function MarchPanel({ id }: { id: string }): JSX.Element | null {
  const { client, state } = useGame();
  const m = state.marches[id];
  if (!m) return null;
  const eta = marchEta(state, m);
  const n = Object.keys(m.troops).reduce((a, t) => a + (m.troops[t] ?? 0), 0);
  return (
    <div class="ctx-panel">
      <Head icon={`march_${m.kind === 'garrison' || m.kind === 'rally' ? 'reinforce' : m.kind}`} title={`${S.marches.kind[m.kind]}: ${HEROES[m.hero]?.name ?? m.hero}`} sub={`${n} ${S.marches.troops} · ${S.marches.phase[m.state]}${eta ? ` · ${fmtTicks(eta)}` : ''}`} onClose={() => client.select(null)} />
      <div class="statline small">{Object.keys(m.troops).map((t) => <span key={t}>{TROOPS[t]?.name ?? t} <b>{m.troops[t]}</b></span>)}</div>
      <div class="section row actions">
        {m.state !== 'returning' && m.state !== 'fighting' && <button class="btn" onClick={() => client.dispatch({ t: 'recall', march: id })}>{S.marches.recall}</button>}
      </div>
    </div>
  );
}

export function CellPanel({ id }: { id: string }): JSX.Element | null {
  const { client, state } = useGame();
  const cell = Number(id);
  const w = state.world;
  if (!Number.isInteger(cell) || cell < 0 || cell >= w.regionOf.length) return null;
  const reg = w.regions[w.regionOf[cell] ?? -1];
  // offered only when unexplored land lies within the least a scouting party reveals (any march sees MARCH_VISION cells)
  const unexplored = cellsWithin(gridFor(w.radius), cell, MARCH_VISION).some((c) => (w.fog[c] ?? 0) === 0 && (w.navCost[c] ?? 0) > 0);
  return (
    <div class="ctx-panel">
      <Head icon="march_scout" title={S.world.cell} sub={`${S.world.fog[w.fog[cell] ?? 0]}${reg ? ` · ${S.world.region} ${reg.id}, ${S.world.tier} ${reg.dangerTier}` : ''}${reg && !reg.unlocked ? ` · ${S.world.closed(WORLD.regionTiers.find((t) => t.tier === reg.dangerTier)?.unlockCityLevel ?? 0)}` : ''} · ${S.world.biomes[w.biome[cell] ?? 0] ?? ''}`} onClose={() => client.select(null)} />
      <div class="section row actions">
        <div class="small muted grow">{unexplored ? S.world.scoutHint : S.world.scoutDone}</div>
        {unexplored && <button class="btn primary" disabled={(w.navCost[cell] ?? 0) <= 0} onClick={() => ui.set({ marchReq: { kind: 'scout', target: { cell }, cell, label: S.world.cell } })}>{S.world.scoutHere}</button>}
      </div>
    </div>
  );
}

