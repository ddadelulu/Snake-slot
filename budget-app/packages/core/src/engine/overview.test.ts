import { describe, expect, it } from 'vitest';

import { MAX_ABS_RAPPEN, chf } from '../money';
import { buildOverview, type CategoryTotals, type OverviewInput } from './overview';
import type { Period } from './period';

// Payday 25; today is Friday 2 October 2026, day 8 of 30, 23 days until payday.
const period: Period = { startsOn: '2026-09-25', endsOn: '2026-10-25' };

// CHF 6'500 net, CHF 2'425 fixed costs, CHF 500 saved first: CHF 3'575 to spend.
const plan = { incomeRappen: chf(6500), fixedCostsRappen: chf(2425), savingsRappen: chf(500) };

const groceries: CategoryTotals = {
  categoryId: 'groceries',
  budgetRappen: chf(1000),
  spentRappen: chf(423, 50),
};
const eatingOut: CategoryTotals = {
  categoryId: 'eating_out',
  budgetRappen: chf(430),
  spentRappen: chf(380),
};
const goingOut: CategoryTotals = {
  categoryId: 'going_out',
  budgetRappen: chf(320),
  spentRappen: chf(350),
};
// A returned pullover: more refunded than bought so far.
const clothes: CategoryTotals = {
  categoryId: 'clothes',
  budgetRappen: chf(250),
  spentRappen: chf(-49, 90),
};

const input: OverviewInput = {
  period,
  today: '2026-10-02',
  plan,
  categories: [groceries, eatingOut, goingOut, clothes],
  uncategorizedSpentRappen: chf(25),
};

