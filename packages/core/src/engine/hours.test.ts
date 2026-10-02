import { describe, expect, it } from 'vitest';

import { MAX_ABS_RAPPEN, chf } from '../money';
import { MAX_WEEKLY_WORK_MINUTES, minutesOfWork } from './hours';

// CHF 6'500 net a month for 42 hours a week: CHF 6'500 / 182 h ≈ CHF 35.71 an hour.
const income = { netIncomeRappen: chf(6500), weeklyWorkMinutes: 42 * 60 };

describe('minutesOfWork', () => {
  it('converts an amount into minutes of work', () => {
    // CHF 84 / CHF 35.71 an hour = 2.35 h = 141.1 minutes.
    expect(minutesOfWork(chf(84), income)).toBe(141);
    // CHF 1'850 rent: 51.8 hours.
    expect(minutesOfWork(chf(1850), income)).toBe(3108);
    expect(minutesOfWork(chf(4, 20), income)).toBe(7);
  });

  it('handles fractional hours per week (42.5 h = 2550 minutes)', () => {
    // CHF 100 × 2550 × 52 / (CHF 6'500 × 12) = exactly 170 minutes.
    expect(minutesOfWork(chf(100), { ...income, weeklyWorkMinutes: 2550 })).toBe(170);
  });

  it('counts refunds like purchases and 0 as no time', () => {
    expect(minutesOfWork(chf(-84), income)).toBe(141);
    expect(minutesOfWork(0, income)).toBe(0);
  });

  it('rounds half up', () => {
    // 1 Rappen × 12 min × 52 / (104 Rappen × 12) = 0.5 → 1; 3 Rappen → 1.5 → 2.
    expect(minutesOfWork(1, { netIncomeRappen: 104, weeklyWorkMinutes: 12 })).toBe(1);
    expect(minutesOfWork(3, { netIncomeRappen: 104, weeklyWorkMinutes: 12 })).toBe(2);
    // 3120 / 6240 = 0.5 → 1; 3120 / 6252 ≈ 0.499 → 0.
    expect(minutesOfWork(1, { netIncomeRappen: 520, weeklyWorkMinutes: 60 })).toBe(1);
    expect(minutesOfWork(1, { netIncomeRappen: 521, weeklyWorkMinutes: 60 })).toBe(0);
  });

  it('stays exact at the largest amounts and working times', () => {
    expect(
      minutesOfWork(MAX_ABS_RAPPEN, { netIncomeRappen: 1, weeklyWorkMinutes: MAX_WEEKLY_WORK_MINUTES }),
    ).toBe(291_200_000_000_000);
    expect(
      minutesOfWork(-MAX_ABS_RAPPEN, {
        netIncomeRappen: MAX_ABS_RAPPEN,
        weeklyWorkMinutes: MAX_WEEKLY_WORK_MINUTES,
      }),
    ).toBe(29_120);
  });

  it('matches exact BigInt arithmetic (property)', () => {
    const amounts = [1, 5, 99, chf(4, 20), chf(84), chf(1850), 123_456_789, MAX_ABS_RAPPEN];
    const incomes = [1, 7, chf(3200), chf(6500), chf(12_345, 67), MAX_ABS_RAPPEN];
    const weeklyMinutes = [1, 60, 1_234, 2_520, 2_550, MAX_WEEKLY_WORK_MINUTES];
    for (const amount of amounts) {
      for (const netIncomeRappen of incomes) {
        for (const weeklyWorkMinutes of weeklyMinutes) {
          const numerator = BigInt(amount) * BigInt(weeklyWorkMinutes) * 52n;
          const denominator = BigInt(netIncomeRappen) * 12n;
          const expected = Number((2n * numerator + denominator) / (2n * denominator));
          expect(minutesOfWork(amount, { netIncomeRappen, weeklyWorkMinutes })).toBe(expected);
        }
      }
    }
  });

  it('is null without an income or a working time', () => {
    expect(minutesOfWork(chf(84), { ...income, netIncomeRappen: null })).toBeNull();
    expect(minutesOfWork(chf(84), { ...income, weeklyWorkMinutes: null })).toBeNull();
    expect(minutesOfWork(chf(84), { netIncomeRappen: null, weeklyWorkMinutes: null })).toBeNull();
    expect(minutesOfWork(chf(84), { ...income, netIncomeRappen: 0 })).toBeNull();
    expect(minutesOfWork(chf(84), { ...income, netIncomeRappen: -1 })).toBeNull();
    expect(minutesOfWork(chf(84), { ...income, weeklyWorkMinutes: 0 })).toBeNull();
    expect(minutesOfWork(chf(84), { ...income, weeklyWorkMinutes: -60 })).toBeNull();
  });

  it('rejects invalid amounts, incomes and working times', () => {
    expect(() => minutesOfWork(84.5, income)).toThrow(/amount/);
    expect(() => minutesOfWork(MAX_ABS_RAPPEN + 1, income)).toThrow(RangeError);
    expect(() => minutesOfWork(chf(84), { ...income, netIncomeRappen: 6500.5 })).toThrow(
      /net income/,
    );
    for (const weeklyWorkMinutes of [2520.5, Number.NaN, MAX_WEEKLY_WORK_MINUTES + 1]) {
      expect(() => minutesOfWork(chf(84), { ...income, weeklyWorkMinutes })).toThrow(
        /weekly work minutes/,
      );
    }
  });
});
