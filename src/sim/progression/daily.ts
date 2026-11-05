import { hash32 } from '../rng';

/** Date-derived seed for the offline "Daily seed" (month 1..12, day 1..31). Pure; the caller supplies the date. */
export function dailySeed(year: number, month: number, day: number): number {
  return hash32('daily', year, month, day);
}
