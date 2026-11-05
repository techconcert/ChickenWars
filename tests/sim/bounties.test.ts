import { describe, expect, it } from 'vitest';
import type { TickCtx } from '@sim/ctx';
import { BOUNTIES, BOUNTY_LIST, BUILDINGS, ITEMS, QUESTS, TROOPS } from '@sim/data/registry';
import { bandOfId } from '@sim/quests/bountyGen';
import { activeQuests } from '@sim/quests';
import type { GameState } from '@sim/state';
import { tickQuests } from '@sim/systems/quests';
import { makeState } from '../helpers/makeState';

function tick(s: GameState): void {
  const ctx: TickCtx = { events: [], safeMode: false };
  tickQuests(s, ctx);
}
const PERIOD = BOUNTIES.refillDays * 600;
/** Runs the board until `n` bounties are active (one is offered per refill period, the first after one period). */
function fill(s: GameState, n = BOUNTIES.slots): void {
  tick(s);
  for (let i = 0; i < n + 1 && active(s).length < n; i++) { s.tick += PERIOD; tick(s); }
}
function ready(th: number): GameState {
  const s = makeState();
  s.city.buildings[s.city.townHall]!.level = th;
  s.quests.completed.push(BOUNTIES.startAfter);
  s.quests.active = null;
  return s;
}
const active = (s: GameState): string[] => Object.keys(s.quests.side ?? {}).filter((id) => id.startsWith('bounty_')).sort();
const worth = (r: Record<string, number | undefined>): number => (r['food'] ?? 0) + (r['wood'] ?? 0) + (r['stone'] ?? 0) + (r['gold'] ?? 0);

describe('bounty pool', () => {
  it('has at least 500 distinct quests with valid references', () => {
    expect(BOUNTY_LIST.length).toBeGreaterThanOrEqual(500);
    expect(new Set(BOUNTY_LIST.map((q) => q.id)).size).toBe(BOUNTY_LIST.length);
    expect(new Set(BOUNTY_LIST.map((q) => q.title)).size).toBeGreaterThanOrEqual(500);
    for (const q of BOUNTY_LIST) {
      expect(QUESTS[q.id]).toBe(q);
      const s = q.steps[0]!;
      if (s.kind === 'trained') expect(TROOPS[s.troop]).toBeDefined();
      if (s.kind === 'counter' && s.key.startsWith('upgraded_') && s.key !== 'upgraded_total') expect(BUILDINGS[s.key.slice(9)]).toBeDefined();
      if (q.rewards.item) expect(ITEMS[q.rewards.item]).toBeDefined();
    }
  });

  it('scales objectives and rewards with the band', () => {
    const groups = new Map<string, typeof BOUNTY_LIST[number][]>();
    for (const q of BOUNTY_LIST) {
      const key = q.id.replace(/_b\d+_/, '_*_');
      groups.set(key, [...(groups.get(key) ?? []), q]);
    }
    expect(groups.size).toBeGreaterThan(100);
    for (const list of groups.values()) {
      list.sort((a, b) => bandOfId(a.id) - bandOfId(b.id));
      for (let i = 1; i < list.length; i++) {
        const a = list[i - 1]!, b = list[i]!;
        expect(worth(b.rewards.resources ?? {})).toBeGreaterThanOrEqual(worth(a.rewards.resources ?? {}));
        const need = (q: typeof a): number => { const s = q.steps[0]!; return 'count' in s ? s.count : 'amount' in s ? s.amount : 'value' in s ? s.value : 0; };
        expect(need(b)).toBeGreaterThanOrEqual(need(a));
      }
    }
    const hi = BOUNTY_LIST.find((q) => q.id === 'bounty_gather_b8_steady')!, lo = BOUNTY_LIST.find((q) => q.id === 'bounty_gather_b1_steady')!;
    expect(worth(hi.rewards.resources!)).toBeGreaterThan(worth(lo.rewards.resources!) * 10);
  });
});

describe('bounty board', () => {
  it('waits for the tutorial step, then offers one bounty per refill period, up to the slot count, from the Town Hall band', () => {
    const s = makeState();
    tick(s);
    expect(active(s)).toHaveLength(0);
    s.tick += PERIOD * 5;
    tick(s);
    expect(active(s)).toHaveLength(0); // the first period only starts the clock
    for (const [th, band] of [[1, 1], [4, 2], [7, 4], [25, 8]] as const) {
      const t = ready(th);
      fill(t);
      const ids = active(t);
      expect(ids).toHaveLength(BOUNTIES.slots);
      for (const id of ids) expect([band, band - 1]).toContain(bandOfId(id));
      expect(new Set(ids.map((id) => QUESTS[id]!.steps[0]!.kind + JSON.stringify(QUESTS[id]!.steps[0]))).size).toBe(ids.length);
    }
  });

  it('is deterministic for the same seed and state', () => {
    const a = ready(5), b = ready(5);
    fill(a); fill(b);
    expect(active(a)).toEqual(active(b));
  });

  it('completes a bounty from counters, pays it once and never offers it again', () => {
    const s = ready(1);
    fill(s, 1);
    const id = active(s).find((x) => QUESTS[x]!.steps[0]!.kind === 'gathered') ?? active(s)[0]!;
    const def = QUESTS[id]!;
    const st = def.steps[0]!;
    const key = st.kind === 'gathered' ? 'gathered' : st.kind === 'trained' ? `trained_${st.troop}` : st.kind === 'counter' ? st.key : st.kind === 'cellsExplored' ? 'cellsExplored' : `${st.kind}`;
    const need = 'count' in st ? st.count : 'amount' in st ? st.amount : 'value' in st ? st.value : 1;
    s.quests.counters[key] = (s.quests.counters[key] ?? 0) + need;
    const gold = s.resources.gold;
    tick(s);
    expect(active(s)).not.toContain(id);
    expect(s.quests.board!.done).toBe(1);
    expect(s.quests.board!.seen).toContain(id);
    expect(s.quests.completed).not.toContain(id);
    expect(s.resources.gold + s.resources.food + s.resources.wood + s.resources.stone).toBeGreaterThan(gold);
    s.tick += PERIOD;
    tick(s);
    expect(active(s)).toHaveLength(1);
    expect(active(s)).not.toContain(id);
    expect(activeQuests(s).some((q) => q.bounty)).toBe(true);
  });

  it('lapses unfinished bounties after lifeDays and replaces them with new ones', () => {
    const s = ready(3);
    fill(s, 2);
    const first = active(s);
    s.tick += BOUNTIES.lifeDays * 600 + 1;
    tick(s);
    for (let i = 0; i < 2; i++) { s.tick += PERIOD; tick(s); }
    const second = active(s);
    expect(second.length).toBeGreaterThanOrEqual(2);
    for (const id of first) { expect(second).not.toContain(id); expect(s.quests.board!.seen).toContain(id); }
  });
});
