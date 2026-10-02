import { describe, expect, it } from 'vitest';

import { addDays, daysInMonth, fromDayNumber, parseLocalDate, toDayNumber } from './dates';
import {
  assertPayday,
  dayOfPeriod,
  daysUntilPayday,
  isInPeriod,
  lastDayOf,
  nextPeriod,
  paydayIn,
  periodContaining,
  periodLength,
  type Period,
} from './period';

const october: Period = { startsOn: '2026-09-25', endsOn: '2026-10-25' };

describe('assertPayday', () => {
  it('accepts the days 1 to 31', () => {
    expect(assertPayday(1)).toBe(1);
    expect(assertPayday(25)).toBe(25);
    expect(assertPayday(31)).toBe(31);
  });

  it('rejects anything else', () => {
    for (const payday of [0, 32, -1, 25.5, Number.NaN]) {
      expect(() => assertPayday(payday)).toThrow(RangeError);
    }
  });
});

describe('paydayIn', () => {
  it('is the payday when the month has that day', () => {
    expect(paydayIn(2026, 10, 25)).toBe('2026-10-25');
    expect(paydayIn(2026, 1, 31)).toBe('2026-01-31');
    expect(paydayIn(2024, 2, 29)).toBe('2024-02-29');
  });

  it("falls on the month's last day when the month is shorter", () => {
    expect(paydayIn(2026, 4, 31)).toBe('2026-04-30');
    expect(paydayIn(2025, 2, 29)).toBe('2025-02-28');
    expect(paydayIn(2025, 2, 30)).toBe('2025-02-28');
    expect(paydayIn(2025, 2, 31)).toBe('2025-02-28');
    expect(paydayIn(2024, 2, 30)).toBe('2024-02-29');
    expect(paydayIn(2024, 2, 31)).toBe('2024-02-29');
  });

  it('rejects invalid paydays', () => {
    expect(() => paydayIn(2026, 10, 0)).toThrow(RangeError);
  });
});

describe('periodContaining', () => {
  it('runs from payday up to the next payday (payday 25)', () => {
    expect(periodContaining('2026-10-02', 25)).toEqual(october);
    expect(periodContaining('2026-09-25', 25)).toEqual(october);
    // The last day before payday still belongs to the old period; payday starts the new one.
    expect(periodContaining('2026-10-24', 25)).toEqual(october);
    expect(periodContaining('2026-10-25', 25)).toEqual({
      startsOn: '2026-10-25',
      endsOn: '2026-11-25',
    });
  });

  it('crosses the year change', () => {
    const december = { startsOn: '2026-12-25', endsOn: '2027-01-25' };
    expect(periodContaining('2026-12-25', 25)).toEqual(december);
    expect(periodContaining('2026-12-31', 25)).toEqual(december);
    expect(periodContaining('2027-01-01', 25)).toEqual(december);
    expect(periodContaining('2027-01-24', 25)).toEqual(december);
    expect(periodContaining('2026-01-10', 25)).toEqual({
      startsOn: '2025-12-25',
      endsOn: '2026-01-25',
    });
  });

  it('starts on the first for payday 1', () => {
    expect(periodContaining('2026-10-01', 1)).toEqual({
      startsOn: '2026-10-01',
      endsOn: '2026-11-01',
    });
    expect(periodContaining('2026-12-31', 1)).toEqual({
      startsOn: '2026-12-01',
      endsOn: '2027-01-01',
    });
  });

  it('clamps paydays 29 to 31 in February of a common year', () => {
    for (const payday of [29, 30, 31]) {
      expect(periodContaining('2025-02-28', payday)).toEqual({
        startsOn: '2025-02-28',
        endsOn: `2025-03-${payday}`,
      });
      expect(periodContaining('2025-02-27', payday)).toEqual({
        startsOn: `2025-01-${payday}`,
        endsOn: '2025-02-28',
      });
    }
  });

  it('clamps paydays 30 and 31 in February of a leap year, but not 29', () => {
    expect(periodContaining('2024-02-28', 29)).toEqual({
      startsOn: '2024-01-29',
      endsOn: '2024-02-29',
    });
    for (const payday of [29, 30, 31]) {
      expect(periodContaining('2024-02-29', payday)).toEqual({
        startsOn: '2024-02-29',
        endsOn: `2024-03-${payday}`,
      });
    }
  });

  it('ends on a clamped payday (payday 31: January to February, then April)', () => {
    expect(periodContaining('2026-01-31', 31)).toEqual({
      startsOn: '2026-01-31',
      endsOn: '2026-02-28',
    });
    expect(periodContaining('2026-03-15', 31)).toEqual({
      startsOn: '2026-02-28',
      endsOn: '2026-03-31',
    });
    expect(periodContaining('2026-04-30', 31)).toEqual({
      startsOn: '2026-04-30',
      endsOn: '2026-05-31',
    });
    expect(periodContaining('2026-04-29', 31)).toEqual({
      startsOn: '2026-03-31',
      endsOn: '2026-04-30',
    });
  });

  it('rejects invalid dates and paydays', () => {
    expect(() => periodContaining('2026-02-30', 25)).toThrow(RangeError);
    expect(() => periodContaining('2026-10-02', 32)).toThrow(RangeError);
  });

  it('holds for every payday and every date of 2024 to 2026', () => {
    const first = toDayNumber('2024-01-01');
    const last = toDayNumber('2026-12-31');
    const isPaydayOf = (date: string, payday: number) => {
      const { year, month } = parseLocalDate(date);
      return paydayIn(year, month, payday) === date;
    };
    for (let payday = 1; payday <= 31; payday += 1) {
      for (let dayNumber = first; dayNumber <= last; dayNumber += 1) {
        const date = fromDayNumber(dayNumber);
        const period = periodContaining(date, payday);
        expect(isInPeriod(date, period)).toBe(true);
        expect(isPaydayOf(period.startsOn, payday)).toBe(true);
        expect(isPaydayOf(period.endsOn, payday)).toBe(true);
        // One payday per month: the period ends in the month after it starts.
        const start = parseLocalDate(period.startsOn);
        const end = parseLocalDate(period.endsOn);
        expect((end.year * 12 + end.month) - (start.year * 12 + start.month)).toBe(1);
        expect(periodLength(period)).toBeGreaterThanOrEqual(28);
        expect(periodLength(period)).toBeLessThanOrEqual(31);
        expect(dayOfPeriod(date, period) + daysUntilPayday(date, period)).toBe(
          periodLength(period) + 1,
        );
        const next = nextPeriod(period, payday);
        expect(next.startsOn).toBe(period.endsOn);
        expect(isInPeriod(period.endsOn, next)).toBe(true);
        expect(isInPeriod(lastDayOf(period), period)).toBe(true);
        expect(isInPeriod(lastDayOf(period), next)).toBe(false);
      }
    }
  });
});

