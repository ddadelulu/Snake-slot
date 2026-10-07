import { parseLocalDate, type Language, type LocalDate } from '@budget/core';

import { LOCALE } from '@/i18n/format';

function utcNoon(date: LocalDate): Date {
  const { year, month, day } = parseLocalDate(date);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

/** "Mi., 30. Sept." / "Wed, 30 Sept", for the lines of the import preview. */
export function formatRowDay(date: LocalDate, language: Language): string {
  return new Intl.DateTimeFormat(LOCALE[language], {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(utcNoon(date));
}

/** "30. September 2026" / "30 September 2026", for the period of a statement. */
export function formatFullDate(date: LocalDate, language: Language): string {
  return new Intl.DateTimeFormat(LOCALE[language], {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(utcNoon(date));
}

/** The calendar day of an instant in a time zone, formatted like `formatFullDate`. */
export function formatInstantDate(instant: string, language: Language, timeZone: string): string {
  return new Intl.DateTimeFormat(LOCALE[language], {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone,
  }).format(new Date(instant));
}

/** "30 Sept" of an instant in a time zone, for the transaction a line matches. */
export function formatInstantDay(instant: string, language: Language, timeZone: string): string {
  return new Intl.DateTimeFormat(LOCALE[language], {
    day: 'numeric',
    month: 'short',
    timeZone,
  }).format(new Date(instant));
}
