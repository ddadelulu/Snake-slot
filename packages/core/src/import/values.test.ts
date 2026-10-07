import { describe, expect, it } from 'vitest';

import {
  cleanText,
  compactKey,
  currencyExponent,
  directionSign,
  ibanIn,
  isBalanceLabel,
  isChf,
  joinTexts,
  parseAmountCell,
  parseDecimalMinor,
  parseStatementDate,
  parseStatementTime,
  purchaseDateIn,
  slashOrderOf,
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

describe('parseStatementDate options', () => {
  it('reads slash dates month first only when asked, and only slash dates', () => {
    const monthFirst = { slashOrder: 'month-first' } as const;
    expect(parseStatementDate('09/30/2026', monthFirst)).toEqual({ date: '2026-09-30' });
    expect(parseStatementDate('12/31/26 14:05', monthFirst)).toEqual({
      date: '2026-12-31',
      time: '14:05',
    });
    expect(parseStatementDate('30/09/2026', monthFirst)).toBeNull();
    expect(parseStatementDate('10.03.2026', monthFirst)).toEqual({ date: '2026-03-10' });
    expect(parseStatementDate('10-03-2026', monthFirst)).toEqual({ date: '2026-03-10' });
    expect(parseStatementDate('10/03/2026', { slashOrder: 'day-first' })).toEqual({
      date: '2026-03-10',
    });
  });

  it('wants the same separator twice', () => {
    expect(parseStatementDate('30.09/2026')).toBeNull();
    expect(parseStatementDate('30-09.2026')).toBeNull();
  });

  it('keeps midnight of an exact instant with an offset', () => {
    const exact = { exactInstant: true };
    expect(parseStatementDate('2026-09-30T00:00:00+02:00', exact)).toEqual({
      date: '2026-09-30',
      time: '00:00:00',
      offset: '+02:00',
    });
    expect(parseStatementDate('2026-09-30T00:00Z', exact)).toEqual({
      date: '2026-09-30',
      time: '00:00',
      offset: 'Z',
    });
    expect(parseStatementDate('2026-09-30T00:00:00', exact)).toEqual({ date: '2026-09-30' });
  });
});

describe('slashOrderOf', () => {
  it.each([
    [['12/31/2026', '01/02/2026'], 'month-first'],
    [['31/12/2026', '12/31/2026'], 'day-first'],
    [['12/31/2026', '31/12/2026'], 'day-first'],
    [['01/02/2026', ' 11/12/26 '], 'day-first'],
    [['2026-12-31', '31.12.2026', '12.31.2026', ''], 'day-first'],
    [[], 'day-first'],
  ])('infers %j as %s', (cells, order) => {
    expect(slashOrderOf(cells)).toBe(order);
  });
});

describe('purchaseDateIn', () => {
  it('takes the first text that states a purchase day within 31 days before the booking', () => {
    expect(purchaseDateIn(['Exempla', 'Einkauf vom 02.10.2026'], '2026-10-05')).toBe('2026-10-02');
    expect(purchaseDateIn(['EINKAUF VOM 2026-10-02 Exempla'], '2026-10-02')).toBe('2026-10-02');
    expect(purchaseDateIn(['Purchase on 10/02/2026'], '2026-10-05', 'month-first')).toBe(
      '2026-10-02',
    );
    expect(purchaseDateIn(['Kauf vom 01.09.2026'], '2026-10-02')).toBe('2026-09-01');
    expect(purchaseDateIn(['Kauf vom 31.08.2026'], '2026-10-02')).toBeNull();
    expect(purchaseDateIn(['Kauf vom 03.10.2026'], '2026-10-02')).toBeNull();
  });

  it('needs the keyword as a word and a real date right after the preposition', () => {
    expect(purchaseDateIn(['Verkauf vom 02.10.2026'], '2026-10-05')).toBeNull();
    expect(purchaseDateIn(['Einkauf vom 02.10.20265'], '2026-10-05')).toBeNull();
    expect(purchaseDateIn(['Einkauf vom 02.10/2026'], '2026-10-05')).toBeNull();
    expect(
      purchaseDateIn(['Einkauf vom 31.09.2026', 'Einkauf vom 02.10.2026'], '2026-10-05'),
    ).toBeNull();
    expect(purchaseDateIn([], '2026-10-05')).toBeNull();
  });

  it('only searches the start of long texts', () => {
    const late = `${'x'.repeat(1000)} Einkauf vom 02.10.2026`;
    expect(purchaseDateIn([late], '2026-10-05')).toBeNull();
    const started = Date.now();
    purchaseDateIn([`kauf ${'x'.repeat(1_000_000)}`, 'kauf/'.repeat(200_000)], '2026-10-05');
    expect(Date.now() - started).toBeLessThan(250);
  });
});

describe('statement markers', () => {
  it('folds column names and markers to compact keys', () => {
    expect(compactKey('Transaktions-Nr.')).toBe('transaktionsnr');
    expect(compactKey("Data dell'operazione")).toBe('datadelloperazione');
    expect(compactKey('Crédit / Débit')).toBe('creditdebit');
    expect(compactKey('Straße')).toBe('strasse');
  });

  it('knows the ways files write Swiss francs', () => {
    for (const code of ['CHF', 'chf', ' CHF ', 'Fr.', 'FR', 'SFr.', 'sfr', 'CHF.']) {
      expect(isChf(code)).toBe(true);
    }
    for (const code of ['', 'EUR', 'F', 'Franken', 'CH', 'SFrs']) expect(isChf(code)).toBe(false);
  });

  it('reads debit/credit markers', () => {
    expect(directionSign(' S ')).toBe(-1);
    expect(directionSign('D.')).toBe(-1);
    expect(directionSign('CRÉDIT')).toBe(1);
    expect(directionSign('')).toBe(0);
    expect(directionSign('-')).toBe(0);
    expect(directionSign('X')).toBeNull();
    expect(directionSign('Debitkarte')).toBeNull();
  });

  it('recognises balance and total labels', () => {
    for (const label of [
      'Saldo',
      'Anfangssaldo:',
      'Schlusssaldo per 30.09.2026',
      'Saldo am 30.09.26',
      'Saldovortrag',
      'Eröffnungssaldo',
      'Kontostand',
      'Total',
      'Total CHF',
      'Gesamttotal',
      'Summe',
      'Balance',
      'Opening balance',
      'Closing Balance as of 2026-09-30',
      'Solde',
      "Solde d'ouverture",
      'Solde de clôture',
      'Saldo iniziale',
      'Saldo finale',
      'Totale',
    ]) {
      expect(isBalanceLabel(label)).toBe(true);
    }
    for (const text of [
      '',
      'Saldo Kreditkarte',
      'TotalEnergies Tankstelle',
      'Summer Festival',
      'Exempla Balance Yoga',
      `Saldo ${'x'.repeat(60)}`,
    ]) {
      expect(isBalanceLabel(text)).toBe(false);
    }
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
