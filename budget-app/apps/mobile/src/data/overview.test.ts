import { OVERVIEW_JSON } from '@/test/overviewFixture';

import { OverviewFormatError, parseOverview, toHomeModel } from './overview';

const clone = () => JSON.parse(JSON.stringify(OVERVIEW_JSON)) as typeof OVERVIEW_JSON;

describe('parseOverview', () => {
  it('converts the database answer to camelCase data', () => {
    const data = parseOverview(OVERVIEW_JSON);
    expect(data?.period).toEqual({
      id: OVERVIEW_JSON.period.id,
      startsOn: '2026-09-25',
      endsOn: '2026-10-25',
      incomeRappen: 620000,
      fixedCostsRappen: 233550,
      savingsRappen: 50000,
      carriedOverRappen: 4500,
    });
    expect(data?.categories[2]).toEqual({
      categoryId: 'c-dog',
      defaultKey: null,
      name: 'Dog',
      icon: null,
      sortOrder: 2,
      archived: false,
      budgetId: 'b-dog',
      budgetAmountRappen: 10000,
      rolloverRappen: 0,
      spentRappen: -500,
    });
    expect(data?.recentTransactions[0]).toMatchObject({ merchant: 'Migros', amountRappen: -4250, isSplit: false });
  });

  it('returns null when there is no month yet', () => {
    expect(parseOverview(null)).toBeNull();
    expect(parseOverview(undefined)).toBeNull();
  });

  it('rejects anything malformed, naming the field', () => {
    const cases: Array<[(json: ReturnType<typeof clone>) => void, string]> = [
      [(json) => Object.assign(json, { today: '2.10.2026' }), 'today'],
      [(json) => Object.assign(json.period, { income_rappen: 12.5 }), 'period.income_rappen'],
      [(json) => Object.assign(json.categories[0]!, { default_key: 'casino' }), 'categories[0].default_key'],
      [(json) => Object.assign(json.categories[1]!, { archived: 'no' }), 'categories[1]'],
      [(json) => Object.assign(json.recent_transactions[0]!, { source: 'telepathy' }), 'recent_transactions[0].source'],
      [(json) => Object.assign(json.recent_transactions[1]!, { is_split: 1 }), 'recent_transactions[1].is_split'],
      [(json) => Object.assign(json, { categories: {} }), 'categories'],
    ];
    for (const [mutate, field] of cases) {
      const json = clone();
      mutate(json);
      expect(() => parseOverview(json)).toThrow(new OverviewFormatError(field));
    }
    expect(() => parseOverview([])).toThrow(OverviewFormatError);
  });
});

describe('toHomeModel', () => {
  it('derives balance, daily allowance, payday countdown and category states', () => {
    const { overview } = toHomeModel(parseOverview(OVERVIEW_JSON)!);
    expect(overview).toMatchObject({
      spendableRappen: 340950,
      spentRappen: 65000,
      balanceRappen: 275950,
      daysUntilPayday: 23,
      dailyAllowanceRappen: 11997,
      dayOfPeriod: 8,
      status: 'ok',
      pace: { kind: 'on_track' },
    });
    expect(overview.categories.map((c) => [c.categoryId, c.remainingRappen, c.status])).toEqual([
      ['c-groceries', 67000, 'ok'],
      ['c-eating-out', -1000, 'danger'],
      ['c-dog', 10500, 'ok'],
    ]);
  });
});
