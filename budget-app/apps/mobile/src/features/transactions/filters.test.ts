import {
  DEFAULT_LIST_FILTER,
  activeFilterCount,
  periodRange,
  toTransactionFilter,
  toggleCategory,
  waitsForPeriod,
} from './filters';

const CURRENT = { startsOn: '2026-09-25', endsOn: '2026-10-25' };

describe('periodRange', () => {
  it('is the current budget month up to the day before payday', () => {
    expect(periodRange('this_month', CURRENT, 25)).toEqual({
      from: '2026-09-25',
      to: '2026-10-24',
    });
  });

  it('is the month before for "last month"', () => {
    expect(periodRange('last_month', CURRENT, 25)).toEqual({
      from: '2026-08-25',
      to: '2026-09-24',
    });
  });

  it('handles paydays the previous month does not have', () => {
    const march = { startsOn: '2026-03-31', endsOn: '2026-04-30' };
    expect(periodRange('last_month', march, 31)).toEqual({ from: '2026-02-28', to: '2026-03-30' });
  });

  it('falls back to the start day when the payday is unknown', () => {
    expect(periodRange('last_month', CURRENT, null)).toEqual({
      from: '2026-08-25',
      to: '2026-09-24',
    });
  });

  it('has no range for all time, or before the current month is known', () => {
    expect(periodRange('all', CURRENT, 25)).toBeNull();
    expect(periodRange('this_month', null, 25)).toBeNull();
    expect(waitsForPeriod({ ...DEFAULT_LIST_FILTER, period: 'this_month' }, null)).toBe(true);
    expect(waitsForPeriod(DEFAULT_LIST_FILTER, null)).toBe(false);
  });
});

describe('toTransactionFilter', () => {
  it('leaves everything out by default', () => {
    expect(toTransactionFilter(DEFAULT_LIST_FILTER, '  ', CURRENT, 25)).toEqual({});
  });

  it('maps search, categories, not categorized, source and period', () => {
    expect(
      toTransactionFilter(
        {
          categoryIds: ['c-groceries'],
          uncategorized: true,
          source: 'statement_import',
          period: 'this_month',
        },
        ' manor ',
        CURRENT,
        25,
      ),
    ).toEqual({
      search: 'manor',
      categoryIds: ['c-groceries'],
      uncategorized: true,
      sources: ['statement_import'],
      from: '2026-09-25',
      to: '2026-10-24',
    });
  });
});

describe('filter state', () => {
  it('counts the filters that narrow the list', () => {
    expect(activeFilterCount(DEFAULT_LIST_FILTER)).toBe(0);
    expect(
      activeFilterCount({ categoryIds: [], uncategorized: true, source: 'manual', period: 'all' }),
    ).toBe(2);
  });

  it('toggles a category in and out', () => {
    const once = toggleCategory(DEFAULT_LIST_FILTER, 'c-1');
    expect(once.categoryIds).toEqual(['c-1']);
    expect(toggleCategory(once, 'c-1').categoryIds).toEqual([]);
  });
});
