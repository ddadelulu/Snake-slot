import type { TransactionItem } from '@/data/transactions';

import { groupByDay } from './grouping';

function item(id: string, bookedAt: string): TransactionItem {
  return {
    id,
    amountRappen: -100,
    bookedAt,
    merchant: null,
    rawText: null,
    note: null,
    mcc: null,
    source: 'manual',
    dataSourceId: null,
    dataSourceName: null,
    categoryId: null,
    categorizedBy: 'none',
    categoryConfidence: null,
    fixedCostId: null,
    original: null,
    items: null,
    suggestedRule: null,
    splits: [],
    mergedSources: [],
    needsReview: false,
    deletedAt: null,
    createdAt: bookedAt,
  };
}

describe('groupByDay', () => {
  it('groups a newest-first list by local day, keeping the order', () => {
    const sections = groupByDay(
      [
        item('a', '2026-10-05T18:00:00Z'),
        // 22:30 UTC on the 4th is the 5th in Zurich.
        item('b', '2026-10-04T22:30:00Z'),
        item('c', '2026-10-04T08:00:00Z'),
        item('a', '2026-10-05T18:00:00Z'),
      ],
      'Europe/Zurich',
    );
    expect(sections.map((section) => [section.day, section.data.map((tx) => tx.id)])).toEqual([
      ['2026-10-05', ['a', 'b']],
      ['2026-10-04', ['c']],
    ]);
  });

  it('is empty for no transactions', () => {
    expect(groupByDay([], 'Europe/Zurich')).toEqual([]);
  });
});
