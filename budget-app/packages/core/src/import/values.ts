import { daysBetween, formatLocalDate, isLocalDate, type LocalDate } from '../engine/dates';
import { parseChf, type Rappen } from '../money';

/** A statement date: the local day, the time when the file states one, and its UTC offset. */
export type StatementDate = { date: LocalDate; time?: string; offset?: string };

/** How a file writes slash dates (`10/03/2026`): day first (Swiss) or month first (US exports). */
export type SlashOrder = 'day-first' | 'month-first';

export type StatementDateOptions = {
  /** The order of slash dates; day first when not given (see `slashOrderOf`). */
  slashOrder?: SlashOrder;
  /**
   * The text is an exact instant (camt `AccptncDtTm`, the moment of a card purchase): with an
   * offset, a time of midnight is kept instead of being read as "no time".
   */
  exactInstant?: boolean;
};

const DATE_TIME = new RegExp(
  '^(?:(\\d{4})-(\\d{1,2})-(\\d{1,2})|(\\d{1,2})([./-])(\\d{1,2})\\5(\\d{4}|\\d{2}))' +
    '(?:(?:T|\\s+)(\\d{1,2}):(\\d{2})(?::(\\d{2})(?:[.,]\\d+)?)?)?' +
    '\\s*(Z|[+-]\\d{2}:?\\d{2})?$',
  'i',
);
const TIME = /^(\d{1,2}):(\d{2})(?::(\d{2})(?:[.,]\d+)?)?$/;

/**
 * Reads the date formats of Swiss statement files: `30.09.2026`, `30.09.26`, `2026-09-30`,
 * `30/09/2026` and `30-09-2026` (day before month, the Swiss order; slash dates month first only
 * with `slashOrder: 'month-first'`), optionally followed by a time `14:23`, `14:23:05` or
 * `00:00:00.0` (Raiffeisen) and an offset `Z` / `+02:00`. Both separators must be the same.
 * Two-digit years are 2000-2069 (`26` = 2026) or 1970-1999. The date must exist (no 31.09.). A
 * time of exactly midnight is how exports print "no time" (`2026-09-30 00:00:00.0`), so it is
 * dropped, unless `exactInstant` is set and the text states an offset. Returns null for anything
 * else.
 */
export function parseStatementDate(
  text: string,
  options: StatementDateOptions = {},
): StatementDate | null {
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
    const yearText = match[7] as string;
    year = Number(yearText);
    if (yearText.length === 2) year += year < 70 ? 2000 : 1900;
    const monthFirst = match[5] === '/' && options.slashOrder === 'month-first';
    month = Number(monthFirst ? match[4] : match[6]);
    day = Number(monthFirst ? match[6] : match[4]);
  }
  const date = formatLocalDate({ year, month, day });
  if (!isLocalDate(date)) return null;
  if (match[8] === undefined) return { date };
  const offset = match[11];
  const keepMidnight = options.exactInstant === true && offset !== undefined;
  const time = clockTime(match[8], match[9] as string, match[10], keepMidnight);
  if (time === null) return null;
  if (time === '') return { date };
  if (offset === undefined) return { date, time };
  const normalized =
    offset.toUpperCase() === 'Z' ? 'Z' : `${offset.slice(0, 3)}:${offset.slice(-2)}`;
  return { date, time, offset: normalized };
}

const SLASH_DATE = /^(\d{1,2})\/(\d{1,2})\/(?:\d{4}|\d{2})(?!\d)/;

/**
 * The order of the slash dates in one date column: day first as soon as a first part is above 12
 * (`31/10/2026`), else month first when a second part is above 12 (`10/31/2026`, US exports),
 * else day first, the Swiss order. Cells in other formats do not count.
 */
export function slashOrderOf(cells: Iterable<string>): SlashOrder {
  let monthFirst = false;
  for (const cell of cells) {
    const match = SLASH_DATE.exec(cell.trim());
    if (match === null) continue;
    if (Number(match[1]) > 12) return 'day-first';
    if (Number(match[2]) > 12) monthFirst = true;
  }
  return monthFirst ? 'month-first' : 'day-first';
}

/**
 * Card, Twint and cash-withdrawal texts that state the day of the purchase: "Einkauf vom
 * 02.10.2026", "KAUF/DIENSTLEISTUNG VOM 02.10.2026", "Achat du …", "Acquisto del …", "Purchase
 * of …", "Bargeldbezug vom …". Up to two words may stand between the keyword and the preposition
 * ("Retrait d'espèces du …"); every part is bounded, so the match stays linear.
 */
const PURCHASE_DATE = new RegExp(
  '(?:^|[^a-z])' +
    '(?:einkauf|kauf|achat|acquisto|purchase|bargeldbezug|retrait|prelevamento|withdrawal)' +
    "(?:[/ ][a-z\\u00e0-\\u00ff'\u2019]{1,30}){0,2} (?:vom|du|del|of|on) " +
    '(\\d{4}-\\d{1,2}-\\d{1,2}|\\d{1,2}([./])\\d{1,2}\\2(?:\\d{4}|\\d{2}))(?!\\d)',
);
/** A purchase date further back than this is not the purchase of this booking. */
const PURCHASE_WINDOW_DAYS = 31;
/** The purchase phrase comes first; only this much of each text is searched. */
const PURCHASE_TEXT_MAX_LENGTH = 1000;

