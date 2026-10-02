import { describe, expect, it } from 'vitest';

import { MAX_ABS_RAPPEN, chf } from '../money';
import { addDays, daysBetween } from './dates';
import { forecastPace } from './pace';
import { periodLength, type Period } from './period';

// Payday 25: the period runs from 25 September to 24 October 2026 (30 days).
const period: Period = { startsOn: '2026-09-25', endsOn: '2026-10-25' };
const today = '2026-10-02'; // day 8

describe('forecastPace', () => {
  it('has no rate before anything is spent', () => {
    expect(forecastPace({ budgetRappen: chf(600), spentRappen: 0, period, today })).toEqual({
      kind: 'no_spending',
    });
    expect(forecastPace({ budgetRappen: 0, spentRappen: 0, period, today })).toEqual({
      kind: 'no_spending',
    });
  });

  it('treats net refunds as no spending', () => {
    expect(
      forecastPace({ budgetRappen: chf(250), spentRappen: chf(-49, 90), period, today }),
    ).toEqual({ kind: 'no_spending' });
  });

  it('is exhausted once the budget is used up', () => {
    for (const spentRappen of [chf(600), chf(600) + 1, chf(900)]) {
      expect(forecastPace({ budgetRappen: chf(600), spentRappen, period, today })).toEqual({
        kind: 'exhausted',
      });
    }
    // A category without a budget is exhausted by the first purchase.
    expect(forecastPace({ budgetRappen: 0, spentRappen: 5, period, today })).toEqual({
      kind: 'exhausted',
    });
  });

  it('forecasts the day the money runs out at the current rate', () => {
    // CHF 240 of 600 after 8 days is CHF 30 a day: CHF 600 is reached on day 20, 14 October.
    expect(forecastPace({ budgetRappen: chf(600), spentRappen: chf(240), period, today })).toEqual({
      kind: 'runs_out',
      on: '2026-10-14',
    });
  });

  it('rounds the run-out day up: the budget is reached on that day, not before', () => {
    // CHF 250 in 8 days: day 19.2, so the money still lasts through day 19 and runs out on day 20.
    expect(forecastPace({ budgetRappen: chf(600), spentRappen: chf(250), period, today })).toEqual({
      kind: 'runs_out',
      on: '2026-10-14',
    });
  });

  it('is on track when the money lasts until payday', () => {
    expect(forecastPace({ budgetRappen: chf(600), spentRappen: chf(100), period, today })).toEqual({
      kind: 'on_track',
    });
  });

  it('runs out on the last day before payday, but is on track one day later', () => {
    // CHF 80 a day for 8 days against CHF 300: day 30, the last day of the period.
    expect(forecastPace({ budgetRappen: chf(300), spentRappen: chf(80), period, today })).toEqual({
      kind: 'runs_out',
      on: '2026-10-24',
    });
    // Day 31 would be payday itself, which belongs to the next period.
    expect(forecastPace({ budgetRappen: chf(310), spentRappen: chf(80), period, today })).toEqual({
      kind: 'on_track',
    });
    // Day 30.001 rounds up to day 31.
    expect(
      forecastPace({ budgetRappen: chf(300) + 1, spentRappen: chf(80), period, today }),
    ).toEqual({ kind: 'on_track' });
  });

  it('works on payday and on the last day of the period', () => {
    // Payday (day 1): CHF 50 spent of 600 → day 12.
    expect(
      forecastPace({ budgetRappen: chf(600), spentRappen: chf(50), period, today: '2026-09-25' }),
    ).toEqual({ kind: 'runs_out', on: '2026-10-06' });
    // Last day (day 30) with money left: it lasts until payday.
    expect(
      forecastPace({ budgetRappen: chf(600), spentRappen: chf(590), period, today: '2026-10-24' }),
    ).toEqual({ kind: 'on_track' });
  });

  it('handles a February period whose payday was clamped', () => {
    // Payday 31 in a common year: 31 January to 27 February (28 days).
    const february: Period = { startsOn: '2026-01-31', endsOn: '2026-02-28' };
    expect(
      forecastPace({
        budgetRappen: chf(280),
        spentRappen: chf(100),
        period: february,
        today: '2026-02-09', // day 10: CHF 10 a day, CHF 280 on day 28
      }),
    ).toEqual({ kind: 'runs_out', on: '2026-02-27' });
  });

  it('stays exact for extreme amounts', () => {
    expect(
      forecastPace({ budgetRappen: MAX_ABS_RAPPEN, spentRappen: 1, period, today: '2026-10-24' }),
    ).toEqual({ kind: 'on_track' });
    expect(
      forecastPace({
        budgetRappen: MAX_ABS_RAPPEN,
        spentRappen: MAX_ABS_RAPPEN - 1,
        period,
        today: '2026-09-25',
      }),
    ).toEqual({ kind: 'runs_out', on: '2026-09-26' });
  });

  it('agrees with the cumulative spending on the forecast day (property)', () => {
    const length = periodLength(period);
    for (let elapsed = 1; elapsed <= length; elapsed += 1) {
      const day = addDays(period.startsOn, elapsed - 1);
      for (const budgetRappen of [1, 99, chf(600), chf(3575), 987_654_321]) {
        for (const spentRappen of [1, 7, 333, chf(240), chf(599, 95), 123_456_789]) {
          const forecast = forecastPace({ budgetRappen, spentRappen, period, today: day });
          if (spentRappen >= budgetRappen) {
            expect(forecast.kind).toBe('exhausted');
            continue;
          }
          // Spending reaches the budget on day d when d × spent ≥ budget × elapsed.
          const reaches = (d: number) => d * spentRappen >= budgetRappen * elapsed;
          if (forecast.kind === 'runs_out') {
            const d = daysBetween(period.startsOn, forecast.on) + 1;
            expect(d).toBeGreaterThan(elapsed);
            expect(d).toBeLessThanOrEqual(length);
            expect(reaches(d)).toBe(true);
            expect(reaches(d - 1)).toBe(false);
          } else {
            expect(forecast.kind).toBe('on_track');
            expect(reaches(length)).toBe(false);
          }
        }
      }
    }
  });

  it('rejects negative budgets and amounts that are not Rappen', () => {
    expect(() => forecastPace({ budgetRappen: -1, spentRappen: 0, period, today })).toThrow(
      /budget must not be negative/,
    );
    expect(() => forecastPace({ budgetRappen: 100, spentRappen: 0.5, period, today })).toThrow(
      /spent/,
    );
  });

  it('rejects days outside the period, even without spending', () => {
    for (const day of ['2026-09-24', '2026-10-25']) {
      expect(() =>
        forecastPace({ budgetRappen: chf(600), spentRappen: 0, period, today: day }),
      ).toThrow(/outside the period/);
    }
  });
});
