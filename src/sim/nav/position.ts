import type { MarchState } from '../state';

/** Cell a march currently occupies (nearest path cell; path may be empty -> -1). */
export function marchCell(m: Pick<MarchState, 'path' | 'step' | 'progress'>): number {
  if (!m.path.length) return -1;
  const i = Math.min(m.path.length - 1, m.step + (m.progress >= 500 ? 1 : 0));
  return m.path[i]!;
}
