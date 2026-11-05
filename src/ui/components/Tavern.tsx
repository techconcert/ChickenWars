import type { JSX } from 'preact';
import { BALANCE, HEROES } from '@sim/data/registry';
import { tavernLevel } from '@sim/heroes/tavern';
import { act, why } from '../act';
import { fmtTicks } from '../format';
import { useGame } from '../hooks';
import { S } from '../strings';
import { Cost, Portrait } from './Common';

export function Tavern(): JSX.Element {
  const { client, state } = useGame();
  const lvl = tavernLevel(state);
  if (lvl < 1) return <p class="muted section">{S.heroes.noTavern}</p>;
  const list = state.tavern.candidates;
  const owned = Object.keys(state.heroes).length;
  return (
    <div>
      <div class="row">
        <h3 class="grow">{S.heroes.candidates}</h3>
        <span class="small muted">{S.heroes.roster} {owned}/{BALANCE.heroMax} · {S.heroes.refresh} {fmtTicks(Math.max(0, state.tavern.refreshAt - state.tick))}</span>
      </div>
      {list.length === 0 && <p class="muted">{S.heroes.noCandidates}</p>}
      <div class="candgrid">
        {list.map((id) => {
          const def = HEROES[id];
          if (!def) return null;
          const cmd = { t: 'recruitHero', hero: id } as const;
          const reason = why(state, cmd);
          const b = def.baseStats;
          return (
            <div class="candcard" key={id}>
              <Portrait id={id} size={72} cls={def.class} />
              <b>{def.name}</b>
              <div class="small muted">{S.heroes.classes[def.class]}</div>
              <div class="small">{S.heroes.stats.atk} {b.atk} · {S.heroes.stats.def} {b.def} · {S.heroes.stats.hp} {b.hp}</div>
              <div class="small muted">{S.heroes.lead} {b.lead} {S.heroes.troops}</div>
              <div class="small muted">{S.heroes.skills[def.skill] ?? def.skill}</div>
              {def.recruit.kind === 'tavern' && <Cost cost={def.recruit.cost} have={state.resources} />}
              <button class="btn primary" disabled={reason !== ''} title={reason} onClick={() => act(client, cmd)}>{S.heroes.recruit}</button>
              {reason && <div class="small neg">{reason}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
