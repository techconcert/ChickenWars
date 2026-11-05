import type { JSX } from 'preact';
import { BALANCE, HEROES, TALENTS, TALENT_TREES } from '@sim/data/registry';
import { pointsInTree } from '@sim/heroes/talents';
import { talentPointsAvailable } from '@sim/heroes/xp';
import { why, act } from '../act';
import { effectText } from '../effects';
import { useGame } from '../hooks';
import { S } from '../strings';
import { Icon, Tip } from './Common';

export function HeroTalents({ id }: { id: string }): JSX.Element | null {
  const { client, state } = useGame();
  const h = state.heroes[id];
  const def = HEROES[id];
  const tree = TALENT_TREES.find((t) => t.id === def?.class);
  if (!h || !def || !tree) return null;
  const spent = pointsInTree(h, tree.id);
  const avail = talentPointsAvailable(h);
  const respecCmd = { t: 'respec', hero: id } as const;
  const respecWhy = why(state, respecCmd);
  return (
    <div>
      <div class="row">
        <h3 class="grow">{tree.name} · {S.heroes.points}: <b class={avail > 0 ? 'pos' : ''}>{avail}</b> <span class="muted">({spent} {S.heroes.spent})</span></h3>
        <Tip tip={<div>{S.heroes.respecTip}</div>}>
          <button class="btn small" disabled={respecWhy !== ''} onClick={() => act(client, respecCmd, S.heroes.respecDone)}>
            {S.heroes.respec} <Icon id="gold" size={16} />{BALANCE.respecCostGold}
          </button>
        </Tip>
      </div>
      {respecWhy && Object.keys(h.talents).length > 0 && <div class="small muted">{respecWhy}</div>}
      {[1, 2, 3, 4].map((tier) => {
        const nodes = tree.nodes.filter((n) => n.tier === tier);
        if (!nodes.length) return null;
        const need = Math.min(...nodes.map((n) => n.requires.points ?? 0));
        const unlocked = spent >= need;
        return (
          <div class={`talenttier ${unlocked ? '' : 'locked'}`} key={tier}>
            <div class="tiertag">{S.heroes.tier} {tier}<div class="small muted">{need > 0 ? `${need}+ ${S.heroes.points.toLowerCase()}` : ''}</div></div>
            <div class="talentrow">
              {nodes.map((n) => {
                const rank = h.talents[n.id] ?? 0;
                const cmd = { t: 'heroTalent', hero: id, talent: n.id } as const;
                const reason = rank >= n.maxRank ? S.heroes.maxed : why(state, cmd);
                const ok = reason === '';
                const reqNames = (n.requires.nodes ?? []).map((r) => TALENTS[r]?.node.name ?? r);
                return (
                  <Tip key={n.id} tip={
                    <div>
                      <div class="tip-title">{n.name} {rank}/{n.maxRank}</div>
                      {n.effects.map((e, i) => <div key={i}>{effectText(e)} {S.heroes.rankOf}</div>)}
                      {n.requires.points ? <div>{S.heroes.needPoints}: {n.requires.points}</div> : null}
                      {reqNames.length > 0 && <div>{S.heroes.needNode}: {reqNames.join(', ')}</div>}
                      {!ok && <div class="tip-sum">{reason}</div>}
                    </div>
                  }>
                    <button class={`tnode ${rank > 0 ? 'has' : ''} ${rank >= n.maxRank ? 'full' : ''} ${ok ? 'can' : ''}`} disabled={!ok} aria-label={`${n.name} ${rank}/${n.maxRank}`}
                      onClick={() => act(client, cmd)}>
                      <b>{n.name}</b>
                      <span class="pips">{Array.from({ length: n.maxRank }, (_, i) => <i key={i} class={i < rank ? 'on' : ''} />)}</span>
                      <span class="small">{n.effects[0] ? effectText(n.effects[0]) : ''}</span>
                      {reqNames.length > 0 && rank === 0 && <span class="small muted">{S.heroes.needNode} {reqNames[0]}</span>}
                    </button>
                  </Tip>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
