import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { EVENTS, EVENT_LIST } from '@sim/data/registry';
import { act, why } from '../act';
import { costEntries, fmtTicks } from '../format';
import { useGame } from '../hooks';
import { S } from '../strings';
import { Icon } from './Common';

type WorldEventDef = (typeof EVENT_LIST)[number];
type Option = WorldEventDef['options'][number];
type Effect = Option['effect'][number];

function ResList({ res }: { res: Record<string, number> }): JSX.Element {
  return <>{costEntries(res).map(([k, n]) => <span key={k} class="costchip"><Icon id={k} size={16} />{n}</span>)}</>;
}

function EffectLine({ e }: { e: Effect }): JSX.Element | null {
  switch (e.kind) {
    case 'trade': return <div class="small">{S.event.give}: <ResList res={e.give} /> {S.event.get}: <ResList res={e.get} /></div>;
    case 'spawnCamp': return <div class="small">{S.event.spawnCamp(e.tier)}</div>;
    case 'blockNode': return <div class="small">{S.event.blockNode(S.world.nodeNames[e.type] ?? e.type, fmtTicks(e.ticks))}</div>;
    case 'gamble': return <div class="small">{S.event.gamble(e.chance)}: {S.event.winLabel} <ResList res={e.win} /> {S.event.loseLabel} <ResList res={e.lose} /></div>;
    case 'buff': return <div class="small">{S.event.buff(S.effects.buffStats[e.stat] ?? e.stat, e.pct, fmtTicks(e.ticks))}</div>;
    case 'cost': {
      const { kind: _k, ...rest } = e as Record<string, unknown> & { kind: string };
      void _k;
      return <div class="small">{S.event.cost}: <ResList res={rest as Record<string, number>} /></div>;
    }
    default: return null;
  }
}

const COLLAPSE_KEY = 'hl-event-collapsed';
function readCollapsed(): boolean {
  try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; }
}

/** Random event: a slim strip under the top bar while state.pendingEvent is set; collapses to one line so it never blocks play. Choosing dispatches eventChoice. */
export function EventCard(): JSX.Element | null {
  const { client, state } = useGame();
  const [collapsed, setCollapsed] = useState(readCollapsed());
  const pe = state.pendingEvent;
  const ev = pe ? EVENTS[pe.id] : undefined;
  if (!pe || !ev) return null;
  const toggle = (): void => {
    const v = !collapsed;
    setCollapsed(v);
    try { localStorage.setItem(COLLAPSE_KEY, v ? '1' : '0'); } catch { /* storage unavailable */ }
  };
  return (
    <section class="event-card" role="region" aria-label={ev.title}>
      <div class="evline">
        <Icon id="quest" size={22} />
        <b class="grow">{ev.title}</b>
        <span class="small muted">{S.event.expires} {fmtTicks(Math.max(0, pe.expiresAt - state.tick))}</span>
        <button class="qtoggle" onClick={toggle} aria-expanded={!collapsed} aria-label={collapsed ? S.event.expand : S.event.collapse} title={collapsed ? S.event.expand : S.event.collapse}>{collapsed ? 'v' : '^'}</button>
      </div>
      {!collapsed && ev.text && <div class="small muted evtext">{ev.text}</div>}
      {!collapsed && (
        <div class="evopts">
          {ev.options.map((o, i) => {
            const reason = why(state, { t: 'eventChoice', option: i });
            return (
              <div class="eventopt" key={i}>
                <div class="grow">
                  <b>{o.label}</b>
                  {o.effect.length === 0 ? <div class="small muted">{S.event.nothing}</div> : o.effect.map((e, j) => <EffectLine key={j} e={e} />)}
                  {reason && <div class="small neg">{reason}</div>}
                </div>
                <button class="btn primary small" disabled={reason !== ''} onClick={() => act(client, { t: 'eventChoice', option: i })}>{S.event.choose}</button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
