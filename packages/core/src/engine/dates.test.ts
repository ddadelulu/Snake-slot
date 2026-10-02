import { describe, expect, it } from 'vitest';

import {
  addDays,
  compareLocalDates,
  daysBetween,
  daysInMonth,
  formatLocalDate,
  fromDayNumber,
  isLocalDate,
  localDateIn,
  parseLocalDate,
  toDayNumber,
} from './dates';

const MS_PER_DAY = 86_400_000;

describe('daysInMonth', () => {
  it('knows every month of a leap and a common year', () => {
    const common = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    const leap = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    expect(common.map((_, index) => daysInMonth(2026, index + 1))).toEqual(common);
    expect(leap.map((_, index) => daysInMonth(2024, index + 1))).toEqual(leap);
  });

  it('applies the century rules to February', () => {
    expect(daysInMonth(1900, 2)).toBe(28);
    expect(daysInMonth(2000, 2)).toBe(29);
    expect(daysInMonth(2100, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
  });
});

describe('parseLocalDate / isLocalDate / formatLocalDate', () => {
  it('splits a calendar date into numbers', () => {
    expect(parseLocalDate('2026-10-25')).toEqual({ year: 2026, month: 10, day: 25 });
    expect(parseLocalDate('2024-02-29')).toEqual({ year: 2024, month: 2, day: 29 });
  });

  it('rejects anything that is not a real date in the form YYYY-MM-DD', () => {
    const invalid = [
      '2026-02-29',
      '2025-02-29',
      '2024-02-30',
      '2026-04-31',
      '2026-13-01',
      '2026-00-10',
      '2026-10-00',
      '2026-10-32',
      '2026-1-1',
      '26-10-25',
      ' 2026-10-25',
      '2026-10-25T00:00',
      '25.10.2026',
      '',
    ];
    for (const value of invalid) {
      expect(() => parseLocalDate(value)).toThrow(RangeError);
      expect(isLocalDate(value)).toBe(false);
    }
  });

  it('only accepts strings as local dates', () => {
    expect(isLocalDate('2026-10-25')).toBe(true);
    for (const value of [20261025, null, undefined, new Date(0), { year: 2026 }]) {
      expect(isLocalDate(value)).toBe(false);
    }
  });

  it('pads every part', () => {
    expect(formatLocalDate({ year: 2026, month: 1, day: 5 })).toBe('2026-01-05');
    expect(formatLocalDate({ year: 987, month: 12, day: 31 })).toBe('0987-12-31');
  });
});

describe('toDayNumber / fromDayNumber', () => {
  it('counts days from 1970-01-01', () => {
    expect(toDayNumber('1970-01-01')).toBe(0);
    expect(toDayNumber('1969-12-31')).toBe(-1);
    expect(toDayNumber('2000-03-01')).toBe(11_017);
    expect(toDayNumber('2026-10-25')).toBe(20_751);
    expect(fromDayNumber(0)).toBe('1970-01-01');
    expect(fromDayNumber(-1)).toBe('1969-12-31');
    expect(fromDayNumber(20_751)).toBe('2026-10-25');
  });

  it('round-trips every day from 1900 to 2200 and agrees with the UTC calendar', () => {
    const first = toDayNumber('1900-01-01');
    const last = toDayNumber('2200-12-31');
    expect(first).toBe(Date.UTC(1900, 0, 1) / MS_PER_DAY);
    expect(last).toBe(Date.UTC(2200, 11, 31) / MS_PER_DAY);

    let { year, month, day } = { year: 1900, month: 1, day: 1 };
    for (let dayNumber = first; dayNumber <= last; dayNumber += 1) {
      const date = formatLocalDate({ year, month, day });
      expect(fromDayNumber(dayNumber)).toBe(date);
      expect(toDayNumber(date)).toBe(dayNumber);
      // Walk the calendar independently of the algorithm under test.
      day += 1;
      if (day > daysInMonth(year, month)) {
        day = 1;
        month += 1;
        if (month > 12) {
          month = 1;
          year += 1;
        }
      }
    }
    expect({ year, month, day }).toEqual({ year: 2201, month: 1, day: 1 });
  });

  it('checks the UTC calendar on the first of every month, 1900 to 2200', () => {
    for (let year = 1900; year <= 2200; year += 1) {
      for (let month = 1; month <= 12; month += 1) {
        const date = formatLocalDate({ year, month, day: 1 });
        expect(toDayNumber(date)).toBe(Date.UTC(year, month - 1, 1) / MS_PER_DAY);
      }
    }
  });

  it('rejects day numbers that are not integers', () => {
    expect(() => fromDayNumber(1.5)).toThrow(RangeError);
    expect(() => fromDayNumber(Number.NaN)).toThrow(RangeError);
    expect(() => fromDayNumber(Number.MAX_SAFE_INTEGER + 1)).toThrow(RangeError);
  });

  it('rejects invalid dates', () => {
    expect(() => toDayNumber('2026-02-30')).toThrow(RangeError);
  });
});

describe('addDays / daysBetween / compareLocalDates', () => {
  it('moves across month ends, leap days and the year change', () => {
    expect(addDays('2026-10-24', 1)).toBe('2026-10-25');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2025-02-28', 1)).toBe('2025-03-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
    expect(addDays('2026-10-25', 0)).toBe('2026-10-25');
    expect(addDays('2026-09-25', 365)).toBe('2027-09-25');
    expect(addDays('2024-01-01', 366)).toBe('2025-01-01');
  });

  it('rejects day counts that are not integers', () => {
    expect(() => addDays('2026-10-25', 0.5)).toThrow(RangeError);
    expect(() => addDays('2026-10-25', Number.NaN)).toThrow(RangeError);
  });

  it('counts whole days, negative when going back', () => {
    expect(daysBetween('2026-09-25', '2026-10-25')).toBe(30);
    expect(daysBetween('2026-10-25', '2026-11-25')).toBe(31);
    expect(daysBetween('2024-02-25', '2024-03-25')).toBe(29);
    expect(daysBetween('2025-02-25', '2025-03-25')).toBe(28);
    expect(daysBetween('2026-12-25', '2027-01-25')).toBe(31);
    expect(daysBetween('2026-10-25', '2026-09-25')).toBe(-30);
    expect(daysBetween('2026-10-25', '2026-10-25')).toBe(0);
  });

  it('orders dates', () => {
    expect(compareLocalDates('2026-10-24', '2026-10-25')).toBe(-1);
    expect(compareLocalDates('2026-10-25', '2026-10-25')).toBe(0);
    expect(compareLocalDates('2027-01-01', '2026-12-31')).toBe(1);
    const shuffled = ['2026-12-31', '2024-02-29', '2027-01-01', '2026-10-25', '1999-12-31'];
    expect([...shuffled].sort(compareLocalDates)).toEqual([...shuffled].sort());
  });
});

describe('localDateIn', () => {
  it('converts an instant to the calendar date in Zurich', () => {
    // 22:30 UTC on 24 October is 00:30 on payday (25 October) in Zurich (summer time, UTC+2).
    const instant = new Date('2026-10-24T22:30:00Z');
    expect(localDateIn(instant, 'Europe/Zurich')).toBe('2026-10-25');
    expect(localDateIn(instant, 'UTC')).toBe('2026-10-24');
  });

  it('follows daylight saving time and the year change', () => {
    // Winter time (UTC+1): 23:30 UTC is already the next day in Zurich.
    expect(localDateIn(new Date('2026-12-31T23:30:00Z'), 'Europe/Zurich')).toBe('2027-01-01');
    expect(localDateIn(new Date('2026-12-31T22:59:59Z'), 'Europe/Zurich')).toBe('2026-12-31');
    // Summer time ends on 25 October 2026 at 03:00 local time.
    expect(localDateIn(new Date('2026-10-25T21:59:59Z'), 'Europe/Zurich')).toBe('2026-10-25');
    expect(localDateIn(new Date('2026-10-25T23:00:00Z'), 'Europe/Zurich')).toBe('2026-10-26');
    expect(localDateIn(new Date('2024-02-29T12:00:00Z'), 'Europe/Zurich')).toBe('2024-02-29');
  });

  it('rejects unknown time zones and invalid instants', () => {
    expect(() => localDateIn(new Date(0), 'Mars/Olympus_Mons')).toThrow(RangeError);
    expect(() => localDateIn(new Date(Number.NaN), 'Europe/Zurich')).toThrow(RangeError);
  });
});
