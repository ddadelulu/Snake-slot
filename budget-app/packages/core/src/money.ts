import type { Language } from './constants';

/**
 * Money is always an integer number of Rappen (1 CHF = 100 Rappen). Never a float, never a
 * string. Values are JavaScript numbers that must be safe integers; the database stores them as
 * `bigint` with the same bounds (see MAX_ABS_RAPPEN).
 */
export type Rappen = number;

export const RAPPEN_PER_FRANC = 100;

/**
 * Largest absolute amount accepted anywhere (CHF 100 million). Mirrored by CHECK constraints in
 * the database. Keeps every sum of a month's money far inside Number.MAX_SAFE_INTEGER.
 */
export const MAX_ABS_RAPPEN = 10_000_000_000;

export function isRappen(value: unknown): value is Rappen {
  return (
    typeof value === 'number' && Number.isSafeInteger(value) && Math.abs(value) <= MAX_ABS_RAPPEN
  );
}

export function assertRappen(value: number, label = 'amount'): Rappen {
  if (!isRappen(value)) {
    throw new RangeError(`${label} must be an integer number of Rappen within ±${MAX_ABS_RAPPEN}`);
  }
  return value === 0 ? 0 : value; // normalise -0
}

/** Builds an amount from whole francs and Rappen, e.g. `chf(12, 50)` is CHF 12.50. */
export function chf(francs: number, rappen = 0): Rappen {
  if (!Number.isSafeInteger(francs) || !Number.isSafeInteger(rappen) || rappen < 0 || rappen > 99) {
    throw new RangeError('chf() takes integer francs and 0..99 Rappen');
  }
  const sign = francs < 0 || Object.is(francs, -0) ? -1 : 1;
  return assertRappen(francs * RAPPEN_PER_FRANC + sign * rappen);
}

/** Sum of amounts; throws instead of silently losing precision. */
export function sumRappen(values: Iterable<Rappen>): Rappen {
  let total = 0;
  for (const value of values) {
    assertRappen(value);
    total += value;
    if (!Number.isSafeInteger(total)) throw new RangeError('sum exceeds the safe integer range');
  }
  return total === 0 ? 0 : total;
}

/**
 * Exact floor division of integers, without relying on floating-point rounding: `a % b` is exact
 * for safe integers and `a - a % b` is an exact multiple of `b`, so dividing it is exact too. The
 * quotient then moves down by one when the remainder and the divisor have opposite signs.
 */
export function floorDiv(a: number, b: number): number {
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) || b === 0) {
    throw new RangeError('floorDiv() takes safe integers and a non-zero divisor');
  }
  const remainder = a % b;
  let q = (a - remainder) / b;
  if (remainder !== 0 && (remainder < 0) !== (b < 0)) q -= 1;
  return q === 0 ? 0 : q;
}

