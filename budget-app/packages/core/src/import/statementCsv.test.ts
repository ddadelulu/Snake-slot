import { describe, expect, it } from 'vitest';

import {
  NEON,
  POSTFINANCE_NEW,
  POSTFINANCE_OLD,
  RAIFFEISEN,
  REVOLUT,
  UBS_DE,
  UBS_EN,
  ZKB,
} from './__fixtures__/statements';
import { parseStatementText } from './index';
import type { ParsedStatement, StatementOptions } from './types';

// All files here are synthetic test data (see __fixtures__/statements.ts).

const IBAN = 'CH9300000000000000000';

function parse(text: string, options?: StatementOptions): ParsedStatement {
  const result = parseStatementText(text, options);
  if (!result.ok) throw new Error(`expected a statement, got ${JSON.stringify(result.error)}`);
  return result.statement;
}

function summary(statement: ParsedStatement) {
  return statement.rows.map(({ line, transaction }) => ({
    line,
    amount: transaction.amountRappen,
    on: transaction.bookedOn,
    time: transaction.bookedTime,
    merchant: transaction.merchant,
  }));
}

describe('bank layouts', () => {
  it('reads the old PostFinance export (metadata lines, negative Lastschrift, footer)', () => {
    const statement = parse(POSTFINANCE_OLD);
    expect(statement).toMatchObject({
      format: 'csv',
      bank: 'postfinance',
      account: { iban: IBAN },
      from: '2026-09-27',
      to: '2026-09-30',
      skipped: [],
    });
    expect(statement.rows[0]).toEqual({
      line: 7,
      transaction: {
        amountRappen: -2340,
        currency: 'CHF',
        bookedOn: '2026-09-30',
        merchant: 'MUSTERMARKT-4567 ZUERICH',
        rawText: 'KAUF/DIENSTLEISTUNG VOM 29.09.2026 KARTEN NR. XXXX1234 MUSTERMARKT-4567 ZUERICH',
        mcc: null,
        source: 'statement_import',
        sourceId: `csv:${IBAN}:2026-09-30:-2340:kauf dienstleistung vom karten nr mustermarkt zuerich:1`,
      },
    });
    expect(summary(statement).map((row) => [row.amount, row.merchant])).toEqual([
      [-2340, 'MUSTERMARKT-4567 ZUERICH'],
      [520000, 'FICTIVA ARBEITGEBER AG'],
      [-41235, 'FICTIVA KRANKENKASSE AG'],
      [-680, 'BEISPIEL BAECKEREI BERN'],
    ]);
  });

  it('reads the new PostFinance export (Excel text cells, "in CHF" columns)', () => {
    const statement = parse(POSTFINANCE_NEW);
    expect(statement.bank).toBe('postfinance');
    expect(statement.account.iban).toBe(IBAN);
    expect(summary(statement)).toEqual([
      {
        line: 8,
        amount: -2340,
        on: '2026-09-30',
        time: undefined,
        merchant: 'Mustermarkt-4567 Zürich',
      },
      {
        line: 9,
        amount: 520000,
        on: '2026-09-29',
        time: undefined,
        merchant: 'Fictiva Arbeitgeber AG',
      },
      {
        line: 10,
        amount: -10000,
        on: '2026-09-26',
        time: undefined,
        merchant: 'Bargeldbezug Bancomat Beispielplatz',
      },
    ]);
  });

  it('reads the UBS export: trade date and time first, collective details skipped', () => {
    const statement = parse(UBS_DE);
    expect(statement).toMatchObject({
      bank: 'ubs',
      account: { iban: IBAN },
      from: '2026-09-24',
      to: '2026-09-29',
    });
    expect(summary(statement)).toEqual([
      {
        line: 11,
        amount: -2340,
        on: '2026-09-29',
        time: '14:23:05',
        merchant: 'Mustermarkt-4567 Zürich',
      },
      { line: 12, amount: -15000, on: '2026-09-28', time: undefined, merchant: null },
      {
        line: 15,
        amount: 520000,
        on: '2026-09-25',
        time: undefined,
        merchant: 'Fictiva Arbeitgeber AG',
      },
      { line: 16, amount: -850, on: '2026-09-24', time: '09:05:00', merchant: 'Exempla Café Bern' },
    ]);
    expect(statement.rows[0]?.transaction).toMatchObject({
      rawText: 'Mustermarkt-4567 Zürich; Zahlung Debitkarte; Kartennummer: XXXX 1234',
      sourceId: `csv:${IBAN}:TEST0000000001`,
    });
    expect(statement.skipped).toEqual([
      {
        line: 13,
        reason: 'collective_detail',
        text: '2026-09-28; 2026-09-28; CHF; -100.00; TEST0000000002; Fictiva Versicherung AG',
      },
      {
        line: 14,
        reason: 'collective_detail',
        text: '2026-09-28; 2026-09-28; CHF; -50.00; TEST0000000002; Beispiel Verein',
      },
    ]);
  });

  it('reads the English UBS export', () => {
    const statement = parse(UBS_EN);
    expect(statement.bank).toBe('ubs');
    expect(summary(statement)).toEqual([
      {
        line: 8,
        amount: -2340,
        on: '2026-09-29',
        time: '14:23:05',
        merchant: 'Mustermarkt-4567 Zurich',
      },
      {
        line: 9,
        amount: 520000,
        on: '2026-09-25',
        time: undefined,
        merchant: 'Fictiva Employer Ltd',
      },
    ]);
  });

  it('reads the ZKB export: positive debits, CHF columns, Betrag Detail rows skipped', () => {
    const statement = parse(ZKB);
    expect(statement).toMatchObject({ bank: 'zkb', account: { iban: null } });
    expect(summary(statement).map((row) => [row.line, row.amount, row.merchant])).toEqual([
      [2, -2340, 'Mustermarkt-4567 Zürich'],
      [3, -15000, null],
      [6, 520000, 'Fictiva Arbeitgeber AG'],
      [7, -2137, 'Exempla Shop Paris'],
    ]);
    expect(statement.rows.map((row) => row.transaction.sourceId)).toEqual([
      'csv:zkb:Z000000001',
      'csv:zkb:Z000000002',
      'csv:zkb:Z000000003',
      'csv:2026-09-24:-2137:einkauf zkb visa debit karte nr exempla shop paris eur kurs:1',
    ]);
    expect(statement.skipped.map((row) => [row.line, row.reason])).toEqual([
      [4, 'collective_detail'],
      [5, 'collective_detail'],
    ]);
  });

  it('reads the Raiffeisen export: IBAN column, midnight timestamps mean no time', () => {
    const statement = parse(RAIFFEISEN);
    expect(statement).toMatchObject({ bank: 'raiffeisen', account: { iban: IBAN } });
    expect(summary(statement)).toEqual([
      {
        line: 2,
        amount: -2340,
        on: '2026-09-30',
        time: undefined,
        merchant: 'Mustermarkt-4567 Zürich',
      },
      {
        line: 3,
        amount: 520000,
        on: '2026-09-29',
        time: undefined,
        merchant: 'Fictiva Arbeitgeber AG',
      },
      {
        line: 4,
        amount: -450,
        on: '2026-09-27',
        time: undefined,
        merchant: 'Exempla Kiosk Luzern',
      },
    ]);
    expect(statement.rows[0]?.transaction.sourceId).toBe(
      `csv:${IBAN}:2026-09-30:-2340:mustermarkt zurich:1`,
    );
  });

  it('reads the Neon export: merchant column and original currency', () => {
    const statement = parse(NEON);
    expect(statement.bank).toBe('neon');
    expect(statement.rows.map((row) => row.transaction)).toMatchObject([
      { amountRappen: -2340, merchant: 'Mustermarkt', rawText: 'Mustermarkt' },
      {
        amountRappen: -2137,
        merchant: 'Exempla Café Paris',
        original: { amountMinor: -2250, currency: 'EUR' },
      },
      {
        amountRappen: -1180,
        merchant: 'Exempla Ramen Tokyo',
        original: { amountMinor: -1800, currency: 'JPY' },
      },
      {
        amountRappen: 520000,
        merchant: 'Fictiva Arbeitgeber AG',
        rawText: 'Fictiva Arbeitgeber AG; Lohn September',
        sourceId: 'csv:2026-09-25:520000:fictiva arbeitgeber lohn september:1',
      },
    ]);
    expect(statement.rows[0]?.transaction).not.toHaveProperty('original');
  });

  it('reads the Revolut export: completed CHF rows only, fee is money out', () => {
    const statement = parse(REVOLUT);
    expect(statement.bank).toBe('revolut');
    expect(summary(statement)).toEqual([
      { line: 2, amount: -2340, on: '2026-09-29', time: '14:23:11', merchant: 'Mustermarkt' },
      { line: 4, amount: -10150, on: '2026-09-28', time: '10:00:00', merchant: 'To Fictiva Shop' },
      { line: 6, amount: 20000, on: '2026-09-26', time: '08:00:00', merchant: 'Top-Up by *1234' },
    ]);
    expect(statement.skipped.map((row) => [row.line, row.reason])).toEqual([
      [3, 'not_booked'],
      [5, 'not_chf'],
      [7, 'not_booked'],
    ]);
  });
});

