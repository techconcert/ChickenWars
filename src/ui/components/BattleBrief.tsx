import type { JSX } from 'preact';
import { battlePreview } from '@sim/combat/preview';
import type { ClassId } from '@sim/combat/preview';
import { useGame } from '../hooks';
import { S } from '../strings';
import { Icon } from './Common';

const fuzz = (n: number): string => { const step = n >= 40 ? 10 : 5; return `~${Math.max(step, Math.round(n / step) * step)}`; };
const ORDER: ClassId[] = ['infantry', 'archer', 'cavalry', 'siege'];

/** Pre-battle brief: enemy troops by class, recommended counters and (with an army draft) the predicted win chance. */
export function BattleBrief({ poi, draft }: { poi: string; draft?: { hero: string; troops: Record<string, number> } | null }): JSX.Element | null {
  const { state } = useGame();
  const b = battlePreview(state, draft ?? null, poi);
  if (!b) return null;
  const o = b.outcome;
  return (
    <div class="section brief">
      <h4>{S.brief.title}{b.phase2 && <span class="badge"> {S.brief.twoPhases}</span>}</h4>
      <div class="statline small">
        {ORDER.filter((c) => b.enemyByClass[c] > 0).map((c) => <span key={c}><Icon id={c} size={16} /> {S.classes[c]} <b>{fuzz(b.enemyByClass[c])}</b></span>)}
        {b.enemyHero && <span>{S.brief.hero} <b>{b.enemyHero}</b></span>}
      </div>
      <div class="small">{S.brief.counters}: {b.recommended.map((c) => <b key={c} class="costchip"><Icon id={c} size={16} />{S.classes[c]}</b>)}{b.palisade && <span class="muted"> ({S.brief.palisade})</span>}</div>
      <div class="muted small">{S.brief.triangle}</div>
      {b.phase2 && <div class="muted small">{S.brief.phase2Hint}</div>}
      {o ? (
        <div class={`statline small winchance ${o.winChance >= 70 ? 'pos' : o.winChance >= 40 ? '' : 'neg'}`}>
          <span>{S.brief.winChance} <b>{o.winChance}%</b></span>
          <span>{S.brief.expectedLoss} <b>~{Math.round(o.lossShare * 100)}%</b></span>
          {o.phase2Round !== null && <span>{S.brief.enrages} <b>{S.report.round} {o.phase2Round}</b></span>}
          <span>{S.brief.counterShare} <b>{Math.round(o.counterShare * 100)}%</b></span>
        </div>
      ) : <div class="muted small">{S.brief.pickArmy}</div>}
    </div>
  );
}