/**
 * The day of purchase a booking text states (see PURCHASE_DATE), when it is on or before the
 * booking day and at most 31 days earlier; null otherwise (D-043). Used when a file has no
 * purchase-date column, so a card purchase is dated as in camt.053 (`AccptncDtTm`). The first text
 * with such a phrase decides.
 */
export function purchaseDateIn(
  texts: readonly string[],
  booked: LocalDate,
  slashOrder: SlashOrder = 'day-first',
): LocalDate | null {
  for (const text of texts) {
    const match = PURCHASE_DATE.exec(text.slice(0, PURCHASE_TEXT_MAX_LENGTH).toLowerCase());
    if (match === null) continue;
    const purchase = parseStatementDate(match[1] as string, { slashOrder });
    if (purchase === null) return null;
    const days = daysBetween(purchase.date, booked);
    return days >= 0 && days <= PURCHASE_WINDOW_DAYS ? purchase.date : null;
  }
  return null;
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

function clockTime(
  hours: string,
  minutes: string,
  seconds: string | undefined,
  keepMidnight = false,
): string | null {
  const h = Number(hours);
  const m = Number(minutes);
  const s = seconds === undefined ? 0 : Number(seconds);
  if (h > 23 || m > 59 || s > 59) return null;
  if (h === 0 && m === 0 && s === 0 && !keepMidnight) return '';
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

const FOLD = new Map<string, string>();
for (const [letters, plain] of [
  ['àáâãäå', 'a'],
  ['ç', 'c'],
  ['èéêë', 'e'],
  ['ìíîï', 'i'],
  ['ñ', 'n'],
  ['òóôõöø', 'o'],
  ['ùúûü', 'u'],
  ['ýÿ', 'y'],
  ['ß', 'ss'],
  ['æ', 'ae'],
  ['œ', 'oe'],
] as const) {
  for (const letter of letters) FOLD.set(letter, plain);
}

/**
 * Compact key of a column name or marker: lower case, accents folded, no spaces or punctuation
 * ("Transaktions-Nr." → "transaktionsnr", "Data dell'operazione" → "datadelloperazione",
 * "Débit" → "debit").
 */
export function compactKey(text: string): string {
  let folded = '';
  for (const char of text.toLowerCase()) folded += FOLD.get(char) ?? char;
  return folded.replace(/[^a-z0-9]/g, '');
}

const CHF = /^(?:chf|s?fr)\.?$/i;

/** True for the ways Swiss files write francs in a currency cell: CHF, Fr., SFr. (any case). */
export function isChf(code: string): boolean {
  return CHF.test(code.trim());
}

/** Debit/credit markers (as compact keys): money out. */
const MONEY_OUT = new Set([
  's',
  'd',
  'dr',
  'debit',
  'soll',
  'belastung',
  'lastschrift',
  'dbit',
  'addebito',
  'dare',
]);
/** Debit/credit markers (as compact keys): money in. */
const MONEY_IN = new Set([
  'h',
  'c',
  'cr',
  'credit',
  'haben',
  'gutschrift',
  'crdt',
  'accredito',
  'avere',
]);

/**
 * The sign a debit/credit marker gives an amount: -1 for money out (S, D, DR, Debit, Soll,
 * Belastung, Lastschrift, DBIT, Débit, Addebito, Dare), 1 for money in (H, C, CR, Credit, Haben,
 * Gutschrift, CRDT, Crédit, Accredito, Avere), 0 for an empty cell and null for anything else.
 * Case, accents and punctuation do not matter ("d.", "CRÉDIT").
 */
export function directionSign(marker: string): -1 | 0 | 1 | null {
  const key = compactKey(marker);
  if (key === '') return 0;
  if (MONEY_OUT.has(key)) return -1;
  return MONEY_IN.has(key) ? 1 : null;
}

/**
 * Balance and total labels, as compact keys, optionally followed by a currency or by a date with
 * or without a preposition ("Schlusssaldo per 30.09.2026", "Saldo CHF", "Total:").
 */
const BALANCE_LABEL = new RegExp(
  '^(?:(?:anfangs|schluss|end|eroffnungs|alter|neuer)?saldo(?:vortrag)?|kontostand|' +
    '(?:gesamt)?(?:total|summe)|totale|' +
    '(?:opening|closing|starting|ending|final|new|old|available)?balance|' +
    'solde(?:initial|final|douverture|decloture|nouveau|ancien|precedent)?|' +
    'saldo(?:iniziale|finale|precedente|contabile|disponibile))' +
    '(?:chf)?(?:(?:per|am|vom|zum|au|du|al|del|on|at|asof)?\\d{6,8})?(?:chf)?$',
);

/**
 * True when a text is only a balance or total label ("Saldo", "Anfangssaldo", "Schlusssaldo",
 * "Kontostand", "Total", "Summe", "Balance", "Opening/Closing balance", "Solde", "Saldo
 * iniziale/finale", "Totale"), possibly with a currency or a date: a line with such a text is not
 * a booking.
 */
export function isBalanceLabel(text: string): boolean {
  return text.length <= 60 && BALANCE_LABEL.test(compactKey(text));
}