describe('generic files', () => {
  it('recognises French and English column names', () => {
    const french = parse(
      [
        'Date de comptabilisation;Libellé;Débit;Crédit;Date de valeur;Solde',
        '30.09.2026;Achat Exempla Épicerie Lausanne;23.40;;30.09.2026;100.00',
        '29.09.2026;Virement Fictiva SA;;1200.00;29.09.2026;123.40',
      ].join('\n'),
    );
    expect(french.bank).toBeNull();
    expect(summary(french).map((row) => [row.amount, row.merchant])).toEqual([
      [-2340, 'Exempla Épicerie Lausanne'],
      [120000, 'Fictiva SA'],
    ]);
    const english = parse('Date,Description,Amount\n2026-09-30,Exempla Coffee,-4.20\n');
    expect(summary(english)[0]).toMatchObject({ amount: -420, merchant: 'Exempla Coffee' });
  });

  it('tells an Italian "Valuta" currency column from a value date', () => {
    const italian = parse(
      [
        'Data;Descrizione;Importo;Valuta',
        '30.09.2026;Acquisto Esempio Bar Lugano;-6.50;CHF',
        '29.09.2026;Acquisto Esempio Shop Milano;-20.00;EUR',
      ].join('\n'),
    );
    expect(summary(italian).map((row) => [row.amount, row.merchant])).toEqual([
      [-650, 'Esempio Bar Lugano'],
    ]);
    expect(italian.skipped).toEqual([
      { line: 3, reason: 'not_chf', text: '29.09.2026; Acquisto Esempio Shop Milano; -20.00; EUR' },
    ]);
    // Only a value date: still a date column.
    const valueDated = parse('Valuta;Text;Betrag\n30.09.2026;Exempla;-1.00\n');
    expect(valueDated.rows[0]?.transaction.bookedOn).toBe('2026-09-30');
  });

  it('nets debit and credit, falls back to a signed amount column, reads accounting signs', () => {
    const statement = parse(
      [
        'Datum;Text;Soll;Haben;Betrag;Zeit',
        '30.09.2026;Exempla A;10.00;2.50;;14:00',
        '29.09.2026;Exempla B;;;-7.00;25:99',
        '28.09.2026;Exempla C;8.00-;;;',
        '27.09.2026;Exempla D;;(3.00);;',
      ].join('\n'),
    );
    expect(summary(statement)).toEqual([
      { line: 2, amount: -750, on: '2026-09-30', time: '14:00', merchant: 'Exempla A' },
      { line: 3, amount: -700, on: '2026-09-29', time: undefined, merchant: 'Exempla B' },
      { line: 4, amount: -800, on: '2026-09-28', time: undefined, merchant: 'Exempla C' },
      { line: 5, amount: 300, on: '2026-09-27', time: undefined, merchant: 'Exempla D' },
    ]);
  });

  it('lists every line it does not import, with the reason', () => {
    const statement = parse(
      [
        'Datum;Buchungstext;Betrag;Währung',
        '30.09.2026;Exempla ok;-1.00;CHF',
        'gestern;Exempla bad date;-1.00;CHF',
        ';Exempla no date;-1.00;',
        '30.09.2026;Exempla no amount;;CHF',
        '30.09.2026;Exempla bad amount;12.505;CHF',
        '30.09.2026;Exempla zero;0.00;CHF',
        '30.09.2026;Exempla euro;-1.00;eur',
        '2026-09-30T12:00:00+25:00;Exempla bad offset;-1.00;CHF',
        'Datum;Buchungstext;Betrag;Währung',
        ';;;',
        'Total;;;',
      ].join('\n'),
    );
    expect(statement.rows.map((row) => row.line)).toEqual([2]);
    expect(statement.skipped.map((row) => [row.line, row.reason])).toEqual([
      [3, 'invalid_date'],
      [4, 'invalid_date'],
      [5, 'no_amount'],
      [6, 'invalid_amount'],
      [7, 'zero_amount'],
      [8, 'not_chf'],
      [9, 'invalid'],
    ]);
  });

  it('keeps an offset the file states as bookedAt', () => {
    const statement = parse('Datum;Text;Betrag\n2026-09-29T14:23:00+02:00;Exempla;-1.00\n');
    expect(statement.rows[0]?.transaction).toMatchObject({ bookedAt: '2026-09-29T14:23:00+02:00' });
    expect(statement.rows[0]?.transaction).not.toHaveProperty('bookedOn');
    expect(statement.from).toBe('2026-09-29');
  });

  it('ignores the currency column when the amount columns are labelled CHF', () => {
    const statement = parse('Datum;Text;Belastung CHF;Whg\n30.09.2026;Exempla;5.00;EUR\n');
    expect(statement.rows[0]?.transaction.amountRappen).toBe(-500);
    expect(parse('Datum;Text;CHF\n30.09.2026;Exempla;-5.00\n').rows).toHaveLength(1);
  });

  it('gives repeated references and identical rows distinct, stable ids', () => {
    const text = [
      'Datum;Text;Betrag;Referenz;Empfänger',
      '30.09.2026;Kaffee;-4.50;;Exempla Kiosk',
      '30.09.2026;Kaffee;-4.50;;Exempla Kiosk',
      '30.09.2026;Teil 1;-1.00;TEST-1;',
      '30.09.2026;Teil 2;-2.00;TEST-1;',
    ].join('\n');
    const ids = parse(text).rows.map((row) => row.transaction.sourceId);
    expect(ids).toEqual([
      'csv:2026-09-30:-450:exempla kiosk kaffee:1',
      'csv:2026-09-30:-450:exempla kiosk kaffee:2',
      'csv:csv:TEST-1',
      'csv:csv:TEST-1:2',
    ]);
    expect(parse(text).rows.map((row) => row.transaction.sourceId)).toEqual(ids);
  });

  it('applies Revolut fees and states only to Revolut files', () => {
    const statement = parse('Datum;Text;Betrag;Fee;State\n30.09.2026;Exempla;-1.00;5.00;PENDING\n');
    expect(statement.rows[0]?.transaction.amountRappen).toBe(-100);
    const bad = parseStatementText(REVOLUT.replace('-23.40,0.00', '-23.40,abc'));
    expect(bad.ok && bad.statement.skipped[0]).toMatchObject({ line: 2, reason: 'invalid_amount' });
  });

  it('ignores unusable original amounts', () => {
    const neon = NEON.replace('"-22.50";"EUR"', '"-22.505";"EUR"').replace(
      '"-1800";"JPY"',
      '"-1800";"CHF"',
    );
    const rows = parse(neon).rows.map((row) => row.transaction);
    expect(rows[1]).not.toHaveProperty('original');
    expect(rows[2]).not.toHaveProperty('original');
  });

  it('takes the account IBAN from an IBAN column, also when some lines are short', () => {
    const statement = parse(
      `Datum;Betrag;Text;IBAN\n30.09.2026;-1.00\n29.09.2026;-2.00;Exempla;${'CH93 0000 0000 0000 0000 0'}\n`,
    );
    expect(statement.account.iban).toBe(IBAN);
    expect(statement.rows).toHaveLength(2);
  });

  it('cuts long texts and merchants to the database limits', () => {
    const long = 'Exempla '.repeat(600);
    const statement = parse(`Datum;Text;Händler;Betrag\n30.09.2026;${long};${long};-1.00\n`);
    const transaction = statement.rows[0]?.transaction;
    expect(transaction?.merchant?.length).toBeLessThanOrEqual(200);
    expect(transaction?.rawText?.length).toBeLessThanOrEqual(4000);
  });
});

