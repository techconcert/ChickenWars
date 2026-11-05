// Bounty board: a few rotating generated quests (data/bounties.json) matched to the player's Town Hall band.
import { BOUNTIES, BOUNTY_LIST } from '../data/registry';
import type { QuestDef } from '../data/schema';
import { hashRand } from '../rng';
import type { GameState } from '../state';
import { bandForTh, bandOfId } from './bountyGen';
import { stepKey } from './steps';

export const isBounty = (id: string): boolean => id.startsWith('bounty_');

export function boardState(state: GameState): NonNullable<GameState['quests']['board']> {
  const q = state.quests;
  q.board ??= { seen: [], due: {}, done: 0, nextAt: 0 };
  return q.board;
}

/** Counter key (or step identity) of a bounty, so two active bounties never ask for the same thing. */
function topic(def: QuestDef): string {
  const s = def.steps[0]!;
  return stepKey(s) ?? `${s.kind}`;
}

/**
 * Picks the next bounty for free slot `slot`: same band as the Town Hall (75%) or the band below, never one already offered,
 * never the same objective as an active bounty. Deterministic from seed, tick and slot. Null when nothing fits.
 */
export function pickBounty(state: GameState, slot: number): QuestDef | null {
  const board = boardState(state);
  const th = state.city.buildings[state.city.townHall]?.level ?? 1;
  const band = bandForTh(BOUNTIES, th);
  const taken = new Set(board.seen);
  const active = Object.keys(state.quests.side ?? {}).filter(isBounty);
  const topics = new Set(active.map((id) => BOUNTY_LIST.find((d) => d.id === id)).filter((d): d is QuestDef => !!d).map(topic));
  const eligible = (b: number): QuestDef[] => BOUNTY_LIST.filter((d) => bandOfId(d.id) === b && !taken.has(d.id) && !active.includes(d.id) && !topics.has(topic(d)));
  const useLower = band > 1 && hashRand(state.seed, 'bountyBand', state.tick, slot) >= 0.75;
  let pool = eligible(useLower ? band - 1 : band);
  if (!pool.length) pool = eligible(band);
  if (!pool.length && band > 1) pool = eligible(band - 1);
  if (!pool.length) return null;
  return pool[Math.floor(hashRand(state.seed, 'bounty', state.tick, slot) * pool.length)]!;
}
