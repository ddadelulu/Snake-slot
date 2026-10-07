import { describe, expect, it } from 'vitest';

import { detectCsvDelimiter, parseCsv } from './csv';

const fields = (text: string) => parseCsv(text).records.map((record) => record.fields);

describe('parseCsv', () => {
  it('splits records and fields with the detected delimiter', () => {
    expect(parseCsv('Datum;Text;Betrag\n30.09.2026;Exempla Kiosk;-4.50\n')).toEqual({
      delimiter: ';',
      records: [
        { line: 1, fields: ['Datum', 'Text', 'Betrag'] },
        { line: 2, fields: ['30.09.2026', 'Exempla Kiosk', '-4.50'] },
      ],
    });
  });

  it('handles quoted delimiters, doubled quotes and line breaks inside quotes', () => {
    const table = parseCsv('a;"Muster; ""Pronto""\nFiliale";c\r\nd;e;f');
    expect(table.records).toEqual([
      { line: 1, fields: ['a', 'Muster; "Pronto"\nFiliale', 'c'] },
      { line: 3, fields: ['d', 'e', 'f'] },
    ]);
  });

  it('accepts CRLF, LF and CR line ends and drops blank lines', () => {
    expect(parseCsv('a;b\r\n\r\nc;d\re;f\n\n\n').records).toEqual([
      { line: 1, fields: ['a', 'b'] },
      { line: 3, fields: ['c', 'd'] },
      { line: 4, fields: ['e', 'f'] },
    ]);
  });

  it('keeps empty fields, also a trailing one', () => {
    expect(fields('a;;b;\n;\n')).toEqual([
      ['a', '', 'b', ''],
      ['', ''],
    ]);
  });

  it('is lenient with sloppy quoting', () => {
    expect(fields('"12.50"CHF;5" Bildschirm;"""";"x')).toEqual([
      ['12.50CHF', '5" Bildschirm', '"', '"x'],
    ]);
    expect(fields('a;"b\nc;d')).toEqual([
      ['a', '"b'],
      ['c', 'd'],
    ]);
  });

  it('honours an explicit delimiter and the Excel sep= line', () => {
    expect(parseCsv('a,b;c', ';').records[0]?.fields).toEqual(['a,b', 'c']);
    expect(parseCsv('sep=,\r\na;b,c\r\n')).toEqual({
      delimiter: ',',
      records: [{ line: 2, fields: ['a;b', 'c'] }],
    });
    expect(parseCsv('"sep=|"\na|b', ';')).toEqual({
      delimiter: ';',
      records: [{ line: 2, fields: ['a|b'] }],
    });
    // An unknown separator in the hint is just data.
    expect(parseCsv('sep=:\na;b').records[0]?.fields).toEqual(['sep=:']);
  });

  it('reads tab- and pipe-separated files', () => {
    expect(parseCsv('a\tb\tc\n1\t2\t3').delimiter).toBe('\t');
    expect(parseCsv('a|b|c\n1|2|3').delimiter).toBe('|');
  });
});

describe('detectCsvDelimiter', () => {
  it('prefers the delimiter that gives a consistent table', () => {
    const swiss = [
      'Konto:;CH9300000000000000000',
      'Datum;Text;Belastung;Gutschrift',
      '30.09.2026;Exempla Kiosk, Bern;4.50;',
      '29.09.2026;Muster Markt, Zürich;23.40;',
    ].join('\n');
    expect(detectCsvDelimiter(swiss)).toBe(';');
    expect(detectCsvDelimiter('Type,Started Date,Amount\nCARD_PAYMENT,2026-09-29,-23.40')).toBe(
      ',',
    );
  });

  it('falls back to the semicolon when nothing splits', () => {
    expect(detectCsvDelimiter('just one column\nand another line')).toBe(';');
    expect(detectCsvDelimiter('')).toBe(';');
  });

  it('only looks at the first records', () => {
    const header = 'a,b\n';
    const rows = 'x;y;z\n'.repeat(60);
    expect(detectCsvDelimiter(header + rows)).toBe(';');
  });
});
