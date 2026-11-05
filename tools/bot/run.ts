// Balance bot: runner that plays a Bot against the sim and records milestones.
import { DAY_TICKS, TICKS_PER_MINUTE } from '../../src/sim/constants';
import type { GameEvent } from '../../src/sim/events';
import { realState } from './world';
import type { RealOpts } from './world';
import type { GameState } from '../../src/sim/state';
import { advance } from '../../src/sim/tick';
import { Bot } from './bot';
import type { BotOptions } from './bot';

export interface Milestones {
  /** minutes (1x) at which each Town Hall level was first reached */
  th: Record<number, number>;
  firstCampMinutes: number | null;
  firstT2CampMinutes: number | null;
  firstBossMinutes: number | null;
  campsCleared: number;
  raidsWon: number;
  raidsLost: number;
  battlesLost: number;
  /** longest stretch (days) with 0 food */
  maxZeroFoodDays: number;
  /** longest stretch (days) of no food income while stock < 5 */
  minFood: number;
  heroes: number;
  troops: number;
  /** reign progress as reported by the progression module (0..1) if available */
  reignPct: number;
  ticks: number;
  wallMs: number;
  /** compact human log */
  log: string[];
}

export interface RunOpts extends RealOpts {
  bot: BotOptions;
  maxMinutes: number;
  /** Stop early when this returns true (checked every decision). */
  until?: (s: GameState, m: Milestones) => boolean;
  verbose?: boolean;
}

export function newMilestones(): Milestones {
  return {
    th: {}, firstCampMinutes: null, firstT2CampMinutes: null, firstBossMinutes: null, campsCleared: 0, raidsWon: 0, raidsLost: 0, battlesLost: 0,
    maxZeroFoodDays: 0, minFood: Infinity, heroes: 0, troops: 0, reignPct: 0, ticks: 0, wallMs: 0, log: [],
  };
}

export function playBot(opts: RunOpts): { state: GameState; m: Milestones } {
  const state = realState(opts);
  const bot = new Bot(opts.bot);
  const m = newMilestones();
  const t0 = Date.now();
  const maxTicks = opts.maxMinutes * TICKS_PER_MINUTE;
  let zeroTicks = 0;
  const every = bot.opts.decideEvery;
  const min = (): string => (state.tick / TICKS_PER_MINUTE).toFixed(1);
  while (state.tick < maxTicks) {
    const cmds = state.tick % every === 0 ? bot.decide(state) : [];
    const evs: GameEvent[] = advance(state, cmds);
    for (const e of evs) {
      if (e.t === 'CampCleared') {
        m.campsCleared++;
        if (m.firstCampMinutes === null) m.firstCampMinutes = state.tick / TICKS_PER_MINUTE;
        if (e.tier >= 2 && m.firstT2CampMinutes === null) m.firstT2CampMinutes = state.tick / TICKS_PER_MINUTE;
        m.log.push(`${min()}m camp cleared tier ${e.tier}`);
      } else if (e.t === 'BossDefeated') {
        if (m.firstBossMinutes === null) m.firstBossMinutes = state.tick / TICKS_PER_MINUTE;
        m.log.push(`${min()}m BOSS defeated ${e.boss}`);
      } else if (e.t === 'RaidResolved') {
        if (e.won) m.raidsWon++; else m.raidsLost++;
        m.log.push(`${min()}m raid ${e.won ? 'repelled' : 'LOST'}`);
      } else if (e.t === 'BattleResolved' && e.winner === 'defender' && e.target !== 'city') {
        m.battlesLost++;
        m.log.push(`${min()}m attack failed`);
      } else if (e.t === 'BuildingCompleted' && e.type === 'town_hall') {
        m.th[e.level] = state.tick / TICKS_PER_MINUTE;
        m.log.push(`${min()}m town hall ${e.level}`);
      } else if (e.t === 'HeroRecruited') {
        m.log.push(`${min()}m hero ${e.hero}`);
      }
    }
    if (state.resources.food <= 0) zeroTicks++;
    else {
      m.maxZeroFoodDays = Math.max(m.maxZeroFoodDays, zeroTicks / DAY_TICKS);
      zeroTicks = 0;
    }
    m.minFood = Math.min(m.minFood, state.resources.food);
    if (opts.until && state.tick % every === 0 && opts.until(state, m)) break;
  }
  m.maxZeroFoodDays = Math.max(m.maxZeroFoodDays, zeroTicks / DAY_TICKS);
  m.heroes = Object.keys(state.heroes).length;
  m.troops = Object.values(state.troops).reduce((a, p) => a + p.healthy + p.wounded, 0);
  m.ticks = state.tick;
  m.wallMs = Date.now() - t0;
  return { state, m };
}
