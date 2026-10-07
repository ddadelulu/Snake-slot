import { describe, expect, it } from 'vitest';

import {
  cleanText,
  currencyExponent,
  ibanIn,
  joinTexts,
  parseAmountCell,
  parseDecimalMinor,
  parseStatementDate,
  parseStatementTime,
  truncate,
} from './values';

describe('parseStatementDate', () => {
  it.each([
    ['30.09.2026', { date: '2026-09-30' }],
    ['1.9.2026', { date: '2026-09-01' }],
    ['30.09.26', { date: '2026-09-30' }],
    ['31.12.99', { date: '1999-12-31' }],
    ['2026-09-30', { date: '2026-09-30' }],
    ['30/09/2026', { date: '2026-09-30' }],
    ['30-09-2026', { date: '2026-09-30' }],
    [' 30.09.2026 ', { date: '2026-09-30' }],
    ['30.09.2026 14:23', { date: '2026-09-30', time: '14:23' }],
    ['2026-09-29 9:05:07', { date: '2026-09-29', time: '09:05:07' }],
    ['2026-09-29T14:23:11', { date: '2026-09-29', time: '14:23:11' }],
    ['2026-09-30 00:00:00.0', { date: '2026-09-30' }],
    ['2026-09-29T14:23:00.000+02:00', { date: '2026-09-29', time: '14:23:00', offset: '+02:00' }],
    ['2026-09-29T12:23:00Z', { date: '2026-09-29', time: '12:23:00', offset: 'Z' }],
    ['2026-09-29T12:23-0130', { date: '2026-09-29', time: '12:23', offset: '-01:30' }],
    ['2026-09-30T00:00:00+02:00', { date: '2026-09-30' }],
    ['2026-09-30+02:00', { date: '2026-09-30' }],
  ])('reads %s', (text, expected) => {
    expect(parseStatementDate(text)).toEqual(expected);
  });

  it.each([
    '',
    'Datum',
    '31.09.2026',
    '29.02.2026',
    '2026-13-01',
    '09/30/2026',
    '30.09.2026 24:00',
    '30.09.2026 12:60',
    '30.09.2026 12:00:60',
    '2026-09-30 12',
  ])('refuses %j', (text) => {
    expect(parseStatementDate(text)).toBeNull();
  });
});

describe('parseStatementTime', () => {
  it('reads time columns', () => {
    expect(parseStatementTime('14:23:05')).toBe('14:23:05');
    expect(parseStatementTime(' 9:05 ')).toBe('09:05');
    expect(parseStatementTime('00:00:00')).toBe('');
    expect(parseStatementTime('')).toBe('');
    expect(parseStatementTime('14.23')).toBeNull();
    expect(parseStatementTime('25:00')).toBeNull();
  });
});

describe('parseAmountCell', () => {
  it.each([
    ['-23.40', -2340],
    ['23.4', 2340],
    ["1'234.50", 123450],
    ['1.234,50', 123450],
    ['5200', 520000],
    ['23.40-', -2340],
    ['23.40 −', -2340],
    ['23.40+', 2340],
    ['(23.40)', -2340],
    ['(-23.40)', -2340],
    ['CHF 23.40', 2340],
    ['12.–', 1200],
    ['-0.00', 0],
  ])('reads %s', (text, rappen) => {
    expect(parseAmountCell(text)).toEqual({ kind: 'value', rappen });
  });

  it('tells empty from invalid cells', () => {
    expect(parseAmountCell('')).toEqual({ kind: 'empty' });
    expect(parseAmountCell('  ')).toEqual({ kind: 'empty' });
    expect(parseAmountCell('-')).toEqual({ kind: 'empty' });
    expect(parseAmountCell('12.505')).toEqual({ kind: 'invalid' });
    expect(parseAmountCell('Betrag')).toEqual({ kind: 'invalid' });
  });
});

describe('parseDecimalMinor', () => {
  it('converts to minor units without floating point', () => {
    expect(parseDecimalMinor('22.50', 2)).toBe(2250);
    expect(parseDecimalMinor('-22.5', 2)).toBe(-2250);
    expect(parseDecimalMinor('+7', 2)).toBe(700);
    expect(parseDecimalMinor('0.1', 2)).toBe(10);
    expect(parseDecimalMinor('-1800', 0)).toBe(-1800);
    expect(parseDecimalMinor('1800.00', 0)).toBe(1800);
    expect(parseDecimalMinor('12.345', 3)).toBe(12345);
    expect(parseDecimalMinor("1'250,5", 2)).toBe(125050);
    expect(parseDecimalMinor('−3.20', 2)).toBe(-320);
    expect(parseDecimalMinor('23.400', 2)).toBe(2340);
    expect(parseDecimalMinor('-0.00', 2)).toBe(0);
    expect(parseDecimalMinor('0000.07', 2)).toBe(7);
  });

  it('refuses what it cannot represent exactly', () => {
    expect(parseDecimalMinor('23.405', 2)).toBeNull();
    expect(parseDecimalMinor('1.5', 0)).toBeNull();
    expect(parseDecimalMinor('1,234.50', 2)).toBeNull();
    expect(parseDecimalMinor('', 2)).toBeNull();
    expect(parseDecimalMinor('9999999999999999', 2)).toBeNull();
  });
});

describe('currencyExponent', () => {
  it('knows ISO 4217 minor units', () => {
    expect(currencyExponent('EUR')).toBe(2);
    expect(currencyExponent('JPY')).toBe(0);
    expect(currencyExponent('KRW')).toBe(0);
    expect(currencyExponent('ISK')).toBe(0);
    expect(currencyExponent('VND')).toBe(0);
    expect(currencyExponent('KWD')).toBe(3);
    expect(currencyExponent('TND')).toBe(3);
    expect(currencyExponent('CLF')).toBe(4);
  });
});

describe('text helpers', () => {
  it('cleans, truncates and joins texts', () => {
    expect(cleanText('  Muster\n  Markt\t ')).toBe('Muster Markt');
    expect(truncate('abc', 5)).toBe('abc');
    expect(truncate('abc def', 4)).toBe('abc');
    expect(truncate('ab💰', 3)).toBe('ab');
    expect(joinTexts(['a', '', 'b', 'a'], 100)).toBe('a; b');
    expect(joinTexts(['', ''], 100)).toBeNull();
    expect(joinTexts(['abcdef'], 3)).toBe('abc');
  });

  it('recognises IBANs in metadata cells', () => {
    expect(ibanIn('CH93 0000 0000 0000 0000 0')).toBe('CH9300000000000000000');
    expect(ibanIn('ch9300000000000000000')).toBe('CH9300000000000000000');
    expect(ibanIn('0000 00000000.00A')).toBeNull();
    expect(ibanIn('Konto:')).toBeNull();
  });
});
