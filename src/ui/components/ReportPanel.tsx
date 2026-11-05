import type { JSX } from 'preact';
import { ITEMS, TROOPS, SKILLS } from '@sim/data/registry';
import type { BattleReport } from '@sim/state';
import { useGame } from '../hooks';
import { costEntries } from '../format';
import { ui, useUI } from '../store';
import { S } from '../strings';
import { Icon, Modal } from './Common';

function Side({ title, losses, wounded, win }: { title: string; losses: Record<string, number>; wounded?: Record<string, number>; win: boolean }): JSX.Element {
  const ids = Object.keys(losses).sort();
  const dead = (id: string): number => Math.max(0, (losses[id] ?? 0) - (wounded?.[id] ?? 0));
  return (
    <div class={`side ${win ? 'win' : 'lose'}`}>
      <h4>{title}</h4>
      {ids.length === 0 && <div class="muted small">{S.report.none}</div>}
      {ids.map((id) => (
        <div class="small" key={id}><Icon id={TROOPS[id]?.class ?? 'infantry'} size={18} /> {TROOPS[id]?.name ?? id}: {S.report.losses} <b>{dead(id)}</b>{wounded ? <>, {S.report.wounded} <b>{wounded[id] ?? 0}</b></> : null}</div>
      ))}
    </div>
  );
}

function RoundBars({ r }: { r: BattleReport }): JSX.Element {
  const max = Math.max(1, ...r.rounds.map((x) => Math.max(x.damageA, x.damageB)));
  return (
    <div class="rounds">
      {r.rounds.map((x) => (
        <div class="round" key={x.n} title={`${S.report.round} ${x.n}: ${S.report.dealt} ${x.damageA} / ${S.report.taken} ${x.damageB}`}>
          <div class="rbar a" style={{ height: `${(x.damageA / max) * 100}%` }} />
          <div class="rbar b" style={{ height: `${(x.damageB / max) * 100}%` }} />
          <span class="small muted">{x.n}</span>
        </div>
      ))}
    </div>
  );
}

export function ReportPanel(): JSX.Element {
  const { state } = useGame();
  const u = useUI();
  const list = state.reports;
  const idx = Math.max(0, list.findIndex((r) => r.id === u.reportId));
  const r = list.length ? (list.find((x) => x.id === u.reportId) ?? list[list.length - 1]) : undefined;
  const close = (): void => ui.set({ panel: null });
  if (!r) return <Modal title={S.report.title} onClose={close}><p class="muted">{S.report.noReports}</p></Modal>;
  const defended = r.kind === 'raid' || r.kind === 'ambush';
  const win = defended ? r.winner === 'defender' : r.winner === 'attacker';
  const title = r.kind === 'raid' ? `${S.report.title}: ${S.raid.title}` : r.kind === 'ambush' ? `${S.report.title}: ${S.raid.ambushTitle}` : S.report.title;
  const loot = costEntries(r.loot);
  const go = (d: number): void => { const n = list[idx + d]; if (n) ui.set({ reportId: n.id }); };
  return (
    <Modal title={title} onClose={close} wide>
      <div class={`verdict ${win ? 'win' : 'lose'}`}>{r.kind === 'raid' ? (win ? S.raid.raidWon : S.raid.raidLost) : r.kind === 'ambush' ? (win ? S.raid.ambushWon : S.raid.ambushLost) : win ? S.report.victory : S.report.defeat}</div>
      <div class="vs"><b>{r.attackerName}</b> <span class="muted">vs</span> <b>{r.defenderName}</b></div>
      <div class="cols">
        <Side title={`${S.report.attacker}`} losses={r.casualtiesA} wounded={r.woundedA} win={r.winner === 'attacker'} />
        <Side title={`${S.report.defender}`} losses={r.casualtiesB} wounded={r.woundedB} win={r.winner === 'defender'} />
      </div>
      <div class="section"><h4>{S.report.rounds} ({r.rounds.length})</h4><RoundBars r={r} /></div>
      {r.rageEvents.length > 0 && (
        <div class="section"><h4>{S.report.rage}</h4>
          {r.rageEvents.map((e, i) => <div class="small" key={i}>{S.report.round} {e.round}: {e.side === 'A' ? S.report.attacker : S.report.defender} <b>{SKILLS[e.skill]?.name ?? (e.skill === 'boss_enrage' ? S.report.enrage : e.skill)}</b></div>)}
        </div>
      )}
      {r.damaged && r.damaged.length > 0 && <div class="section"><h4>{S.raid.damaged}</h4><div class="small">{r.damaged.map((d) => state.city.buildings[d]?.type.replace(/_/g, ' ') ?? d).join(', ')}</div></div>}
      <div class="section"><h4>{r.kind === 'raid' ? S.raid.stolen : S.report.loot}</h4>
        {loot.length === 0 && r.items.length === 0 ? <div class="muted small">{S.report.none}</div> : (
          <div class="lootrow">
            {loot.map(([res, n]) => <span class="costchip" key={res}><Icon id={res} size={20} /> {n}</span>)}
            {r.items.map((d, i) => <span class={`item ${ITEMS[d]?.rarity ?? 'common'}`} key={i}>{ITEMS[d]?.name ?? d} <span class="small">({S.rarity[ITEMS[d]?.rarity ?? 'common']})</span></span>)}
          </div>
        )}
        {r.heroXp > 0 && <div class="small muted">{S.report.xp}: +{r.heroXp}</div>}
      </div>
      <div class="row actions end">
        <button class="btn small" disabled={idx <= 0} onClick={() => go(-1)}>{S.report.older}</button>
        <button class="btn small" disabled={idx >= list.length - 1} onClick={() => go(1)}>{S.report.newer}</button>
        <button class="btn primary" onClick={close}>{S.report.close}</button>
      </div>
    </Modal>
  );
}
