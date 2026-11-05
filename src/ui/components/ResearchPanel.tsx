import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { RESEARCH, RESEARCH_LIST } from '@sim/data/registry';
import type { ResearchDef } from '@sim/data/schema';
import { academyLevel, researchError, researchSlots } from '@sim/systems/research';
import { act } from '../act';
import { effectText } from '../effects';
import { fmtTicks } from '../format';
import { useGame } from '../hooks';
import { ui } from '../store';
import { S, errText } from '../strings';
import { Cost, Modal, Tip } from './Common';

const BRANCHES = ['economy', 'military', 'defence', 'exploration'] as const;
type NodeState = 'done' | 'active' | 'available' | 'locked';
interface Line { x1: number; y1: number; x2: number; y2: number; on: boolean }

function stateOf(code: string | null, id: string, done: boolean, active: boolean): NodeState {
  if (done) return 'done';
  if (active) return 'active';
  void id;
  return code === 'requires' || code === 'flag' || code === 'academy_level' || code === 'no_academy' ? 'locked' : 'available';
}

function reasonText(code: string | null, def: ResearchDef, done: boolean): string {
  if (done || code === null) return '';
  if (code === 'academy_level') return `${S.research.needAcademy} ${def.academyLevel}`;
  if (code === 'requires') return `${S.research.needTech}: ${def.requires.filter(() => true).map((r) => RESEARCH[r]?.name ?? r).join(', ')}`;
  if (code === 'flag') return errText(code);
  if (code === 'no_academy') return S.research.noAcademy;
  if (code === 'no_slot') return S.research.noSlot;
  return errText(code);
}

function TechNode({ def, col, row }: { def: ResearchDef; col: number; row: number }): JSX.Element {
  const { client, state } = useGame();
  const done = state.research.done.includes(def.id);
  const act_ = state.research.active.find((a) => a.tech === def.id);
  const code = researchError(state, def.id);
  const st = stateOf(code, def.id, done, !!act_);
  const reason = reasonText(code, def, done || !!act_);
  const missing = def.requires.filter((r) => !state.research.done.includes(r)).map((r) => RESEARCH[r]?.name ?? r);
  const tip = (
    <div>
      <div class="tip-title">{def.name} <span class="muted">{S.research.tierLabel} {def.tier}</span></div>
      {def.effects.map((e, i) => <div key={i}>{effectText(e)}</div>)}
      <div class="tip-sum"><span>{S.research.cost}: </span><Cost cost={def.cost} have={state.resources} /></div>
      <div>{S.research.time}: {fmtTicks(def.ticks)} · {S.research.academy} {def.academyLevel}</div>
      {st === 'locked' && missing.length > 0 && <div class="neg">{S.research.needTech}: {missing.join(', ')}</div>}
      {reason && st !== 'locked' && st !== 'done' && st !== 'active' && <div class="neg">{reason}</div>}
      {st === 'locked' && code === 'academy_level' && <div class="neg">{reason}</div>}
    </div>
  );
  return (
    <Tip tip={tip} class={`${col >= 2 ? 'tip-right' : ''} ${row >= 2 ? 'tip-up' : ''}`}>
      <button class={`tech ${st}`} data-tech={def.id} disabled={st !== 'available' || code !== null}
        aria-label={`${def.name}: ${S.research.states[st]}`}
        onClick={() => act(client, { t: 'research', tech: def.id })}>
        <span class="techmark" aria-hidden="true" />
        <b>{def.name}</b>
        <span class="small techfx">{def.effects[0] ? effectText(def.effects[0]) : ''}</span>
        {st === 'active' && act_ && <span class="small">{fmtTicks(act_.endTick - state.tick)} {S.research.left}</span>}
        {st === 'available' && <span class="small"><Cost cost={def.cost} have={state.resources} /></span>}
        {(st === 'locked' || code === 'academy_level') && <span class="small neg techwhy">{reason}</span>}
      </button>
    </Tip>
  );
}

export function ResearchPanel(): JSX.Element {
  const { state } = useGame();
  const grid = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const lvl = academyLevel(state);
  const slots = researchSlots(state);
  useLayoutEffect(() => {
    const el = grid.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    const sc = box.width / (el.offsetWidth || 1);
    const pos = (id: string): DOMRect | null => el.querySelector(`[data-tech="${id}"]`)?.getBoundingClientRect() ?? null;
    const out: Line[] = [];
    for (const d of RESEARCH_LIST) {
      const b = pos(d.id);
      if (!b) continue;
      for (const r of d.requires) {
        const a = pos(r);
        if (!a) continue;
        out.push({
          x1: (a.left + a.width / 2 - box.left) / sc, y1: (a.bottom - box.top) / sc, x2: (b.left + b.width / 2 - box.left) / sc, y2: (b.top - box.top) / sc,
          on: state.research.done.includes(r),
        });
      }
    }
    const key = JSON.stringify(out.map((l) => [Math.round(l.x1), Math.round(l.y1), Math.round(l.x2), Math.round(l.y2), l.on]));
    if (key !== JSON.stringify(lines.map((l) => [Math.round(l.x1), Math.round(l.y1), Math.round(l.x2), Math.round(l.y2), l.on]))) setLines(out);
  });
  const close = (): void => ui.set({ panel: null });
  return (
    <Modal title={S.research.title} onClose={close} wide xl>
      <div class="row">
        <span class="muted small grow">{lvl > 0 ? `${S.research.academy} ${lvl} · ${S.research.slots} ${state.research.active.length}/${slots}` : S.research.noAcademy}</span>
        <span class="small muted">{S.research.hintClick}</span>
      </div>
      <div class="techgrid" ref={grid}>
        <svg class="techlines" aria-hidden="true">
          {lines.map((l, i) => {
            const my = (l.y1 + l.y2) / 2;
            return <path key={i} class={l.on ? 'on' : ''} d={`M${l.x1} ${l.y1} C${l.x1} ${my} ${l.x2} ${my} ${l.x2} ${l.y2}`} />;
          })}
        </svg>
        <div class="techcorner" />
        {BRANCHES.map((b) => <h3 key={b} class="techhead">{S.research.branches[b]}</h3>)}
        {[1, 2, 3, 4].flatMap((tier) => [
          <div class="techtier" key={`t${tier}`}><span>{S.research.tierLabel} {tier}</span></div>,
          ...BRANCHES.map((b, col) => (
            <div class="techrow" key={`${b}${tier}`}>
              {RESEARCH_LIST.filter((d) => d.branch === b && d.tier === tier && (!d.requiresFlag || (state.quests.counters[d.requiresFlag] ?? 0) >= 1) && (!d.effects.some((e) => e.kind === 'unlockBridges') || (state.world.bridges?.length ?? 0) > 0)).map((d) => <TechNode key={d.id} def={d} col={col} row={tier - 1} />)}
            </div>
          )),
        ])}
      </div>
      <div class="techlegend small muted">
        {(['done', 'active', 'available', 'locked'] as const).map((k) => <span key={k} class={`legend ${k}`}><i class={`techmark ${k}`} />{S.research.states[k]}</span>)}
      </div>
    </Modal>
  );
}
