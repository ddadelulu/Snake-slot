import { describe, expect, it } from 'vitest';
import {
  MAX_ABS_RAPPEN,
  assertRappen,
  chf,
  floorDiv,
  formatChf,
  isRappen,
  parseChf,
  sumRappen,
} from './money';

describe('isRappen / assertRappen', () => {
  it('accepts safe integers inside the bounds', () => {
    expect(isRappen(0)).toBe(true);
    expect(isRappen(124050)).toBe(true);
    expect(isRappen(-124050)).toBe(true);
    expect(isRappen(MAX_ABS_RAPPEN)).toBe(true);
    expect(isRappen(-MAX_ABS_RAPPEN)).toBe(true);
  });

  it('rejects floats, NaN, infinities, out-of-range and non-numbers', () => {
    for (const bad of [0.5, 12.01, NaN, Infinity, -Infinity, MAX_ABS_RAPPEN + 1, '100', null]) {
      expect(isRappen(bad)).toBe(false);
    }
    expect(() => assertRappen(1.5)).toThrow(RangeError);
    expect(() => assertRappen(MAX_ABS_RAPPEN + 1, 'budget')).toThrow(/budget/);
  });

  it('normalises negative zero', () => {
    expect(Object.is(assertRappen(-0), 0)).toBe(true);
  });
});

describe('chf', () => {
  it('builds amounts from francs and Rappen', () => {
    expect(chf(12, 50)).toBe(1250);
    expect(chf(0, 5)).toBe(5);
    expect(chf(1240, 50)).toBe(124050);
    expect(chf(-12, 50)).toBe(-1250);
    expect(chf(-0, 50)).toBe(-50);
    expect(chf(7)).toBe(700);
  });

  it('rejects non-integer or out-of-range parts', () => {
    expect(() => chf(1.5)).toThrow(RangeError);
    expect(() => chf(1, 100)).toThrow(RangeError);
    expect(() => chf(1, -1)).toThrow(RangeError);
    expect(() => chf(1, 0.5)).toThrow(RangeError);
    expect(() => chf(200_000_000)).toThrow(RangeError);
  });
});

describe('sumRappen', () => {
  it('adds integers exactly', () => {
    expect(sumRappen([])).toBe(0);
    expect(sumRappen([10, 20, -5])).toBe(25);
    // 0.1 + 0.2 style inputs are impossible: Rappen are integers, so the classic float bug cannot occur.
    expect(sumRappen([10, 20])).toBe(30);
    expect(Object.is(sumRappen([5, -5]), 0)).toBe(true);
  });

  it('rejects invalid members', () => {
    expect(() => sumRappen([1, 0.5])).toThrow(RangeError);
  });
});

describe('floorDiv', () => {
  it('floors towards negative infinity', () => {
    expect(floorDiv(7, 2)).toBe(3);
    expect(floorDiv(-7, 2)).toBe(-4);
    expect(floorDiv(7, -2)).toBe(-4);
    expect(floorDiv(-7, -2)).toBe(3);
    expect(floorDiv(6, 3)).toBe(2);
    expect(Object.is(floorDiv(0, 5), 0)).toBe(true);
    expect(Object.is(floorDiv(0, -5), 0)).toBe(true);
  });

  it('is exact for large operands', () => {
    const big = Number.MAX_SAFE_INTEGER - 1; // even
    expect(floorDiv(big, 2)).toBe(big / 2);
    expect(floorDiv(10_000_000_000 * 1000 - 1, 10_000_000_000)).toBe(999);
  });

  it('rejects zero divisors and non-integers', () => {
    expect(() => floorDiv(1, 0)).toThrow(RangeError);
    expect(() => floorDiv(1.5, 1)).toThrow(RangeError);
  });
});