describe('column mapping fallback', () => {
  const UNKNOWN = [
    'Mein Export',
    'Tag;Was;Wieviel;Wo',
    '30.09.2026;Znüni;-4.50;Exempla Kiosk',
    '29.09.2026;Zmittag;-18.00;Exempla Bistro',
  ].join('\n');

  it('asks for a mapping when it does not recognise the columns', () => {
    expect(parseStatementText(UNKNOWN)).toEqual({
      ok: false,
      error: {
        code: 'unknown_columns',
        headerRow: 2,
        columns: ['Tag', 'Was', 'Wieviel', 'Wo'],
        sample: [
          ['30.09.2026', 'Znüni', '-4.50', 'Exempla Kiosk'],
          ['29.09.2026', 'Zmittag', '-18.00', 'Exempla Bistro'],
        ],
        guess: { headerRow: 2, text: [] },
      },
    });
  });

  it('passes on what it did recognise', () => {
    const result = parseStatementText(
      'Datum;Buchungstext;Wieviel\n30.09.2026;Exempla;-1.00\n\n;;\n',
    );
    expect(result).toMatchObject({
      ok: false,
      error: {
        code: 'unknown_columns',
        guess: { headerRow: 1, date: 0, text: [1] },
        sample: [['30.09.2026', 'Exempla', '-1.00']],
      },
    });
  });

  it('parses with the person’s mapping', () => {
    const statement = parse(UNKNOWN, {
      mapping: { headerRow: 2, date: 0, amount: 2, text: [1], merchant: 3 },
    });
    expect(statement.bank).toBeNull();
    expect(summary(statement).map((row) => [row.line, row.amount, row.merchant])).toEqual([
      [3, -450, 'Exempla Kiosk'],
      [4, -1800, 'Exempla Bistro'],
    ]);
  });

  it('maps files without a header line, debit/credit columns, time, currency and id', () => {
    const statement = parse(
      '30.09.2026;08:15;Exempla;4.50;;CHF;R-1\n29.09.2026;;Fictiva;;100.00;EUR;R-2\n',
      {
        mapping: {
          headerRow: 0,
          date: 0,
          time: 1,
          debit: 3,
          credit: 4,
          text: [2],
          currency: 5,
          id: 6,
        },
      },
    );
    expect(statement.rows.map((row) => row.transaction)).toMatchObject([
      { amountRappen: -450, bookedTime: '08:15', merchant: 'Exempla', sourceId: 'csv:csv:R-1' },
    ]);
    expect(statement.skipped).toMatchObject([{ line: 2, reason: 'not_chf' }]);
  });

  it.each([
    ['an unknown header line', { headerRow: 9, date: 0, amount: 2, text: [] }],
    ['no amount column', { headerRow: 2, date: 0, text: [1] }],
    ['a column beyond the file', { headerRow: 2, date: 0, amount: 7, text: [] }],
    ['a negative column', { headerRow: 2, date: 0, amount: 2, text: [-1] }],
    ['a fractional column', { headerRow: 2, date: 0.5, amount: 2, text: [] }],
  ])('asks again for %s', (_, mapping) => {
    expect(parseStatementText(UNKNOWN, { mapping })).toMatchObject({
      ok: false,
      error: { code: 'unknown_columns', headerRow: 2 },
    });
  });

  it('guesses the widest of equally common line shapes as the header', () => {
    for (const text of ['Foo;Bar\nx;y;z', 'x;y;z\nFoo;Bar']) {
      expect(parseStatementText(text)).toMatchObject({
        ok: false,
        error: { code: 'unknown_columns', columns: ['x', 'y', 'z'] },
      });
    }
  });

  it('refuses text that is not a table at all', () => {
    expect(parseStatementText('Dies ist kein Kontoauszug.\nNur Text.')).toEqual({
      ok: false,
      error: { code: 'unsupported_format' },
    });
  });
});
