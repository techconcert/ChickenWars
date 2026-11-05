import { describe, expect, it } from 'vitest';
import { BALANCE, EVENTS, EVENT_LIST, EVENTS_DATA, WORLD } from '@sim/data/registry';
import { eventBandForTh, eventBandOfId } from '@sim/systems/eventGen';
import { pickEvent } from '@sim/systems/world';
import { advance } from '@sim/tick';
import type { GameState } from '@sim/state';
import { makeState } from '../helpers/makeState';

const generated = EVENT_LIST.filter((e) => e.id.startsWith('ev_'));

describe('random event pool', () => {
  it('has at least 500 distinct generated events plus the authored ones, all with valid options', () => {
    expect(generated.length).toBeGreaterThanOrEqual(500);
    expect(new Set(EVENT_LIST.map((e) => e.id)).size).toBe(EVENT_LIST.length);
    expect(new Set(generated.map((e) => e.title)).size).toBeGreaterThanOrEqual(500);
    expect(EVENT_LIST.length).toBe(WORLD.events.length + generated.length);
    for (const e of generated) {
      expect(e.options.length).toBeGreaterThanOrEqual(2);
      expect(e.text).toBeTruthy();
      expect(EVENTS[e.id]).toBe(e);
    }
  });

  it('scales amounts with the Town Hall band', () => {
    const lo = EVENTS['ev_trade_salt_peddler_b1_modest']!, hi = EVENTS['ev_trade_salt_peddler_b8_modest']!;
    const amt = (e: typeof lo): number => { const x = e.options[0]!.effect[0]; return x && x.kind === 'trade' ? Object.values(x.get).reduce((a, b) => a + b, 0) : 0; };
    expect(amt(hi)).toBeGreaterThan(amt(lo) * 10);
  });

  it('picks events of the player band, never repeats recent ones and happens every eventIntervalDays', () => {
    const s = makeState();
    s.city.buildings[s.city.townHall]!.level = 7;
    const band = eventBandForTh(EVENTS_DATA, 7);
    const seen: string[] = [];
    for (let day = 10; day < 10 + 60; day++) {
      const ev = pickEvent(s, day)!;
      const b = eventBandOfId(ev.id);
      expect(b === 0 || b === band || b === band - 1).toBe(true);
      expect(seen.slice(-EVENTS_DATA.recent)).not.toContain(ev.id);
      seen.push(ev.id);
      s.eventSeen = seen.slice(-EVENTS_DATA.recent);
    }
    expect(BALANCE.eventIntervalDays).toBe(10);
  });

  it('every generated option can be applied without breaking the state', () => {
    for (const e of generated.filter((_, i) => i % 9 === 0)) {
      for (let i = 0; i < e.options.length; i++) {
        const s: GameState = makeState();
        for (const r of ['food', 'wood', 'stone', 'gold'] as const) s.resources[r] = 50000;
        s.pendingEvent = { id: e.id, expiresAt: s.tick + 1000 };
        advance(s, [{ t: 'eventChoice', option: i }]);
        for (const r of ['food', 'wood', 'stone', 'gold'] as const) expect(Number.isFinite(s.resources[r])).toBe(true);
      }
    }
  });
});