describe('parseChf', () => {
  const cases: Array<[string, number]> = [
    ['12', 1200],
    ['12.5', 1250],
    ['12.50', 1250],
    ['12,50', 1250],
    ['12,5', 1250],
    ['0.05', 5],
    ['.50', 50],
    [',5', 50],
    ['12.', 1200],
    ['007', 700],
    ['1240.50', 124050],
    ["1'240.50", 124050],
    ['1’240.50', 124050],
    ['1,240.50', 124050],
    ['1.240,50', 124050],
    ['1 240.50', 124050],
    ['1 240.50', 124050],
    ['1,240', 124000],
    ['1.240.000', 124000000],
    ['12,345,678', 1234567800],
    ['1’000’000', 100000000],
    ['12.–', 1200],
    ['12.-', 1200],
    ['CHF 12.50', 1250],
    ['chf12.50', 1250],
    ['12.50 CHF', 1250],
    ['  84  ', 8400],
    ['-12.50', -1250],
    ['−12.50', -1250],
    ['+12.50', 1250],
    ['CHF -84.00', -8400],
    ['0', 0],
    ['-0', 0],
    ['100000000', MAX_ABS_RAPPEN],
  ];

  it.each(cases)('parses %j', (input, expected) => {
    const parsed = parseChf(input);
    expect(parsed).toBe(expected);
    if (parsed === 0) expect(Object.is(parsed, 0)).toBe(true);
  });

  const invalid = [
    '',
    '   ',
    'CHF',
    'abc',
    '12a',
    '1e3',
    '0.125',
    '12.505',
    '1.240',
    '1,2,3',
    '1.2.3',
    '12,50.00',
    '1.240.5',
    ',',
    '.',
    '--12',
    '12-',
    '0,123',
    '1234,567',
    '100000000.01',
    '99999999999999',
    'Infinity',
    'NaN',
  ];

  it.each(invalid)('rejects %j', (input) => {
    expect(parseChf(input)).toBeNull();
  });

  it('round-trips every formatted amount', () => {
    const samples = [
      0,
      1,
      5,
      99,
      100,
      1250,
      124050,
      999999,
      123456789,
      -1,
      -124050,
      MAX_ABS_RAPPEN,
    ];
    for (const amount of samples) {
      for (const language of ['de', 'en'] as const) {
        expect(parseChf(formatChf(amount, { language }))).toBe(amount);
        expect(parseChf(formatChf(amount, { language, currency: false }))).toBe(amount);
      }
    }
  });
});

describe('formatChf', () => {
  it('uses the Swiss apostrophe in German and a comma in English', () => {
    expect(formatChf(124050, { language: 'de' })).toBe('CHF 1’240.50');
    expect(formatChf(124050, { language: 'en' })).toBe('CHF 1,240.50');
  });

  it('defaults to German', () => {
    expect(formatChf(124050)).toBe('CHF 1’240.50');
  });

  it('pads Rappen and groups large numbers', () => {
    expect(formatChf(0, { language: 'en' })).toBe('CHF 0.00');
    expect(formatChf(5, { language: 'en' })).toBe('CHF 0.05');
    expect(formatChf(100, { language: 'en' })).toBe('CHF 1.00');
    expect(formatChf(99999, { language: 'en' })).toBe('CHF 999.99');
    expect(formatChf(100000, { language: 'en' })).toBe('CHF 1,000.00');
    expect(formatChf(123456789, { language: 'en' })).toBe('CHF 1,234,567.89');
    expect(formatChf(MAX_ABS_RAPPEN, { language: 'en' })).toBe('CHF 100,000,000.00');
  });

  it('formats signs', () => {
    expect(formatChf(-8400, { language: 'en' })).toBe('CHF -84.00');
    expect(formatChf(8400, { language: 'en', sign: 'always' })).toBe('CHF +84.00');
    expect(formatChf(0, { language: 'en', sign: 'always' })).toBe('CHF 0.00');
    expect(formatChf(-8400, { language: 'en', sign: 'never' })).toBe('CHF 84.00');
  });

  it('can omit the currency', () => {
    expect(formatChf(-124050, { language: 'de', currency: false })).toBe('-1’240.50');
  });

  it('refuses non-integer input', () => {
    expect(() => formatChf(12.5)).toThrow(RangeError);
  });
});
