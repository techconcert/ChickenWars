import { useEffect, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { BANNER_UNLOCKS } from '@sim/progression';
import type { Profile } from '@sim/progression';
import { computeScore } from '@sim/progression';
import { DAY_TICKS } from '@sim/constants';
import { loadProfile, recordWin } from '@platform/profile';
import { act } from '../act';
import { useGame } from '../hooks';
import { ui } from '../store';
import { S } from '../strings';

/** Win screen: stats, score, chronicle summary, profile unlocks. "Continue in sandbox" dispatches continueSandbox. */
export function EndScreen(): JSX.Element {
  const { client, state } = useGame();
  const [profile, setProfile] = useState<Profile>(loadProfile());
  const [fresh, setFresh] = useState(false);
  useEffect(() => {
    const r = recordWin(state);
    setProfile(r.profile);
    setFresh(r.fresh);
  }, []);
  const th = state.city.buildings[state.city.townHall]?.level ?? 1;
  const rows: [string, string | number][] = [
    [S.end.score, computeScore(state)], [S.end.time, `${Math.floor(state.tick / DAY_TICKS)} ${S.end.days}`], [S.world.level + ' (Town Hall)', th],
    [S.end.battles, state.stats.battlesWon], [S.end.lost, state.stats.battlesLost], [S.end.camps, state.stats.campsCleared], [S.end.bosses, state.stats.bossesKilled],
    [S.end.gathered, Math.floor(state.stats.gathered)], [S.end.heroes, Object.keys(state.heroes).length], [S.end.quests, state.quests.completed.length], [S.end.research, state.research.done.length],
  ];
  const recent = state.chronicle.slice(-8).reverse();
  return (
    <div class="modal-back endback">
      <div class="panel modal wide endscreen" role="dialog" aria-label={S.end.title}>
        <header class="panel-head"><h2>{S.end.title}</h2></header>
        <div class="panel-body">
          <p class="endsub">{S.end.sub}</p>
          <div class="statgrid">{rows.map(([l, v]) => <div class="statrow" key={l}><span>{l}</span><b>{v}</b></div>)}</div>
          <h4>{S.end.chronicle}</h4>
          <div class="chronicle short">{recent.map((c, i) => <div class="chrow" key={i}><span class="small muted chday">{S.quests.day} {Math.floor(c.tick / DAY_TICKS) + 1}</span><span class="grow">{c.text}</span></div>)}</div>
          <div class="small muted section">
            {S.end.runs}: <b>{profile.runsWon}</b> · {S.end.best}: <b>{profile.bestScore}</b>
            {profile.unlockedBanners.includes(BANNER_UNLOCKS.hard_win.id) && <> · {S.end.banner} <span class="bannerdot" style={{ background: BANNER_UNLOCKS.hard_win.colour }} /></>}
            {fresh && (profile.unlockedBanners.length > 0 || profile.unlockedPortraits.length > 0) && <b class="pos"> · {S.end.unlocked}</b>}
          </div>
          <div class="row actions end">
            <button class="btn" onClick={() => ui.set({ panel: 'newgame' })}>{S.end.newGame}</button>
            <button class="btn primary big" onClick={() => { if (act(client, { t: 'continueSandbox' })) client.setSpeed(1); }}>{S.end.sandbox}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
