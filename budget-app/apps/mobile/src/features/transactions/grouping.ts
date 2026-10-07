import type { LocalDate } from '@budget/core';

import type { TransactionItem } from '@/data/transactions';

import { localDayOf } from './format';

export type DaySection = { day: LocalDate; data: TransactionItem[] };

/**
 * Groups a newest-first list into one section per local day (in the person's time zone), keeping
 * the order. A transaction that appears twice (pages overlapping after a change) is shown once.
 */
export function groupByDay(items: readonly TransactionItem[], timeZone: string): DaySection[] {
  const sections: DaySection[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    const day = localDayOf(item.bookedAt, timeZone);
    const last = sections[sections.length - 1];
    if (last && last.day === day) last.data.push(item);
    else sections.push({ day, data: [item] });
  }
  return sections;
}
