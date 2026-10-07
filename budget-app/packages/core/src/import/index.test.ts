import { describe, expect, it } from 'vitest';

import { MAX_IMPORT_FILE_BYTES, MAX_ROWS_PER_IMPORT } from '../constants';
import { validateSourceTransaction } from '../sources';
import { CAMT_053_04, POSTFINANCE_OLD, REVOLUT, UBS_DE } from './__fixtures__/statements';
import { parseStatementText, readStatement } from './index';

// All files here are synthetic test data (see __fixtures__/statements.ts).

/** Latin-1 / Windows-1252 bytes of text that only uses characters below U+0100. */
const latin1 = (text: string) => Uint8Array.from([...text].map((char) => char.charCodeAt(0)));

/** UTF-8 bytes, built by hand (tests run without Node's Buffer in mind too). */
function utf8(text: string): Uint8Array {
  const out: number[] = [];
  for (const char of text) {
    const code = char.codePointAt(0) as number;
    if (code < 0x80) out.push(code);
    else if (code < 0x800) out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    else out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
  }
  return Uint8Array.from(out);
}

function utf16le(text: string): Uint8Array {
  const out = [0xff, 0xfe];
  for (let i = 0; i < text.length; i += 1) {
    const unit = text.charCodeAt(i);
    out.push(unit & 0xff, unit >> 8);
  }
  return Uint8Array.from(out);
}

describe('readStatement', () => {
  it('reads a Windows-1252 PostFinance export', () => {
    const result = readStatement(latin1(POSTFINANCE_OLD.replace('ZUERICH', 'ZÜRICH')));
    expect(result.ok && result.statement.rows[0]?.transaction.merchant).toBe(
      'MUSTERMARKT-4567 ZÜRICH',
    );
  });

  it('reads UTF-8 with a BOM and UTF-16 files', () => {
    const withBom = Uint8Array.from([0xef, 0xbb, 0xbf, ...utf8(UBS_DE)]);
    const ubs = readStatement(withBom);
    expect(ubs.ok && ubs.statement.rows[0]?.transaction.merchant).toBe('Mustermarkt-4567 Zürich');
    const unicode = readStatement(
      utf16le('Datum;Text;Betrag\r\n30.09.2026;Exempla Café;-3.80\r\n'),
    );
    expect(unicode.ok && unicode.statement.rows[0]?.transaction.merchant).toBe('Exempla Café');
  });

  it('reads camt.053 bytes', () => {
    const result = readStatement(utf8(CAMT_053_04));
    expect(result.ok && result.statement.format).toBe('camt053');
  });

  it('passes the column mapping on', () => {
    const result = readStatement(utf8('A;B;C\n30.09.2026;Exempla;-1.00\n'), {
      mapping: { headerRow: 1, date: 0, amount: 2, text: [1] },
    });
    expect(result.ok && result.statement.rows).toHaveLength(1);
  });

  it('refuses empty and oversized files', () => {
    expect(readStatement(new Uint8Array(0))).toEqual({ ok: false, error: { code: 'empty' } });
    expect(readStatement(new Uint8Array(MAX_IMPORT_FILE_BYTES + 1))).toEqual({
      ok: false,
      error: { code: 'too_large', maxBytes: MAX_IMPORT_FILE_BYTES },
    });
  });

  it('refuses PDF and Excel files', () => {
    expect(readStatement(latin1('%PDF-1.7\n%âãÏÓ\n1 0 obj'))).toEqual({
      ok: false,
      error: { code: 'unsupported_format' },
    });
    const xlsx = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00]);
    expect(readStatement(xlsx)).toEqual({ ok: false, error: { code: 'unsupported_format' } });
  });
});

describe('parseStatementText', () => {
  it('returns only valid statement transactions', () => {
    const result = parseStatementText(REVOLUT);
    expect(result.ok).toBe(true);
    for (const { transaction } of result.ok ? result.statement.rows : []) {
      expect(transaction).toMatchObject({ source: 'statement_import', currency: 'CHF', mcc: null });
      expect(transaction.sourceId).toBeTruthy();
      expect(validateSourceTransaction(transaction).ok).toBe(true);
    }
  });

  it('refuses empty text and text that is too long', () => {
    expect(parseStatementText('\uFEFF  \n ')).toEqual({ ok: false, error: { code: 'empty' } });
    expect(parseStatementText('a'.repeat(MAX_IMPORT_FILE_BYTES + 1))).toEqual({
      ok: false,
      error: { code: 'too_large', maxBytes: MAX_IMPORT_FILE_BYTES },
    });
  });

  it('refuses XML that is not a camt.053 statement', () => {
    const camt054 =
      '<?xml version="1.0"?><Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.054.001.04"><BkToCstmrDbtCdtNtfctn/></Document>';
    expect(parseStatementText(camt054)).toEqual({
      ok: false,
      error: { code: 'unsupported_format' },
    });
    expect(parseStatementText('  <html><body>Login</body></html>')).toEqual({
      ok: false,
      error: { code: 'unsupported_format' },
    });
  });

  it('tells "only other currencies" from "nothing importable"', () => {
    const euroOnly = REVOLUT.split('\n')
      .filter((line, index) => index === 0 || line.includes(',EUR,'))
      .join('\n');
    expect(parseStatementText(euroOnly)).toEqual({ ok: false, error: { code: 'not_chf' } });
    expect(parseStatementText('Datum;Text;Betrag\n30.09.2026;Exempla;0.00\n')).toEqual({
      ok: false,
      error: {
        code: 'no_transactions',
        skipped: [{ line: 2, reason: 'zero_amount', text: '30.09.2026; Exempla; 0.00' }],
      },
    });
  });

  it('refuses more rows than one import may carry', () => {
    const lines = ['Datum;Text;Betrag'];
    for (let i = 0; i <= MAX_ROWS_PER_IMPORT; i += 1) lines.push(`30.09.2026;Exempla ${i};-1.00`);
    expect(parseStatementText(lines.join('\n'))).toEqual({
      ok: false,
      error: { code: 'too_many_rows', count: MAX_ROWS_PER_IMPORT + 1, max: MAX_ROWS_PER_IMPORT },
    });
  });

  it('reports the first and last day of unsorted rows', () => {
    const result = parseStatementText(
      'Datum;Text;Betrag\n15.09.2026;A;-1\n02.09.2026;B;-1\n28.09.2026;C;-1\n10.09.2026;D;-1\n',
    );
    expect(result.ok && [result.statement.from, result.statement.to]).toEqual([
      '2026-09-02',
      '2026-09-28',
    ]);
  });
});

describe('crafted files', () => {
  it('reads a file whose only text cell is a megabyte long in well under a second', () => {
    const cell = 'x'.repeat(1_000_000) + 'a';
    const csv = `Datum;Buchungstext;Betrag\n01.10.2026;${cell};-12.50\n`;
    const started = performance.now();
    const result = readStatement(new TextEncoder().encode(csv));
    expect(performance.now() - started).toBeLessThan(1000);
    expect(result.ok).toBe(true);
  });
});