describe('nextPeriod', () => {
  it('chains contiguous periods through a whole year', () => {
    let period = periodContaining('2026-01-31', 31);
    const starts: string[] = [];
    for (let i = 0; i < 13; i += 1) {
      starts.push(period.startsOn);
      period = nextPeriod(period, 31);
    }
    expect(starts).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
      '2026-05-31',
      '2026-06-30',
      '2026-07-31',
      '2026-08-31',
      '2026-09-30',
      '2026-10-31',
      '2026-11-30',
      '2026-12-31',
      '2027-01-31',
    ]);
  });

  it('follows the period of payday 25', () => {
    expect(nextPeriod(october, 25)).toEqual({ startsOn: '2026-10-25', endsOn: '2026-11-25' });
  });
});

describe('isInPeriod', () => {
  it('includes payday and excludes the next payday', () => {
    expect(isInPeriod('2026-09-25', october)).toBe(true);
    expect(isInPeriod('2026-10-24', october)).toBe(true);
    expect(isInPeriod('2026-10-25', october)).toBe(false);
    expect(isInPeriod('2026-09-24', october)).toBe(false);
  });
});

describe('daysUntilPayday / dayOfPeriod', () => {
  it('counts today on both sides', () => {
    expect(daysUntilPayday('2026-09-25', october)).toBe(30);
    expect(dayOfPeriod('2026-09-25', october)).toBe(1);
    expect(daysUntilPayday('2026-10-02', october)).toBe(23);
    expect(dayOfPeriod('2026-10-02', october)).toBe(8);
    // The last day before payday: one day left, the 30th day of the period.
    expect(daysUntilPayday('2026-10-24', october)).toBe(1);
    expect(dayOfPeriod('2026-10-24', october)).toBe(30);
  });

  it('rejects days outside the period', () => {
    expect(() => daysUntilPayday('2026-10-25', october)).toThrow(/outside the period/);
    expect(() => daysUntilPayday('2026-09-24', october)).toThrow(RangeError);
    expect(() => dayOfPeriod('2026-10-25', october)).toThrow(RangeError);
    expect(() => dayOfPeriod('2026-09-24', october)).toThrow(RangeError);
  });
});

describe('periodLength / lastDayOf', () => {
  it('measures periods of 28 to 31 days', () => {
    expect(periodLength(october)).toBe(30);
    expect(periodLength({ startsOn: '2026-01-31', endsOn: '2026-02-28' })).toBe(28);
    expect(periodLength({ startsOn: '2024-01-31', endsOn: '2024-02-29' })).toBe(29);
    expect(periodLength({ startsOn: '2026-12-25', endsOn: '2027-01-25' })).toBe(31);
  });

  it('ends the day before payday', () => {
    expect(lastDayOf(october)).toBe('2026-10-24');
    expect(lastDayOf({ startsOn: '2024-01-31', endsOn: '2024-02-29' })).toBe('2024-02-28');
    expect(lastDayOf({ startsOn: '2026-12-01', endsOn: '2027-01-01' })).toBe('2026-12-31');
    expect(addDays(lastDayOf(october), 1)).toBe(october.endsOn);
  });

  it('has the right length for every month of a leap year (payday 1)', () => {
    for (let month = 1; month <= 12; month += 1) {
      const start = paydayIn(2024, month, 1);
      expect(periodLength(periodContaining(start, 1))).toBe(daysInMonth(2024, month));
    }
  });
});
