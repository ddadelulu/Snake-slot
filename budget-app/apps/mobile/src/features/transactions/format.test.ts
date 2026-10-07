import {
  formatForeignAmount,
  formatShortWeekdayDate,
  formatTime,
  formatWeekdayDate,
  instantAt,
  localDayOf,
  localTimeOf,
} from './format';

describe('transaction dates', () => {
  it('finds the local day and time in the person’s time zone', () => {
    // 23:30 UTC on 4 October is already the 5th in Zurich (summer time, UTC+2).
    expect(localDayOf('2026-10-04T23:30:00Z', 'Europe/Zurich')).toBe('2026-10-05');
    expect(localTimeOf('2026-10-04T23:30:00Z', 'Europe/Zurich')).toBe('01:30');
    expect(formatTime('2026-10-05T12:05:00Z', 'de', 'Europe/Zurich')).toBe('14:05');
    expect(formatTime('2026-10-05T22:00:00Z', 'en', 'Europe/Zurich')).toBe('00:00');
  });

  it('writes weekday and date in both languages', () => {
    expect(formatWeekdayDate('2026-10-05', 'de')).toBe('Montag, 5. Oktober');
    expect(formatWeekdayDate('2026-10-05', 'en')).toBe('Monday, 5 October');
    expect(formatWeekdayDate('2026-10-05', 'en', { year: true })).toBe('Monday, 5 October 2026');
    expect(formatShortWeekdayDate('2026-10-05', 'de')).toMatch(/^Mo\.?, 5\. Okt\.?$/);
  });

  it('finds the instant of a local time, across daylight saving changes', () => {
    expect(instantAt('2026-10-05', '14:05', 'Europe/Zurich')).toBe('2026-10-05T12:05:00.000Z');
    expect(instantAt('2026-12-05', '14:05', 'Europe/Zurich')).toBe('2026-12-05T13:05:00.000Z');
    // Clocks go back on 25 October 2026: 14:05 that day is already winter time.
    expect(instantAt('2026-10-25', '14:05', 'Europe/Zurich')).toBe('2026-10-25T13:05:00.000Z');
    // 02:30 on 29 March 2026 does not exist in Zurich; it lands an hour later.
    expect(instantAt('2026-03-29', '02:30', 'Europe/Zurich')).toBe('2026-03-29T01:30:00.000Z');
  });
});

describe('formatForeignAmount', () => {
  it('uses the currency’s own decimals, from integers', () => {
    expect(formatForeignAmount(4500, 'EUR', 'en')).toBe('EUR 45.00');
    expect(formatForeignAmount(-123456, 'USD', 'de')).toBe('USD 1’234.56');
    expect(formatForeignAmount(5, 'GBP', 'en')).toBe('GBP 0.05');
    expect(formatForeignAmount(120000, 'JPY', 'en')).toBe('JPY 120,000');
  });
});
