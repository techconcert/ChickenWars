import type { JSX } from 'preact';
import { BALANCE, BUILDING_LIST, BUILDINGS, buildingCost, buildingTicks, maxCountAt } from '@sim/data/registry';
import { countOfType, requiresError, townHallLevel } from '@sim/city/territory';
import { useGame } from '../hooks';
import { effectRows, fmtNum, fmtTicks } from '../format';
import { ui, useUI } from '../store';
import { S, errText } from '../strings';
import { Cost, Icon } from './Common';

const TABS = ['core', 'economy', 'military', 'support', 'defence'] as const;

export function BuildMenu(): JSX.Element {
  const { client, state } = useGame();
  const u = useUI();
  const th = townHallLevel(state);
  const list = BUILDING_LIST.filter((b) => b.category === u.buildTab && b.id !== 'town_hall');
  return (
    <div class="buildmenu" role="dialog" aria-label={S.build.title}>
      <div class="bm-head">
        <div class="tabs">
          {TABS.map((t) => (
            <button key={t} class={`tab ${u.buildTab === t ? 'on' : ''}`} onClick={() => ui.set({ buildTab: t })}><Icon id={t} size={22} />{S.build.tabs[t]}</button>
          ))}
        </div>
        <button class="btn small ghost" onClick={() => ui.set({ panel: null })} aria-label={S.build.close}>x</button>
      </div>
      <div class="cards">
        {list.map((b) => {
          const built = countOfType(state, b.id);
          const max = maxCountAt(b.id, th);
          let lock: string | null = null;
          if (b.unlockTH > th) lock = `${S.build.needsTH} ${b.unlockTH}`;
          else if (built >= max) lock = S.build.maxCount;
          else if (requiresError(state, b.id)) lock = errText('requires');
          const cost = buildingCost(b.id, 1);
          const afford = Object.entries(cost).every(([r, n]) => (state.resources[r as keyof typeof state.resources] ?? 0) >= (n ?? 0));
          return (
            <button key={b.id} class={`bcard ${lock ? 'locked' : ''} ${!lock && !afford ? 'poor' : ''}`} disabled={!!lock}
              onClick={() => { client.setPlacing(b.id); ui.set({ panel: null }); }}>
              <div class="bcard-top"><Icon id={b.category} size={30} /><div><div class="bname">{BUILDINGS[b.id]?.name}</div><div class="muted small">{S.build.count} {built}/{max}</div></div></div>
              <div class="bfx">{effectRows(b.id, 1).slice(0, 3).map((e) => <div key={e.key} class="small">{e.label} <b>{fmtNum(e.value)}{e.suffix}</b></div>)}</div>
              {BALANCE.proximity[b.id] && <div class="small hint">{S.build.nearHint(S.building.bonus[BALANCE.proximity[b.id]!.label] ?? '', BALANCE.proximity[b.id]!.max)}</div>}
              <div class="bcost"><Cost cost={cost} have={state.resources} /><span class="small muted">{fmtTicks(buildingTicks(b.id, 1))}</span></div>
              {lock && <div class="lockmsg">{lock}</div>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Banner while placing a building, with live validity from the renderer's hover event. */
export function PlacingBanner(): JSX.Element | null {
  const { client } = useGame();
  const u = useUI();
  if (!client.placing) return null;
  const h = u.hover;
  const def = BUILDINGS[client.placing];
  return (
    <div class="placing">
      <b>{client.moving ? S.build.moving : S.build.placing}: {def?.name}</b>
      <span class={`hint ${h && h.valid === false ? 'bad' : h?.valid ? 'good' : ''}`}>
        {h && h.valid === false ? errText(h.error) : h?.valid ? `${S.build.valid}${h.bonus ? `. ${S.build.adjacency} +${Math.round(h.bonus)}%` : ''}` : S.build.placeHint}
      </span>
      <button class="btn small" onClick={() => client.setPlacing(null)}>{S.queues.cancel}</button>
    </div>
  );
}
