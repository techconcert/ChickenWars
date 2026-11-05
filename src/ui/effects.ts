// Turns the shared Effect vocabulary (research, talents, clans) into short readable text.
import { TROOPS } from '@sim/data/registry';
import type { EffectData } from '@sim/data/schema';
import { TICKS_PER_SECOND } from '@sim/constants';
import { S } from './strings';

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

function qualifier(e: Record<string, unknown>): string {
  const bits: string[] = [];
  for (const k of ['res', 'class', 'troopClass', 'building', 'category', 'stat', 'troop']) {
    const v = e[k];
    if (typeof v !== 'string' || v === 'all') { if (v === 'all') bits.push('all'); continue; }
    if (k === 'res') bits.push(S.resources[v] ?? v);
    else if (k === 'class' || k === 'troopClass') bits.push(S.classes[v] ?? v);
    else if (k === 'troop') bits.push(TROOPS[v]?.name ?? v);
    else if (k === 'stat') bits.push(S.heroes.stats[v] ?? v);
    else bits.push(v.replace(/_/g, ' '));
  }
  return bits.join(' ');
}

/** "+10% Food production", "+2 march slots", "Unlocks Knight". */
export function effectText(e: EffectData): string {
  const r = e as unknown as Record<string, unknown>;
  const label = S.research.effect[e.kind] ?? e.kind;
  const q = qualifier(r);
  if (e.kind === 'unlockTroop') return `${label} ${TROOPS[e.troop]?.name ?? e.troop}`;
  if (e.kind === 'raidWarning') return `+${Math.round(e.ticks / TICKS_PER_SECOND)}s ${label.replace(' (ticks)', '')}`;
  if (typeof r.pct === 'number') return `${r.pct >= 0 ? '+' : ''}${r.pct}% ${cap([q, label].filter(Boolean).join(' '))}`;
  if (typeof r.amount === 'number') return `${r.amount >= 0 ? '+' : ''}${r.amount} ${[q, label].filter(Boolean).join(' ')}`;
  if (typeof r.steps === 'number') return `+${r.steps} ${label}`;
  return label;
}
