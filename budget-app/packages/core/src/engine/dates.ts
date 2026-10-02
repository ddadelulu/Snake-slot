/**
 * Calendar dates without time or time zone ("2026-10-25"), with integer-only arithmetic.
 * Budget periods, paydays and "today" are all local dates; the conversion from an instant to a
 * local date happens once, at the edge, with `localDateIn`.
 */
export type LocalDate = string;

const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export type DateParts = { year: number; month: number; day: number };

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Splits a local date into its parts; throws for anything that is not a real calendar date. */
export function parseLocalDate(value: string): DateParts {
  const match = LOCAL_DATE.exec(value);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month)) {
      return { year, month, day };
    }
  }
  throw new RangeError(`"${value}" is not a calendar date in the form YYYY-MM-DD`);
}

export function isLocalDate(value: unknown): value is LocalDate {
  if (typeof value !== 'string') return false;
  try {
    parseLocalDate(value);
    return true;
  } catch {
    return false;
  }
}

export function formatLocalDate({ year, month, day }: DateParts): LocalDate {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Days since 1970-01-01 (Howard Hinnant's days_from_civil). Integer arithmetic only, valid for
 * every year this app will see.
 */
export function toDayNumber(date: LocalDate): number {
  const { year, month, day } = parseLocalDate(date);
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yearOfEra = y - era * 400;
  const monthIndex = month > 2 ? month - 3 : month + 9;
  const dayOfYear = Math.floor((153 * monthIndex + 2) / 5) + day - 1;
  const dayOfEra =
    yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146097 + dayOfEra - 719468;
}

/** The inverse of toDayNumber (civil_from_days). */
export function fromDayNumber(dayNumber: number): LocalDate {
  if (!Number.isSafeInteger(dayNumber)) throw new RangeError('day number must be an integer');
  const z = dayNumber + 719468;
  const era = Math.floor(z / 146097);
  const dayOfEra = z - era * 146097;
  const yearOfEra = Math.floor(
    (dayOfEra -
      Math.floor(dayOfEra / 1460) +
      Math.floor(dayOfEra / 36524) -
      Math.floor(dayOfEra / 146096)) /
      365,
  );
  const dayOfYear =
    dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const monthIndex = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * monthIndex + 2) / 5) + 1;
  const month = monthIndex < 10 ? monthIndex + 3 : monthIndex - 9;
  const year = yearOfEra + era * 400 + (month <= 2 ? 1 : 0);
  return formatLocalDate({ year, month, day });
}

export function addDays(date: LocalDate, days: number): LocalDate {
  if (!Number.isSafeInteger(days)) throw new RangeError('days must be an integer');
  return fromDayNumber(toDayNumber(date) + days);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: LocalDate, to: LocalDate): number {
  return toDayNumber(to) - toDayNumber(from);
}

export function compareLocalDates(a: LocalDate, b: LocalDate): -1 | 0 | 1 {
  const difference = daysBetween(b, a);
  return difference < 0 ? -1 : difference > 0 ? 1 : 0;
}

/** The calendar date an instant falls on in a time zone, e.g. Europe/Zurich. */
export function localDateIn(instant: Date, timeZone: string): LocalDate {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const part = (type: 'year' | 'month' | 'day') =>
    Number(parts.find((candidate) => candidate.type === type)?.value);
  return formatLocalDate({ year: part('year'), month: part('month'), day: part('day') });
}
