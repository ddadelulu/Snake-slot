import { localDateIn, parseLocalDate, type Language, type LocalDate } from '@budget/core';

import { LOCALE } from '@/i18n/format';

/** Dates, times and foreign amounts of transactions, in the person's time zone and language. */

function utcNoon(date: LocalDate): Date {
  const { year, month, day } = parseLocalDate(date);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

/** The local day of an instant, e.g. for grouping a list by day. */
export function localDayOf(instant: string, timeZone: string): LocalDate {
  return localDateIn(new Date(instant), timeZone);
}

/** "14:05" in the person's time zone (24-hour clock in both languages). */
export function formatTime(instant: string, language: Language, timeZone: string): string {
  return new Intl.DateTimeFormat(LOCALE[language], {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).format(new Date(instant));
}

/** "Montag, 5. Oktober" / "Monday, 5 October" (with the year when asked). */
export function formatWeekdayDate(
  date: LocalDate,
  language: Language,
  options: { year?: boolean } = {},
): string {
  return new Intl.DateTimeFormat(LOCALE[language], {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(options.year ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  }).format(utcNoon(date));
}

/** "Mo., 5. Okt." / "Mon, 5 Oct", for compact lists such as the day picker. */
export function formatShortWeekdayDate(date: LocalDate, language: Language): string {
  return new Intl.DateTimeFormat(LOCALE[language], {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(utcNoon(date));
}

/** "HH:MM" of an instant in a time zone. */
export function localTimeOf(instant: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).formatToParts(new Date(instant));
  const part = (type: 'hour' | 'minute') => parts.find((p) => p.type === type)?.value ?? '00';
  return `${part('hour')}:${part('minute')}`;
}

/** Minutes the time zone is ahead of UTC at an instant (120 for Zurich in summer). */
function offsetMinutes(utcMillis: number, timeZone: string): number {
  const date = new Date(utcMillis);
  const local = localDateIn(date, timeZone);
  const [hours, minutes] = localTimeOf(date.toISOString(), timeZone).split(':').map(Number);
  const { year, month, day } = parseLocalDate(local);
  const asUtc = Date.UTC(year, month - 1, day, hours ?? 0, minutes ?? 0);
  return Math.round((asUtc - Math.floor(utcMillis / 60_000) * 60_000) / 60_000);
}

/**
 * The instant at which it is `time` ("HH:MM") on `date` in `timeZone`, as an ISO string. Used to
 * move a hand-typed purchase to another day while keeping its time of day. A time that does not
 * exist (the hour skipped when clocks go forward) lands an hour later, as clocks show it.
 */
export function instantAt(date: LocalDate, time: string, timeZone: string): string {
  const { year, month, day } = parseLocalDate(date);
  const [hours, minutes] = time.split(':').map(Number);
  const wall = Date.UTC(year, month - 1, day, hours ?? 0, minutes ?? 0);
  let guess = wall - offsetMinutes(wall, timeZone) * 60_000;
  // A second pass settles guesses that crossed a daylight-saving change.
  guess = wall - offsetMinutes(guess, timeZone) * 60_000;
  return new Date(guess).toISOString();
}

/**
 * A foreign amount from its minor units, e.g. 4500 EUR → "EUR 45.00", 1200 JPY → "JPY 1,200".
 * Digits come from the currency (Intl); the number is built from integers, never floats.
 */
export function formatForeignAmount(minor: number, currency: string, language: Language): string {
  let digits = 2;
  try {
    digits =
      new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
        .maximumFractionDigits ?? 2;
  } catch {
    // An unknown code: show it with two decimals, as most currencies have.
  }
  const abs = String(Math.abs(minor)).padStart(digits + 1, '0');
  const whole = abs.slice(0, abs.length - digits);
  const fraction = abs.slice(abs.length - digits);
  const separator = language === 'de' ? '’' : ',';
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
  return `${currency} ${digits > 0 ? `${grouped}.${fraction}` : grouped}`;
}