const SPACES = /[\s   ]/g;
const APOSTROPHES = /['’ʼ]/g;
const ROUND_SUFFIX = /[.,][-–—]$/; // Swiss price notation: "12.–" means CHF 12.00
const LEADING_SIGN = /^([-−+])/;

/**
 * Parses what a person types or a source prints into Rappen, without floating point.
 *
 * Accepts: `12`, `12.5`, `12.50`, `12,50`, `.50`, `1'240.50`, `1’240.50`, `1,240.50`,
 * `1.240,50`, `1 240.50`, `12.–`, `CHF 12.50`, `12.50 CHF`, `-12.50`.
 * Returns `null` for anything ambiguous or malformed (e.g. `0.125`, `1,2,3`, `12.505`, `1.240`).
 */
export function parseChf(input: string): Rappen | null {
  let text = input.trim();
  text = text
    .replace(/^chf\s*/i, '')
    .replace(/\s*chf$/i, '')
    .trim();

  let sign = 1;
  const signMatch = LEADING_SIGN.exec(text);
  if (signMatch) {
    sign = signMatch[1] === '+' ? 1 : -1;
    text = text.slice(1).trim();
  }

  text = text.replace(SPACES, '').replace(APOSTROPHES, '');
  if (ROUND_SUFFIX.test(text)) text = text.slice(0, -2);
  if (!/^[0-9.,]+$/.test(text) || !/[0-9]/.test(text)) return null;

  const dots = countOf(text, '.');
  const commas = countOf(text, ',');
  let integerPart: string;
  let decimalPart = '';

  if (dots > 0 && commas > 0) {
    const decimalSeparator = text.lastIndexOf('.') > text.lastIndexOf(',') ? '.' : ',';
    const groupSeparator = decimalSeparator === '.' ? ',' : '.';
    if (countOf(text, decimalSeparator) !== 1) return null;
    const [grouped, decimals] = text.split(decimalSeparator) as [string, string];
    if (!isGrouped(grouped, groupSeparator)) return null;
    integerPart = grouped.split(groupSeparator).join('');
    decimalPart = decimals;
  } else if (dots + commas === 0) {
    integerPart = text;
  } else {
    const separator = dots > 0 ? '.' : ',';
    const parts = text.split(separator);
    if (parts.length > 2) {
      if (!isGrouped(text, separator)) return null;
      integerPart = parts.join('');
    } else {
      const [before, after] = parts as [string, string];
      if (after.length === 3) {
        // "1,240" is a thousands separator (CHF has no third decimal). A single dot is the Swiss
        // decimal point, so "12.505" is a typo rather than twelve thousand: refuse it.
        if (separator === '.' || !isGrouped(text, separator)) return null;
        integerPart = before + after;
      } else {
        integerPart = before;
        decimalPart = after;
      }
    }
  }

  // Every path above keeps all digits of `text`, which has at least one, so the two parts are
  // never both empty here.
  if (decimalPart.length > 2 || !/^[0-9]*$/.test(decimalPart)) return null;
  if (integerPart.length > 13) return null;

  const francs = integerPart === '' ? 0 : Number(integerPart);
  const cents = decimalPart === '' ? 0 : Number(decimalPart.padEnd(2, '0'));
  const value = francs * RAPPEN_PER_FRANC + cents;
  if (value > MAX_ABS_RAPPEN) return null;
  return value === 0 ? 0 : sign * value;
}

function countOf(text: string, char: string): number {
  let count = 0;
  for (const c of text) if (c === char) count += 1;
  return count;
}

/** True for "1,240", "12,345,678" (first group 1-3 digits without a leading zero, then 3s). */
function isGrouped(text: string, separator: string): boolean {
  const groups = text.split(separator);
  const [first, ...rest] = groups as [string, ...string[]];
  if (!/^[1-9][0-9]{0,2}$/.test(first)) return false;
  return rest.length > 0 && rest.every((group) => /^[0-9]{3}$/.test(group));
}

/** Thousands separators per language: Swiss German uses the apostrophe, English the comma. */
const GROUP_SEPARATOR: Record<Language, string> = { de: '’', en: ',' };

export type FormatChfOptions = {
  language?: Language;
  /** Prefix with "CHF " (default true). */
  currency?: boolean;
  /** "auto": minus for negatives only; "always": also "+" for positives; "never": absolute. */
  sign?: 'auto' | 'always' | 'never';
};

/** Formats Rappen for display, e.g. 124050 → "CHF 1’240.50" (de) or "CHF 1,240.50" (en). */
export function formatChf(amount: Rappen, options: FormatChfOptions = {}): string {
  assertRappen(amount);
  const { language = 'de', currency = true, sign = 'auto' } = options;
  const abs = Math.abs(amount);
  const francs = floorDiv(abs, RAPPEN_PER_FRANC);
  const cents = abs - francs * RAPPEN_PER_FRANC;
  const grouped = groupDigits(String(francs), GROUP_SEPARATOR[language]);
  const number = `${grouped}.${String(cents).padStart(2, '0')}`;

  let prefix = '';
  if (sign !== 'never') {
    if (amount < 0) prefix = '-';
    else if (sign === 'always' && amount > 0) prefix = '+';
  }
  return currency ? `CHF ${prefix}${number}` : `${prefix}${number}`;
}

function groupDigits(digits: string, separator: string): string {
  let out = '';
  for (let i = 0; i < digits.length; i += 1) {
    const remaining = digits.length - i;
    out += digits[i];
    if (remaining > 1 && (remaining - 1) % 3 === 0) out += separator;
  }
  return out;
}
