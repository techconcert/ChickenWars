import type { JSX } from 'preact';
import { BALANCE, HEROES, SKILLS, xpForLevel } from '@sim/data/registry';
import { heroStats } from '@sim/heroStats';
import { talentPointsAvailable } from '@sim/heroes/xp';
import { tavernLevel } from '@sim/heroes/tavern';
import { useGame } from '../hooks';
import { ui, useUI } from '../store';
import { S } from '../strings';
import { Bar, Icon, Modal, Portrait } from './Common';
import { HeroGear } from './HeroGear';
import { HeroTalents } from './HeroTalents';
import { Tavern } from './Tavern';

const TABS = ['roster', 'talents', 'gear', 'tavern'] as const;

function Overview({ id }: { id: string }): JSX.Element | null {
  const { state } = useGame();
  const h = state.heroes[id];
  const def = HEROES[id];
  if (!h || !def) return null;
  const st = heroStats(state, id);
  const sk = SKILLS[def.skill];
  const maxed = h.level >= BALANCE.heroMaxLevel;
  const need = xpForLevel(h.level);
  const march = h.march ? state.marches[h.march] : undefined;
  const sn = (k: string): string => S.heroes.stats[k] ?? k;
  const rows: [string, string][] = [
    [sn('atk'), String(st.atk)], [sn('def'), String(st.def)], [sn('hp'), String(st.hp)], [sn('lead'), String(st.lead)],
    [sn('gather'), `+${Math.round(st.gather * 100)}%`], [sn('speed'), `${Math.round(st.speed * 100)}%`],
  ];
  return (
    <div>
      <div class="herohead">
        <Portrait id={id} size={96} cls={def.class} />
        <div class="grow">
          <h3 class="herotitle">{def.name}</h3>
          <div class="muted">{S.heroes.classes[def.class]} · {S.heroes.level} {h.level}</div>
          <div class="small muted">{maxed ? S.heroes.maxLevel : `${S.heroes.xp} ${h.xp}/${need}`}</div>
          <Bar value={maxed ? 1 : h.xp} max={maxed ? 1 : need} />
          <div class={`small ${march ? 'neg' : 'pos'}`}>{march ? `${S.heroes.onMarch}: ${S.marches.kind[march.kind]}` : S.heroes.home}</div>
        </div>
      </div>
      <div class="statgrid">
        {rows.map(([l, v]) => <div class="statrow" key={l}><span>{l}</span><b>{v}</b></div>)}
      </div>
      <h4>{S.heroes.skill}</h4>
      <div class="reward">
        <b>{sk?.name ?? def.skill}</b> <span class="muted">· {S.heroes.rank} {h.skillRank}/3</span>
        <div class="small">{S.heroes.skills[def.skill] ?? S.heroes.skillTip}</div>
        <div class="small muted">{S.heroes.skillTip}. {S.heroes.rageTip}.</div>
      </div>
      <div class="small muted section">{S.heroes.points}: <b>{talentPointsAvailable(h)}</b></div>
    </div>
  );
}

export function HeroesPanel(): JSX.Element {
  const { client, state } = useGame();
  const u = useUI();
  const ids = Object.keys(state.heroes);
  const sel = u.heroId && state.heroes[u.heroId] ? u.heroId : ids[0] ?? null;
  const tab = u.heroTab;
  const close = (): void => ui.set({ panel: null });
  void client;
  return (
    <Modal title={`${S.heroes.title} (${ids.length}/${BALANCE.heroMax})`} onClose={close} wide xl>
      <div class="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} class={`tab ${tab === t ? 'on' : ''}`} onClick={() => ui.set({ heroTab: t })}>
            {S.heroes.tabs[t]}{t === 'tavern' && tavernLevel(state) < 1 ? '' : ''}
          </button>
        ))}
      </div>
      {tab === 'tavern' ? <Tavern /> : (
        <div class="herolayout">
          <div class="rosterlist">
            {ids.length === 0 && <p class="muted">{S.heroes.none}</p>}
            {ids.map((id) => {
              const h = state.heroes[id]!;
              const def = HEROES[id];
              const pts = talentPointsAvailable(h);
              return (
                <button key={id} class={`rostercard ${sel === id ? 'on' : ''}`} onClick={() => ui.set({ heroId: id })}>
                  <Portrait id={id} size={44} cls={def?.class} />
                  <div class="grow">
                    <b>{def?.name ?? id}</b>
                    <div class="small muted">{S.heroes.classes[def?.class ?? 'warrior']} · {S.heroes.level} {h.level}</div>
                  </div>
                  {pts > 0 && <span class="badge" title={S.heroes.points}>{pts}</span>}
                  {h.march && <Icon id="march_attack" size={18} title={S.heroes.onMarch} />}
                </button>
              );
            })}
          </div>
          <div class="herodetail">
            {sel === null ? null : tab === 'roster' ? <Overview id={sel} /> : tab === 'talents' ? <HeroTalents id={sel} /> : <HeroGear id={sel} />}
          </div>
        </div>
      )}
    </Modal>
  );
}
