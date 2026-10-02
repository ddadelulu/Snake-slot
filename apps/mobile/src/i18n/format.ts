import { parseLocalDate, type Language, type LocalDate } from '@budget/core';

/** Locales used for dates: Swiss German and English as used in Switzerland. */
export const LOCALE: Record<Language, string> = { de: 'de-CH', en: 'en-CH' };

function utcDate(date: LocalDate): Date {
  const { year, month, day } = parseLocalDate(date);
  return new Date(Date.UTC(year, month - 1, day));
}

/** "25. Oktober" / "25 October". */
export function formatDayMonth(date: LocalDate, language: Language): string {
  return new Intl.DateTimeFormat(LOCALE[language], {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(utcDate(date));
}

/** "Juni 2027" / "June 2027". */
export function formatMonthYear(date: LocalDate, language: Language): string {
  return new Intl.DateTimeFormat(LOCALE[language], {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(utcDate(date));
}

/** "2. Okt." / "2 Oct" for transaction lists, from an ISO instant in the person's time zone. */
export function formatShortDate(instant: string, language: Language, timeZone: string): string {
  return new Intl.DateTimeFormat(LOCALE[language], {
    day: 'numeric',
    month: 'short',
    timeZone,
  }).format(new Date(instant));
}

/** The device's time zone, e.g. "Europe/Zurich" (used for the start of each budget month). */
export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Zurich';
  } catch {
    return 'Europe/Zurich';
  }
}
