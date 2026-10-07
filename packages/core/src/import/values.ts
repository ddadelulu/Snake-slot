import { formatLocalDate, isLocalDate, type LocalDate } from '../engine/dates';
import { parseChf, type Rappen } from '../money';

/** A statement date: the local day, the time when the file states one, and its UTC offset. */
export type StatementDate = { date: LocalDate; time?: string; offset?: string };

const DATE_TIME = new RegExp(
  '^(?:(\\d{4})-(\\d{1,2})-(\\d{1,2})|(\\d{1,2})[./-](\\d{1,2})[./-](\\d{4}|\\d{2}))' +
    '(?:(?:T|\\s+)(\\d{1,2}):(\\d{2})(?::(\\d{2})(?:[.,]\\d+)?)?)?' +
    '\\s*(Z|[+-]\\d{2}:?\\d{2})?$',
  'i',
);
const TIME = /^(\d{1,2}):(\d{2})(?::(\d{2})(?:[.,]\d+)?)?$/;

/**
 * Reads the date formats of Swiss statement files: `30.09.2026`, `30.09.26`, `2026-09-30`,
 * `30/09/2026` and `30-09-2026` (always day before month, the Swiss order), optionally followed by
 * a time `14:23`, `14:23:05` or `00:00:00.0` (Raiffeisen) and an offset `Z` / `+02:00`. Two-digit
 * years are 2000-2069 (`26` = 2026) or 1970-1999. The date must exist (no 31.09.). A time of
 * exactly midnight is how exports print "no time" (`2026-09-30 00:00:00.0`), so it is dropped.
 * Returns null for anything else.
 */
export function parseStatementDate(text: string): StatementDate | null {
  const match = DATE_TIME.exec(text.trim());
  if (match === null) return null;
  let year: number;
  let month: number;
  let day: number;
  if (match[1] !== undefined) {
    year = Number(match[1]);
    month = Number(match[2]);
    day = Number(match[3]);
  } else {
    const yearText = match[6] as string;
    year = Number(yearText);
    if (yearText.length === 2) year += year < 70 ? 2000 : 1900;
    month = Number(match[5]);
    day = Number(match[4]);
  }
  const date = formatLocalDate({ year, month, day });
  if (!isLocalDate(date)) return null;
  if (match[7] === undefined) return { date };
  const time = clockTime(match[7], match[8] as string, match[9]);
  if (time === null) return null;
  if (time === '') return { date };
  const offset = match[10];
  if (offset === undefined) return { date, time };
  const normalized =
    offset.toUpperCase() === 'Z' ? 'Z' : `${offset.slice(0, 3)}:${offset.slice(-2)}`;
  return { date, time, offset: normalized };
}

/**
 * Reads a separate time column (UBS "Abschlusszeit"): `14:23`, `14:23:05`, `9:05`. Returns
 * `HH:MM[:SS]`, '' for midnight or an empty cell (no time), null when unreadable.
 */
export function parseStatementTime(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed === '') return '';
  const match = TIME.exec(trimmed);
  return match === null ? null : clockTime(match[1] as string, match[2] as string, match[3]);
}

function clockTime(hours: string, minutes: string, seconds: string | undefined): string | null {
  const h = Number(hours);
  const m = Number(minutes);
  const s = seconds === undefined ? 0 : Number(seconds);
  if (h > 23 || m > 59 || s > 59) return null;
  if (h === 0 && m === 0 && s === 0) return '';
  const hm = `${String(h).padStart(2, '0')}:${minutes}`;
  return seconds === undefined ? hm : `${hm}:${seconds}`;
}

/** The result of reading one amount cell. */
export type AmountCell =
  { kind: 'empty' } | { kind: 'invalid' } | { kind: 'value'; rappen: Rappen };

const EMPTY: AmountCell = { kind: 'empty' };
const INVALID: AmountCell = { kind: 'invalid' };

