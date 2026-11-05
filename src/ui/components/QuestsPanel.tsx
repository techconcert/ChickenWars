import type { JSX } from 'preact';
import { QUESTS, QUEST_LIST } from '@sim/data/registry';
import { activeQuests } from '@sim/quests';
import type { QuestView } from '@sim/quests';
import { reignProgress } from '@sim/progression';
import { DAY_TICKS } from '@sim/constants';
import { useCollapsed, useGame } from '../hooks';
import { costEntries } from '../format';
import { ui, useUI } from '../store';
import { S } from '../strings';
import { Bar, CollapseBtn, Icon, Modal } from './Common';

function Steps({ q }: { q: QuestView }): JSX.Element {
  return (
    <ul class="steps">
      {q.steps.map((s, i) => (
        <li key={i} class={s.done ? 'done' : ''}>
          <span class="stepmark" aria-hidden="true">{s.done ? 'v' : 'o'}</span>
          <span class="grow">{s.label}</span>
          <span class="small muted">{Math.min(s.have, s.need)}/{s.need}</span>
        </li>
      ))}
    </ul>
  );
}

function Rewards({ id }: { id: string }): JSX.Element | null {
  const r = QUESTS[id]?.rewards;
  if (!r) return null;
  const res = costEntries(r.resources ?? {});
  if (!res.length && !r.item && !r.hero && !r.xp && !r.troops) return null;
  return (
    <div class="small muted">
      {S.world.reward}: {res.map(([k, n]) => <span key={k} class="costchip"><Icon id={k} size={14} />{n}</span>)}
      {r.xp ? ` +${r.xp} XP` : ''}
    </div>
  );
}

export function QuestTracker(): JSX.Element | null {
  const { state } = useGame();
  const [folded, toggleFold] = useCollapsed('tracker');
  const list = activeQuests(state);
  if (!list.length) return null;
  const main = list[0]!;
  return (
    <section class="side-card tracker">
      <div class="panelhead">
        <button class="trackerhead" onClick={() => ui.openPanel('quests')} title={S.quests.title}>
          <Icon id="quest" size={24} /><b class="grow">{main.title}</b>
        </button>
        <CollapseBtn collapsed={folded} onToggle={toggleFold} label={folded ? S.panel.expand : S.panel.collapse} />
      </div>
      {!folded && main.steps.map((s, i) => (
        <div class={`trackstep ${s.done ? 'done' : ''}`} key={i}>
          <span class="small grow">{s.label}</span><span class="small muted">{Math.min(s.have, s.need)}/{s.need}</span>
          <Bar value={s.have} max={s.need} />
        </div>
      ))}
      {!folded && list.length > 1 && <div class="small muted">+{list.length - 1} {S.quests.side.toLowerCase()}</div>}
    </section>
  );
}

export function QuestsPanel(): JSX.Element {
  const { state } = useGame();
  const u = useUI();
  const tab = u.questTab;
  const list = activeQuests(state);
  const rp = reignProgress(state);
  const done = state.quests.completed.map((id) => QUEST_LIST.find((q) => q.id === id)).filter((q) => !!q);
  const chron = [...state.chronicle].reverse();
  return (
    <Modal title={S.quests.title} onClose={() => ui.set({ panel: null })} wide>
      <div class="tabs" role="tablist">
        {(['quests', 'reign', 'chronicle'] as const).map((t) => <button key={t} role="tab" aria-selected={tab === t} class={`tab ${tab === t ? 'on' : ''}`} onClick={() => ui.set({ questTab: t })}>{S.quests.tabs[t]}</button>)}
      </div>
      {tab === 'quests' && (
        <div class="section">
          {list.length === 0 && <p class="muted">{S.quests.none}</p>}
          {list.map((q) => (
            <div class="questcard" key={q.id}>
              <h3 class="questtitle">{q.bounty ? `${S.quests.bounty}: ` : q.side ? `${S.quests.side}: ` : ''}{q.title}{q.bounty && q.daysLeft !== undefined && <span class="small muted"> · {q.daysLeft} {S.quests.daysLeft}</span>}</h3>
              <p class="small">{q.text}</p>
              <Steps q={q} />
              <Rewards id={q.id} />
            </div>
          ))}
          {(state.quests.board?.done ?? 0) > 0 && <div class="small muted">{S.quests.bountiesDone}: {state.quests.board!.done}</div>}
          {done.length > 0 && <h4>{S.quests.done} ({done.length})</h4>}
          <div class="small muted donelist">{done.map((q) => <span key={q!.id} class="pill ok">{q!.title}</span>)}</div>
        </div>
      )}
      {tab === 'reign' && (
        <div class="section">
          <h3>{S.quests.reign}</h3>
          <p>{S.quests.reignText}</p>
          <div class="statrow"><span>{S.quests.boss} (T{rp.bossTier})</span><b class={rp.bossDefeated ? 'pos' : ''}>{rp.bossDefeated ? S.quests.yes : S.quests.no}</b></div>
          <div class="statrow"><span>{S.quests.th}</span><b>{rp.thLevel}/{rp.thNeeded}</b></div>
          <Bar value={rp.thLevel} max={rp.thNeeded} />
          {state.flags.won && <p class="pos"><b>{S.quests.won}</b></p>}
        </div>
      )}
      {tab === 'chronicle' && (
        <div class="section chronicle">
          {chron.length === 0 && <p class="muted">{S.quests.empty}</p>}
          {chron.map((c, i) => <div class="chrow" key={i}><span class="small muted chday">{S.quests.day} {Math.floor(c.tick / DAY_TICKS) + 1}</span><span class="grow">{c.text}</span></div>)}
        </div>
      )}
    </Modal>
  );
}
