// Generates the random-event pool (about 850 events) from data/events.json: template x Town Hall band x variant (modest, bold).
// Amounts scale with the band; buffs and costs scale mildly. Pure and deterministic; the registry appends the result to world.json's events.
import type { EventsData, WorldEventData } from '../data/schema';

export function eventBandForTh(data: EventsData, th: number): number {
  let best = data.bands[0]!.id;
  for (const b of data.bands) if (th >= b.th[0]) best = b.id;
  return best;
}

export function eventBandOfId(id: string): number {
  const m = /_b(\d+)_[a-z]+$/.exec(id);
  return m ? Number(m[1]) : 0;
}

const nice = (n: number): number => {
  if (n < 10) return Math.max(1, Math.round(n));
  const step = n < 50 ? 5 : n < 200 ? 10 : n < 1000 ? 25 : 50;
  return Math.max(step, Math.round(n / step) * step);
};

function scaled(weights: Record<string, number | undefined>, value: number, mult: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of Object.keys(weights).sort()) {
    const n = nice(100 * value * mult * (weights[k] ?? 0));
    if (n > 0) out[k] = n;
  }
  return out;
}

type Effect = WorldEventData['options'][number]['effect'][number];

export function generateEvents(data: EventsData): WorldEventData[] {
  const out: WorldEventData[] = [];
  for (const tpl of data.templates) {
    for (const band of data.bands) {
      if (band.id < tpl.bands[0] || band.id > tpl.bands[1]) continue;
      (['modest', 'bold'] as const).forEach((variant, vi) => {
        const bold = variant === 'bold';
        const v = band.value;
        const options: WorldEventData['options'] = [];
        switch (tpl.kind) {
          case 'trade': {
            const m = bold ? 1.6 : 0.8;
            const give = scaled(tpl.give ?? {}, v, m), get = scaled(tpl.get ?? {}, v, m);
            options.push({ label: bold ? 'Make the big deal' : 'Accept the deal', effect: [{ kind: 'trade', give, get } as Effect] });
            if (bold) options.push({ label: 'Haggle (risky)', effect: [{ kind: 'gamble', chance: 50, win: scaled(tpl.get ?? {}, v, 2.6), lose: scaled(tpl.give ?? {}, v, 0.9) } as Effect] });
            options.push({ label: 'Send them away', effect: [] });
            break;
          }
          case 'gamble': {
            const m = bold ? 1.8 : 1;
            options.push({ label: bold ? 'Go all in (risky)' : 'Take the risk', effect: [{ kind: 'gamble', chance: Math.max(25, (tpl.chance ?? 50) - (bold ? 10 : 0)), win: scaled(tpl.win ?? {}, v, m), lose: scaled(tpl.lose ?? {}, v, m) } as Effect] });
            if (bold) options.push({ label: 'Hedge a little', effect: [{ kind: 'trade', give: scaled(tpl.lose ?? {}, v, 0.7), get: scaled(tpl.win ?? {}, v, 0.5) } as Effect] });
            options.push({ label: 'Walk away', effect: [] });
            break;
          }
          case 'buff': {
            const pay = scaled(tpl.cost ?? {}, v, bold ? 1.5 : 1);
            const buff = { kind: 'buff', stat: tpl.stat ?? 'prod_all', pct: Math.round((tpl.pct ?? 10) * (bold ? 1.5 : 1)), ticks: Math.round((tpl.ticks ?? 2400) * (bold ? 1.3 : 1)) } as Effect;
            options.push({ label: Object.keys(pay).length ? (bold ? 'Go all out' : 'Pay and go ahead') : (bold ? 'Make the most of it' : 'Welcome it'), effect: Object.keys(pay).length ? [{ kind: 'cost', ...pay } as Effect, buff] : [buff] });
            options.push({ label: 'Let it pass', effect: [] });
            break;
          }
          case 'camp': {
            const tier = Math.min(5, band.campTier + (bold ? 1 : 0));
            options.push({ label: bold ? 'Send the flock' : 'Send a patrol of chicks', effect: [{ kind: 'spawnCamp', tier } as Effect] });
            options.push({ label: 'Wait it out', effect: [{ kind: 'blockNode', type: tpl.node ?? 'forest', ticks: 1800 } as Effect] });
            break;
          }
          case 'cost': {
            const pay = scaled(tpl.pay ?? {}, v, 1);
            options.push({ label: 'Pay to fix it', effect: [{ kind: 'cost', ...pay } as Effect] });
            options.push({ label: 'Endure', effect: [{ kind: 'buff', stat: tpl.stat ?? 'prod_all', pct: Math.round((tpl.pct ?? -10) * (bold ? 1.5 : 1)), ticks: Math.round((tpl.ticks ?? 2400) * (bold ? 1.3 : 1)) } as Effect] });
            break;
          }
        }
        const ev: WorldEventData = {
          id: `ev_${tpl.id}_b${band.id}_${variant}`,
          title: `${tpl.titles[Math.min(vi, tpl.titles.length - 1)]} (${band.name})`,
          text: tpl.text,
          weight: 1,
          options,
        };
        if (tpl.season) ev.season = tpl.season;
        out.push(ev);
      });
    }
  }
  return out;
}
