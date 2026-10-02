import {
  addDays,
  compareLocalDates,
  daysBetween,
  daysInMonth,
  formatLocalDate,
  parseLocalDate,
  type LocalDate,
} from './dates';

/**
 * A budget "month" (spec section 4): from one payday up to, but not including, the next.
 * The database computes the same boundaries in `public.period_containing`; a parity test keeps
 * both in step.
 */
export type Period = { startsOn: LocalDate; endsOn: LocalDate };

export function assertPayday(payday: number): number {
  if (!Number.isInteger(payday) || payday < 1 || payday > 31) {
    throw new RangeError('payday must be a day of the month from 1 to 31');
  }
  return payday;
}

/**
 * The payday in a given month. A payday that the month does not have (the 31st in April, the
 * 30th in February) falls on the month's last day. Weekends do not move it: if the salary
 * arrives earlier, it is simply early.
 */
export function paydayIn(year: number, month: number, payday: number): LocalDate {
  assertPayday(payday);
  return formatLocalDate({ year, month, day: Math.min(payday, daysInMonth(year, month)) });
}

function shiftMonth(year: number, month: number, by: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + by;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/** The period a date belongs to. */
export function periodContaining(date: LocalDate, payday: number): Period {
  const { year, month } = parseLocalDate(date);
  const thisMonth = paydayIn(year, month, payday);
  if (compareLocalDates(date, thisMonth) >= 0) {
    const next = shiftMonth(year, month, 1);
    return { startsOn: thisMonth, endsOn: paydayIn(next.year, next.month, payday) };
  }
  const previous = shiftMonth(year, month, -1);
  return { startsOn: paydayIn(previous.year, previous.month, payday), endsOn: thisMonth };
}

/** The period that follows `period` (it starts on `period.endsOn`). */
export function nextPeriod(period: Period, payday: number): Period {
  return periodContaining(period.endsOn, payday);
}

export function isInPeriod(date: LocalDate, period: Period): boolean {
  return (
    compareLocalDates(date, period.startsOn) >= 0 && compareLocalDates(date, period.endsOn) < 0
  );
}

function assertInPeriod(today: LocalDate, period: Period): void {
  if (!isInPeriod(today, period)) {
    throw new RangeError(`${today} is outside the period ${period.startsOn}..${period.endsOn}`);
  }
}

/** Days left including today: 1 on the last day before payday. */
export function daysUntilPayday(today: LocalDate, period: Period): number {
  assertInPeriod(today, period);
  return daysBetween(today, period.endsOn);
}

/** Which day of the period today is: 1 on payday. */
export function dayOfPeriod(today: LocalDate, period: Period): number {
  assertInPeriod(today, period);
  return daysBetween(period.startsOn, today) + 1;
}

export function periodLength(period: Period): number {
  return daysBetween(period.startsOn, period.endsOn);
}

/** The last day of the period (the day before the next payday). */
export function lastDayOf(period: Period): LocalDate {
  return addDays(period.endsOn, -1);
}