/**
 * Reads a CHF amount cell as Swiss banks print it, with `parseChf` (integer Rappen, never a
 * float): `-23.40`, `1'234.50`, `1.234,50`, `23.4`, and the sign conventions of accounting
 * exports: a trailing minus `23.40-` and parentheses `(23.40)` are negative, a trailing plus is
 * positive. A lone dash means empty.
 */
export function parseAmountCell(cell: string): AmountCell {
  let text = cell.trim();
  if (text === '' || /^[-–—]$/.test(text)) return EMPTY;
  let negative = false;
  const parentheses = /^\((.*)\)$/.exec(text);
  if (parentheses !== null) {
    negative = true;
    text = (parentheses[1] as string).trim();
  }
  const trailing = /^(.*\d)\s*([-−+])$/.exec(text);
  if (trailing !== null) {
    negative ||= trailing[2] !== '+';
    text = trailing[1] as string;
  }
  const value = parseChf(text);
  if (value === null) return INVALID;
  const rappen = negative ? -Math.abs(value) : value;
  return { kind: 'value', rappen: rappen === 0 ? 0 : rappen };
}

/** ISO 4217 currencies without minor units, or with three (all others have two). */
const EXPONENTS = new Map<string, number>([
  ['CLF', 4],
  ['UYW', 4],
]);
for (const code of ['BIF', 'CLP', 'DJF', 'GNF', 'ISK', 'JPY', 'KMF', 'KRW', 'PYG', 'RWF', 'UGX']) {
  EXPONENTS.set(code, 0);
}
for (const code of ['UYI', 'VND', 'VUV', 'XAF', 'XOF', 'XPF']) EXPONENTS.set(code, 0);
for (const code of ['BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND']) EXPONENTS.set(code, 3);

/** Minor-unit exponent of an ISO 4217 currency: 0 for JPY, 3 for KWD, 2 otherwise. */
export function currencyExponent(code: string): number {
  return EXPONENTS.get(code) ?? 2;
}

const DECIMAL = /^([+-]?)(\d+)(?:[.,](\d+))?$/;

/**
 * Parses a plain decimal (`25.00`, `-3500`, `12.345`, `1'250.5`) into integer minor units of a
 * currency with the given exponent, using string arithmetic only. Digits beyond the exponent must
 * be zeros (`23.400` is fine for CHF, `23.405` is not). Null when malformed or beyond 15 digits.
 */
export function parseDecimalMinor(text: string, exponent: number): number | null {
  const match = DECIMAL.exec(text.replace(/[\s'’]/g, '').replace('−', '-'));
  if (match === null) return null;
  const fraction = match[3] ?? '';
  if (/[1-9]/.test(fraction.slice(exponent))) return null;
  const digits = `${match[2]}${fraction.slice(0, exponent).padEnd(exponent, '0')}`.replace(
    /^0+(?=\d)/,
    '',
  );
  if (digits.length > 15) return null;
  const value = Number(digits);
  return match[1] === '-' && value !== 0 ? -value : value;
}

/** Collapses whitespace (including line breaks inside quoted CSV fields) and trims. */
export function cleanText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Cuts text to `max` characters without leaving half of a surrogate pair. */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  let cut = text.slice(0, max);
  const last = cut.charCodeAt(cut.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1);
  return cut.trimEnd();
}

/** The distinct non-empty texts in order, joined with "; " and cut to `max`; null when none. */
export function joinTexts(texts: readonly string[], max: number): string | null {
  const unique: string[] = [];
  for (const text of texts) if (text !== '' && !unique.includes(text)) unique.push(text);
  return unique.length === 0 ? null : truncate(unique.join('; '), max);
}

const IBAN = /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/;

/** The IBAN in a cell (`CH93 0000 0000 0000 0000 0` → `CH9300000000000000000`), or null. */
export function ibanIn(text: string): string | null {
  const compact = text.replace(/\s/g, '').toUpperCase();
  return IBAN.test(compact) ? compact : null;
}