describe('buildOverview', () => {
  it('derives the home screen from the period totals', () => {
    const overview = buildOverview(input);
    // Spent: 423.50 + 380 + 350 − 49.90 + 25 (uncategorized) = 1'128.60.
    expect(overview).toEqual({
      period,
      today: '2026-10-02',
      spendableRappen: chf(3575),
      spentRappen: chf(1128, 60),
      balanceRappen: chf(2446, 40),
      // CHF 2'446.40 over 23 days is CHF 106.36 a day (rounded down: 23 × 106.36 = 2'446.28).
      dailyAllowanceRappen: chf(106, 36),
      daysUntilPayday: 23,
      dayOfPeriod: 8,
      status: 'ok',
      // 1'128.60 in 8 days reaches 3'575 on day 26 (25.3 rounded up): 20 October.
      pace: { kind: 'runs_out', on: '2026-10-20' },
      categories: [
        {
          ...groceries,
          remainingRappen: chf(576, 50),
          overspentRappen: 0,
          status: 'ok',
          progressPermille: 423,
          pace: { kind: 'runs_out', on: '2026-10-13' },
        },
        {
          ...eatingOut,
          remainingRappen: chf(50),
          overspentRappen: 0,
          status: 'warning',
          progressPermille: 883,
          pace: { kind: 'runs_out', on: '2026-10-04' },
        },
        {
          ...goingOut,
          remainingRappen: chf(-30),
          overspentRappen: chf(30),
          status: 'danger',
          progressPermille: 1000,
          pace: { kind: 'exhausted' },
        },
        {
          ...clothes,
          remainingRappen: chf(299, 90),
          overspentRappen: 0,
          status: 'ok',
          progressPermille: 0,
          pace: { kind: 'no_spending' },
        },
      ],
    });
  });

  it('turns a category orange at exactly 80 % and red at exactly 100 %', () => {
    const at = (spentRappen: number) =>
      buildOverview({
        ...input,
        categories: [{ categoryId: 'hobbies', budgetRappen: chf(500), spentRappen }],
      }).categories[0]!;
    expect(at(chf(399, 95))).toMatchObject({ status: 'ok', progressPermille: 799 });
    expect(at(chf(400))).toMatchObject({ status: 'warning', progressPermille: 800 });
    expect(at(chf(499, 95))).toMatchObject({ status: 'warning', remainingRappen: 5 });
    expect(at(chf(500))).toMatchObject({
      status: 'danger',
      progressPermille: 1000,
      remainingRappen: 0,
      overspentRappen: 0,
      pace: { kind: 'exhausted' },
    });
    expect(Object.is(at(chf(500)).overspentRappen, 0)).toBe(true);
  });

  it('handles a category with a budget of 0', () => {
    const at = (spentRappen: number) =>
      buildOverview({
        ...input,
        categories: [{ categoryId: 'gifts', budgetRappen: 0, spentRappen }],
      }).categories[0]!;
    expect(at(0)).toMatchObject({
      remainingRappen: 0,
      overspentRappen: 0,
      status: 'ok',
      progressPermille: 0,
      pace: { kind: 'no_spending' },
    });
    expect(at(chf(15))).toMatchObject({
      remainingRappen: chf(-15),
      overspentRappen: chf(15),
      status: 'danger',
      progressPermille: 1000,
      pace: { kind: 'exhausted' },
    });
  });

  it('gives the whole balance to the last day before payday', () => {
    const overview = buildOverview({ ...input, today: '2026-10-24' });
    expect(overview.daysUntilPayday).toBe(1);
    expect(overview.dayOfPeriod).toBe(30);
    expect(overview.dailyAllowanceRappen).toBe(overview.balanceRappen);
  });

  it('shares the balance over the whole period on payday', () => {
    const overview = buildOverview({
      ...input,
      today: '2026-09-25',
      categories: [],
      uncategorizedSpentRappen: 0,
    });
    expect(overview).toMatchObject({
      spentRappen: 0,
      balanceRappen: chf(3575),
      daysUntilPayday: 30,
      dayOfPeriod: 1,
      dailyAllowanceRappen: chf(119, 16), // 3'575 / 30 = 119.1666…, rounded down
      status: 'ok',
      pace: { kind: 'no_spending' },
      categories: [],
    });
  });

  it('has no daily allowance once the money is spent or overspent', () => {
    const exactlySpent = buildOverview({
      ...input,
      categories: [],
      uncategorizedSpentRappen: chf(3575),
    });
    expect(exactlySpent).toMatchObject({
      balanceRappen: 0,
      dailyAllowanceRappen: 0,
      status: 'danger',
      pace: { kind: 'exhausted' },
    });
    const overspent = buildOverview({
      ...input,
      categories: [],
      uncategorizedSpentRappen: chf(3600),
    });
    expect(overspent).toMatchObject({
      balanceRappen: chf(-25),
      dailyAllowanceRappen: 0,
      status: 'danger',
      pace: { kind: 'exhausted' },
    });
  });

  it('counts refunds back into the balance', () => {
    const overview = buildOverview({
      ...input,
      categories: [clothes],
      uncategorizedSpentRappen: 0,
    });
    expect(overview).toMatchObject({
      spentRappen: chf(-49, 90),
      balanceRappen: chf(3624, 90),
      status: 'ok',
      pace: { kind: 'no_spending' },
    });
  });

  it('includes what the previous period carried over', () => {
    expect(
      buildOverview({ ...input, plan: { ...plan, carriedOverRappen: chf(120) } }),
    ).toMatchObject({ spendableRappen: chf(3695), balanceRappen: chf(2566, 40) });
    expect(
      buildOverview({ ...input, plan: { ...plan, carriedOverRappen: chf(-80) } }),
    ).toMatchObject({ spendableRappen: chf(3495), balanceRappen: chf(2366, 40) });
  });

  it('copes with negative spendable money (fixed costs above income)', () => {
    const tight = { incomeRappen: chf(3000), fixedCostsRappen: chf(2800), savingsRappen: chf(500) };
    const nothingSpent = buildOverview({
      ...input,
      plan: tight,
      categories: [],
      uncategorizedSpentRappen: 0,
    });
    expect(nothingSpent).toMatchObject({
      spendableRappen: chf(-300),
      balanceRappen: chf(-300),
      dailyAllowanceRappen: 0,
      // Nothing spent yet, but the balance is already negative: the status agrees with it.
      status: 'danger',
      pace: { kind: 'no_spending' },
    });
    const someSpent = buildOverview({ ...input, plan: tight, categories: [] });
    expect(someSpent).toMatchObject({
      spentRappen: chf(25),
      balanceRappen: chf(-325),
      dailyAllowanceRappen: 0,
      status: 'danger',
      pace: { kind: 'exhausted' },
    });
  });

  it('colours the total like a category bar, and red whenever the balance is negative', () => {
    const statusAt = (uncategorizedSpentRappen: number, carriedOverRappen = 0) =>
      buildOverview({
        ...input,
        plan: { ...plan, carriedOverRappen },
        categories: [],
        uncategorizedSpentRappen,
      }).status;
    // 80 % of CHF 3'575 is CHF 2'860.
    expect(statusAt(chf(2859, 95))).toBe('ok');
    expect(statusAt(chf(2860))).toBe('warning');
    expect(statusAt(chf(3574, 95))).toBe('warning');
    expect(statusAt(chf(3575))).toBe('danger');
    expect(statusAt(chf(3575) + 1)).toBe('danger');
    // A deficit of CHF 3'675 carried over leaves CHF −100; a CHF 150 refund brings it to +50.
    expect(statusAt(0, chf(-3675))).toBe('danger');
    expect(statusAt(chf(-150), chf(-3675))).toBe('ok');
  });

  it('keeps the input order of the categories', () => {
    const reversed = [clothes, goingOut, eatingOut, groceries];
    expect(
      buildOverview({ ...input, categories: reversed }).categories.map((c) => c.categoryId),
    ).toEqual(['clothes', 'going_out', 'eating_out', 'groceries']);
  });

  it('does not pass extra fields of the input through', () => {
    const withExtra = { ...groceries, name: 'Lebensmittel' } as CategoryTotals;
    const [category] = buildOverview({ ...input, categories: [withExtra] }).categories;
    expect(category).not.toHaveProperty('name');
  });

  it('rejects duplicate categories, negative budgets and invalid amounts', () => {
    expect(() => buildOverview({ ...input, categories: [groceries, groceries] })).toThrow(
      /duplicate category id "groceries"/,
    );
    expect(() =>
      buildOverview({ ...input, categories: [{ ...groceries, budgetRappen: -1 }] }),
    ).toThrow(/budget of groceries must not be negative/);
    expect(() =>
      buildOverview({ ...input, categories: [{ ...groceries, spentRappen: 0.5 }] }),
    ).toThrow(/spent in groceries/);
    expect(() => buildOverview({ ...input, uncategorizedSpentRappen: 2.5 })).toThrow(
      /uncategorized spent/,
    );
    expect(() => buildOverview({ ...input, plan: { ...plan, incomeRappen: -1 } })).toThrow(
      /income/,
    );
  });

  it('rejects a today outside the period', () => {
    expect(() => buildOverview({ ...input, today: '2026-10-25' })).toThrow(/outside the period/);
    expect(() => buildOverview({ ...input, today: '2026-09-24' })).toThrow(RangeError);
  });

  it('throws instead of leaving the Rappen range', () => {
    const huge = (spentRappen: number): CategoryTotals => ({
      categoryId: `c${spentRappen}`,
      budgetRappen: MAX_ABS_RAPPEN,
      spentRappen,
    });
    expect(() => buildOverview({ ...input, categories: [huge(-MAX_ABS_RAPPEN)] })).toThrow(
      /remaining in c-10000000000/,
    );
    expect(() =>
      buildOverview({ ...input, categories: [huge(MAX_ABS_RAPPEN), huge(MAX_ABS_RAPPEN - 1)] }),
    ).toThrow(/spent must be/);
    expect(() =>
      buildOverview({
        ...input,
        plan: { incomeRappen: MAX_ABS_RAPPEN, fixedCostsRappen: 0, savingsRappen: 0 },
        categories: [],
        uncategorizedSpentRappen: -1,
      }),
    ).toThrow(/balance/);
  });
});
