import { describe, expect, it } from 'vitest';

import { MAX_ABS_RAPPEN } from '../money';
import { assertNonNegativeRappen, ceilDiv, multiplyExact } from './integer';

describe('ceilDiv', () => {
  it('rounds towards positive infinity', () => {
    expect(ceilDiv(7, 2)).toBe(4);
    expect(ceilDiv(-7, 2)).toBe(-3);
    expect(ceilDiv(7, -2)).toBe(-3);
    expect(ceilDiv(-7, -2)).toBe(4);
    expect(ceilDiv(6, 3)).toBe(2);
    expect(ceilDiv(1, 1_000_000)).toBe(1);
  });

  it('never returns negative zero', () => {
    expect(Object.is(ceilDiv(0, 5), 0)).toBe(true);
    expect(Object.is(ceilDiv(-1, 5), 0)).toBe(true);
    expect(Object.is(ceilDiv(1, -5), 0)).toBe(true);
  });

  it('matches exact BigInt ceiling division at the edges of the safe range', () => {
    const max = Number.MAX_SAFE_INTEGER;
    const dividends = [0, 1, 2, 999, 10 ** 15 + 7, 2 ** 52 + 1, max - 1, max];
    const divisors = [1, 2, 3, 7, 100, 2 ** 26 + 1, 10 ** 10, max - 1, max];
    const exactCeil = (a: number, b: number): number => {
      const quotient = BigInt(a) / BigInt(b);
      const remainder = BigInt(a) % BigInt(b);
      return Number(remainder !== 0n && remainder > 0n === b > 0 ? quotient + 1n : quotient);
    };
    for (const a of dividends) {
      for (const b of divisors) {
        for (const [x, y] of [
          [a, b],
          [-a, b],
          [a, -b],
          [-a, -b],
        ] as const) {
          expect(ceilDiv(x, y)).toBe(exactCeil(x, y));
        }
      }
    }
  });

  it('rejects zero divisors and non-integers', () => {
    expect(() => ceilDiv(1, 0)).toThrow(/ceilDiv/);
    expect(() => ceilDiv(1.5, 2)).toThrow(RangeError);
    expect(() => ceilDiv(1, 2.5)).toThrow(RangeError);
    expect(() => ceilDiv(Number.NaN, 2)).toThrow(RangeError);
    expect(() => ceilDiv(Number.MAX_SAFE_INTEGER + 1, 2)).toThrow(RangeError);
  });
});

describe('multiplyExact', () => {
  it('multiplies safe integers', () => {
    expect(multiplyExact(12, 31)).toBe(372);
    expect(multiplyExact(-185_000, 12)).toBe(-2_220_000);
    expect(multiplyExact(MAX_ABS_RAPPEN, 6720 * 52)).toBe(3_494_400_000_000_000);
    expect(multiplyExact(94_906_265, 94_906_265)).toBe(9_007_199_136_250_225);
  });

  it('never returns negative zero', () => {
    expect(Object.is(multiplyExact(0, -5), 0)).toBe(true);
    expect(Object.is(multiplyExact(-5, 0), 0)).toBe(true);
  });

  it('throws when the product is not a safe integer', () => {
    // 94'906'266² = 9'007'199'326'062'756 > Number.MAX_SAFE_INTEGER.
    expect(() => multiplyExact(94_906_266, 94_906_266)).toThrow(/multiplyExact/);
    expect(() => multiplyExact(-94_906_266, 94_906_266)).toThrow(RangeError);
    expect(() => multiplyExact(MAX_ABS_RAPPEN, MAX_ABS_RAPPEN)).toThrow(RangeError);
  });

  it('rejects non-integers', () => {
    expect(() => multiplyExact(1.5, 2)).toThrow(RangeError);
    expect(() => multiplyExact(2, 0.5)).toThrow(RangeError);
    expect(() => multiplyExact(Number.NaN, 1)).toThrow(RangeError);
    expect(() => multiplyExact(Number.MAX_SAFE_INTEGER + 1, 1)).toThrow(RangeError);
  });
});

describe('assertNonNegativeRappen', () => {
  it('accepts 0 and positive Rappen', () => {
    expect(assertNonNegativeRappen(0)).toBe(0);
    expect(assertNonNegativeRappen(185_000, 'rent')).toBe(185_000);
    expect(assertNonNegativeRappen(MAX_ABS_RAPPEN)).toBe(MAX_ABS_RAPPEN);
    expect(Object.is(assertNonNegativeRappen(-0), 0)).toBe(true);
  });

  it('rejects negative amounts, naming them', () => {
    expect(() => assertNonNegativeRappen(-1, 'budget')).toThrow(/budget must not be negative/);
    expect(() => assertNonNegativeRappen(-1)).toThrow(/amount must not be negative/);
  });

  it('rejects anything that is not Rappen', () => {
    expect(() => assertNonNegativeRappen(12.5, 'budget')).toThrow(/budget must be an integer/);
    expect(() => assertNonNegativeRappen(MAX_ABS_RAPPEN + 1)).toThrow(RangeError);
  });
});
