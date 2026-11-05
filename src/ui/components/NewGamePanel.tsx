import { useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { CLANS, START_TYPES } from '@sim/data/registry';
import { hash32 } from '@sim/rng';
import { todaysSeed } from '@platform/profile';
import { effectText } from '../effects';
import { useGame } from '../hooks';
import { fmtNum, costEntries } from '../format';
import { closePanel } from '../menu';
import { S } from '../strings';
import { Icon, Modal } from './Common';

/** Text seeds are hashed; plain numbers are used as they are. */
export function seedFromText(text: string): number {
  const t = text.trim();
  if (/^\d{1,10}$/.test(t)) return (Number(t) >>> 0) || 1;
  return hash32('seed', t) || 1;
}

function randomSeed(): string { return String(Math.floor(performance.now() * 1000 + Date.now()) % 1000000); }

export function NewGamePanel(): JSX.Element {
  const { client } = useGame();
  const [seed, setSeed] = useState(randomSeed());
  const [size, setSize] = useState('small');
  const [diff, setDiff] = useState('normal');
  const [start, setStart] = useState('river_valley');
  const [clan, setClan] = useState('oakwarden');
  const real = seedFromText(seed);
  const launch = (): void => {
    const q = new URLSearchParams({ new: '1', seed: String(real), size, difficulty: diff, start, clan });
    location.href = `${location.pathname}?${q.toString()}`;
  };
  const pick = (cur: string, set: (v: string) => void, id: string, children: JSX.Element[], tip?: string): JSX.Element => (
    <button key={id} type="button" class={`choice ${cur === id ? 'on' : ''}`} aria-pressed={cur === id} title={tip} onClick={() => set(id)}>{children}</button>
  );
  return (
    <Modal title={S.newGame.title} onClose={() => closePanel(client)} wide xl>
      <div class="ng-grid">
        <section>
          <h4>{S.newGame.seed}</h4>
          <div class="row">
            <input class="num seedin" type="text" value={seed} maxLength={40} aria-label={S.newGame.seed} onInput={(e) => setSeed((e.target as HTMLInputElement).value)} />
            <button class="btn small" onClick={() => setSeed(randomSeed())}>{S.newGame.random}</button>
            <button class="btn small" title={S.newGame.dailyTip} onClick={() => setSeed(String(todaysSeed()))}>{S.newGame.daily}</button>
          </div>
          <div class="small muted">{S.newGame.seedHint} {S.newGame.seedNow}: {real}</div>
          <h4>{S.newGame.size}</h4>
          <div class="choices">
            {pick(size, setSize, 'small', [<b key="a">{S.newGame.small}</b>, <span key="b" class="small muted">{S.newGame.smallTip}</span>])}
            {pick(size, setSize, 'standard', [<b key="a">{S.newGame.standard}</b>, <span key="b" class="small muted">{S.newGame.standardTip}</span>])}
          </div>
          <h4>{S.newGame.difficulty}</h4>
          <div class="choices">
            {(['easy', 'normal', 'hard'] as const).map((d) => pick(diff, setDiff, d, [<b key="a">{S.newGame.difficulties[d]}</b>, <span key="b" class="small muted">{S.newGame.difficultyTip[d]}</span>]))}
          </div>
        </section>
        <section>
          <h4>{S.newGame.start}</h4>
          <div class="choices col">
            {Object.values(START_TYPES).map((t) => pick(start, setStart, t.id, [
              <b key="a">{t.name ?? t.id}</b>,
              <span key="b" class="small">{S.newGame.startTypes[t.id] ?? ''}</span>,
              <span key="c" class="small muted">{S.seasons.summer} {t.season.summerDays}d · {S.seasons.winter} {t.season.winterDays}d · {costEntries(t.start.resources).map(([r, n]) => `${fmtNum(n)} ${S.resources[r]}`).join(', ')}</span>,
            ]))}
          </div>
          <h4>{S.newGame.clan}</h4>
          <div class="choices col grid2">
            {Object.values(CLANS).map((c) => pick(clan, setClan, c.id, [
              <b key="a"><span class="bannerdot" style={{ background: c.banner }} aria-hidden="true" /> {c.name}</b>,
              <span key="b" class="small">{S.newGame.clans[c.id] ?? ''}</span>,
              <span key="c" class="small muted">{c.effects.map(effectText).join(' · ')}</span>,
            ]))}
          </div>
        </section>
      </div>
      <p class="small muted"><Icon id="gift" size={16} /> {S.newGame.warn}</p>
      <div class="row actions end sticky">
        <button class="btn" onClick={() => closePanel(client)}>{S.newGame.cancel}</button>
        <button class="btn primary big" onClick={launch}>{S.newGame.go}</button>
      </div>
    </Modal>
  );
}
