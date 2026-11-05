import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { BUILDINGS, RESEARCH, TROOPS } from '@sim/data/registry';
import { getBuilders, maxQueueLength } from '@sim/city/territory';
import { useCollapsed, useGame } from '../hooks';
import { fmtTicks } from '../format';
import { S } from '../strings';
import { Bar, CollapseBtn, Icon } from './Common';

export function Queues(): JSX.Element | null {
  const { client, state } = useGame();
  const [dragId, setDragId] = useState<string | null>(null);
  const [folded, toggleFold] = useCollapsed('queues');
  const q = state.city.queue;
  const waiting = q.filter((j) => j.startTick === null);
  const drop = (targetId: string): void => {
    if (!dragId || dragId === targetId) { setDragId(null); return; }
    const to = waiting.findIndex((j) => j.id === targetId);
    if (to >= 0) client.dispatch({ t: 'reorderBuild', job: dragId, to });
    setDragId(null);
  };
  const builders = getBuilders(state);
  const busy = q.filter((j) => j.startTick !== null).length;
  const rs = state.research.active;
  if (!q.length && !state.training.length && !rs.length) {
    return <section class="side-card"><h3 class="panelhead"><Icon id="queue" size={22} /><span class="grow">{S.queues.builders} <span class="muted">{busy}/{builders}</span></span><CollapseBtn collapsed={folded} onToggle={toggleFold} label={folded ? S.panel.expand : S.panel.collapse} /></h3>{!folded && <p class="muted small">{S.queues.empty}</p>}</section>;
  }
  return (
    <section class="side-card">
      <h3 class="panelhead"><Icon id="queue" size={22} /><span class="grow">{S.queues.builders} <span class="muted">{busy}/{builders}</span> <span class="muted small" title={S.queues.limit}>{S.queues.queued} {q.length}/{maxQueueLength(state)}</span></span><CollapseBtn collapsed={folded} onToggle={toggleFold} label={folded ? S.panel.expand : S.panel.collapse} /></h3>
      {!folded && <>
      {waiting.length > 1 && <div class="muted small">{S.queues.dragHint}</div>}
      {q.map((j) => {
        const b = state.city.buildings[j.building];
        const def = b ? BUILDINGS[b.type] : undefined;
        const started = j.startTick !== null && j.endTick !== null;
        const left = started ? (j.endTick as number) - state.tick : j.ticks;
        return (
          <div class={`qrow ${!started ? 'draggable' : ''} ${dragId === j.id ? 'dragging' : ''}`} key={j.id}
            draggable={!started} onDragStart={(e) => { if (started) return; setDragId(j.id); e.dataTransfer?.setData('text/plain', j.id); }}
            onDragOver={(e) => { if (!started && dragId) e.preventDefault(); }} onDrop={(e) => { e.preventDefault(); if (!started) drop(j.id); }} onDragEnd={() => setDragId(null)}>
            {!started && <span class="grip" aria-hidden="true">::</span>}
            <Icon id={def?.category ?? 'core'} size={26} />
            <div class="qmain">
              <div class="qtitle">{def?.name ?? '?'} <span class="muted">{S.queues.upgradeTo} {j.targetLevel}</span></div>
              {started ? <Bar value={j.ticks - left} max={j.ticks} /> : <div class="muted small">{S.queues.waiting}</div>}
            </div>
            <span class="qeta">{started ? fmtTicks(left) : ''}</span>
            <button class="btn small ghost" title={S.queues.cancel} aria-label={S.queues.cancel} onClick={() => client.dispatch({ t: 'cancelBuild', building: j.building })}>x</button>
          </div>
        );
      })}
      {state.training.length > 0 && <h3>{S.queues.training}</h3>}
      {state.training.map((j) => {
        const def = TROOPS[j.troop];
        const started = j.startTick !== null && j.endTick !== null;
        const total = started ? (j.endTick as number) - (j.startTick as number) : 1;
        const left = started ? (j.endTick as number) - state.tick : 0;
        return (
          <div class="qrow" key={j.id}>
            <Icon id={def?.class ?? 'infantry'} size={26} />
            <div class="qmain">
              <div class="qtitle">{j.count} {def?.name ?? j.troop}</div>
              {started ? <Bar value={total - left} max={total} cls="train" /> : <div class="muted small">{S.queues.waiting}</div>}
            </div>
            <span class="qeta">{started ? fmtTicks(left) : ''}</span>
            <button class="btn small ghost" title={S.queues.cancel} aria-label={S.queues.cancel} onClick={() => client.dispatch({ t: 'cancelTrain', job: j.id })}>x</button>
          </div>
        );
      })}
      {rs.length > 0 && <h3>{S.queues.research}</h3>}
      {rs.map((a) => {
        const def = RESEARCH[a.tech];
        const total = def?.ticks ?? 1;
        const left = Math.max(0, a.endTick - state.tick);
        return (
          <div class="qrow" key={a.tech}>
            <Icon id="research" size={26} />
            <div class="qmain">
              <div class="qtitle">{def?.name ?? a.tech}</div>
              <Bar value={total - left} max={total} cls="research" />
            </div>
            <span class="qeta">{fmtTicks(left)}</span>
          </div>
        );
      })}
      </>}
    </section>
  );
}
