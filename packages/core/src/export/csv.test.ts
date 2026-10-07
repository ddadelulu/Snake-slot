import { describe, expect, it } from 'vitest';

import { formatCsvAmount, localDateTimeIn, toCsv } from './csv';

describe('toCsv', () => {
  it('writes UTF-8 BOM, semicolons and CRLF', () => {
    expect(toCsv(['Datum', 'Händler', 'Betrag'], [['2026-09-30', 'Exempla Kiosk', '-4.50']])).toBe(
      '\uFEFFDatum;Händler;Betrag\r\n2026-09-30;Exempla Kiosk;-4.50\r\n',
    );
  });

  it('quotes fields that need it and doubles quotes', () => {
    expect(
      toCsv(
        ['a'],
        [['Exempla; Bar'], ['Café "Muster"'], ['Zeile 1\nZeile 2'], [' Exempla'], ['Exempla ']],
      ),
    ).toBe(
      '\uFEFFa\r\n"Exempla; Bar"\r\n"Café ""Muster"""\r\n"Zeile 1\nZeile 2"\r\n" Exempla"\r\n"Exempla "\r\n',
    );
  });

  it('writes numbers and empty cells as they are', () => {
    expect(
      toCsv(
        ['n', 'x'],
        [
          [-4.5, null],
          [0, 'ok'],
        ],
      ),
    ).toBe('\uFEFFn;x\r\n-4.5;\r\n0;ok\r\n');
    expect(() => toCsv(['n'], [[Number.NaN]])).toThrow(RangeError);
    expect(() => toCsv(['n'], [[Infinity]])).toThrow(RangeError);
  });

  it('defuses formula injection in text cells', () => {
    const rows = [
      ['=HYPERLINK("http://example.invalid","Klick")'],
      ['+41 44 000 00 00'],
      ['-2+3+cmd'],
      ['@SUM(A1:A2)'],
      ['\tExempla'],
      ['\rExempla'],
    ];
    expect(toCsv(['Händler'], rows).split('\r\n').slice(1, 7)).toEqual([
      `"'=HYPERLINK(""http://example.invalid"",""Klick"")"`,
      "'+41 44 000 00 00",
      "'-2+3+cmd",
      "'@SUM(A1:A2)",
      "'\tExempla",
      `"'\rExempla"`,
    ]);
  });

  it('keeps plain decimal amounts numeric', () => {
    expect(toCsv(['Betrag'], [['-23.40'], ['-1234'], ['-1e5']])).toBe(
      "\uFEFFBetrag\r\n-23.40\r\n-1234\r\n'-1e5\r\n",
    );
  });
});

describe('formatCsvAmount', () => {
  it('formats Rappen with a dot and no thousands separator', () => {
    expect(formatCsvAmount(-2340)).toBe('-23.40');
    expect(formatCsvAmount(123400)).toBe('1234.00');
    expect(formatCsvAmount(5)).toBe('0.05');
    expect(formatCsvAmount(-0)).toBe('0.00');
    expect(formatCsvAmount(10_000_000_000)).toBe('100000000.00');
    expect(() => formatCsvAmount(1.5)).toThrow(RangeError);
  });
});

describe('localDateTimeIn', () => {
  it('gives the Swiss local day and time, summer and winter', () => {
    expect(localDateTimeIn('2026-09-29T22:30:00Z', 'Europe/Zurich')).toEqual({
      date: '2026-09-30',
      time: '00:30',
    });
    expect(localDateTimeIn(new Date('2026-12-31T23:15:00Z'), 'Europe/Zurich')).toEqual({
      date: '2027-01-01',
      time: '00:15',
    });
    expect(localDateTimeIn('2026-10-03T14:23:00+02:00', 'Europe/Zurich')).toEqual({
      date: '2026-10-03',
      time: '14:23',
    });
  });

  it('throws for an invalid instant', () => {
    expect(() => localDateTimeIn('gestern', 'Europe/Zurich')).toThrow(RangeError);
  });
});
