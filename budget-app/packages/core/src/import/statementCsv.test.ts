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
import { contentId } from './__fixtures__/ids';
import { parseStatementText } from './index';
import type { ColumnMapping, ParsedStatement, StatementOptions } from './types';

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
      to: '2026-09-29',
      skipped: [],
    });
    const rawText =
      'KAUF/DIENSTLEISTUNG VOM 29.09.2026 KARTEN NR. XXXX1234 MUSTERMARKT-4567 ZUERICH';
    // Booked on 30.09., bought on 29.09. (the day the text states, D-043).
    expect(statement.rows[0]).toEqual({
      line: 7,
      transaction: {
        amountRappen: -2340,
        currency: 'CHF',
        bookedOn: '2026-09-29',
        merchant: 'MUSTERMARKT-4567 ZUERICH',
        rawText,
        mcc: null,
        source: 'statement_import',
        sourceId: contentId(`csv:${IBAN}`, '2026-09-29', -2340, rawText),
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
        on: '2026-09-29',
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

  it('reads the UBS export: trade date and time first, a collective order as its parts', () => {
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
      {
        line: 13,
        amount: -10000,
        on: '2026-09-28',
        time: undefined,
        merchant: 'Fictiva Versicherung AG',
      },
      { line: 14, amount: -5000, on: '2026-09-28', time: undefined, merchant: 'Beispiel Verein' },
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
    // The parts share the order's number: they are told apart by their position, like camt.053.
    expect(statement.rows.slice(1, 3).map((row) => row.transaction)).toMatchObject([
      {
        rawText: 'Sammelauftrag; e-banking-Auftrag; Fictiva Versicherung AG',
        sourceId: `csv:${IBAN}:TEST0000000002/1`,
      },
      {
        rawText: 'Sammelauftrag; e-banking-Auftrag; Beispiel Verein',
        sourceId: `csv:${IBAN}:TEST0000000002/2`,
      },
    ]);
    expect(statement.skipped).toEqual([
      {
        line: 12,
        reason: 'collective_total',
        text: '2026-09-28; 2026-09-28; CHF; -150.00; 1234.56; TEST0000000002; Sammelauftrag; e-banking-Auftrag',
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

  it('reads the ZKB export: positive debits, CHF columns, unsigned Betrag Detail parts', () => {
    const statement = parse(ZKB);
    expect(statement).toMatchObject({ bank: 'zkb', account: { iban: null } });
    expect(summary(statement).map((row) => [row.line, row.amount, row.merchant])).toEqual([
      [2, -2340, 'Mustermarkt-4567 Zürich'],
      [4, -10000, 'Fictiva Versicherung AG'],
      [5, -5000, 'Beispiel Verein'],
      [6, 520000, 'Fictiva Arbeitgeber AG'],
      [7, -2137, 'Exempla Shop Paris'],
    ]);
    const card =
      'Einkauf ZKB Visa Debit Karte Nr. xxxx1234, Exempla Shop Paris; EUR 22.50 Kurs 0.9498';
    expect(statement.rows.map((row) => row.transaction.sourceId)).toEqual([
      'csv:zkb:Z000000001',
      'csv:zkb:Z000000002/1',
      'csv:zkb:Z000000002/2',
      'csv:zkb:Z000000003',
      contentId('csv', '2026-09-24', -2137, card),
    ]);
    expect(statement.rows[1]?.transaction.rawText).toBe(
      'Sammelauftrag e-banking; Fictiva Versicherung AG; Police 000',
    );
    expect(statement.skipped.map((row) => [row.line, row.reason])).toEqual([
      [3, 'collective_total'],
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
      contentId(`csv:${IBAN}`, '2026-09-30', -2340, 'Mustermarkt-4567 Zürich'),
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
        sourceId: contentId('csv', '2026-09-25', 520000, 'Fictiva Arbeitgeber AG; Lohn September'),
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
      contentId('csv', '2026-09-30', -450, 'Exempla Kiosk; Kaffee', 1),
      contentId('csv', '2026-09-30', -450, 'Exempla Kiosk; Kaffee', 2),
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

describe('purchase dates in the text (D-043)', () => {
  const dated = (rows: string[]) =>
    parse(['Buchungsdatum;Buchungstext;Betrag', ...rows].join('\n')).rows.map(
      (row) => row.transaction.bookedOn,
    );

  it('dates card purchases and withdrawals by the day the text states, in four languages', () => {
    expect(
      dated([
        '05.10.2026;Einkauf vom 02.10.2026 Karten-Nr. XXXX1234 Exempla Zürich;-45.80',
        '05.10.2026;KAUF/DIENSTLEISTUNG VOM 02.10.26 KARTEN NR. XXXX1234 EXEMPLA;-19.90',
        '05.10.2026;TWINT Kauf/Dienstleistung vom 01.10.2026 Exempla Bern;-6.80',
        '05.10.2026;ACHAT/SERVICE DU 02.10.2026 CARTE N° XXXX1234 EXEMPLA LAUSANNE;-9.00',
        "05.10.2026;Retrait d'espèces du 03.10.2026 Exempla Genève;-100.00",
        '05.10.2026;Acquisto/servizio del 2026-10-04 Esempio Lugano;-7.00',
        '05.10.2026;Purchase of 30/09/2026 Exempla Shop;-3.00',
        '05.10.2026;Bargeldbezug vom 04.10.2026 Bancomat Exempla;-50.00',
      ]),
    ).toEqual([
      '2026-10-02',
      '2026-10-02',
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
      '2026-09-30',
      '2026-10-04',
    ]);
  });

  it('keeps the booking date when the stated day is later, too early or not a date', () => {
    expect(
      dated([
        '05.10.2026;Einkauf vom 06.10.2026 Exempla;-1.00',
        '06.11.2026;Einkauf vom 05.10.2026 Exempla;-2.00',
        '04.11.2026;Einkauf vom 04.10.2026 Exempla;-3.00',
        '05.10.2026;Einkauf vom 31.09.2026 Exempla;-4.00',
        '05.10.2026;Einkauf Exempla 02.10.2026;-5.00',
        '05.10.2026;Gutschrift Exempla vom 02.10.2026;6.00',
      ]),
      // 32 days before the booking is too early, 31 days is fine.
    ).toEqual(['2026-10-05', '2026-11-06', '2026-10-04', '2026-10-05', '2026-10-05', '2026-10-05']);
  });

  it('drops the booking time with the booking day and keeps it otherwise', () => {
    const statement = parse(
      [
        'Datum;Zeit;Text;Betrag',
        '05.10.2026;14:00;Einkauf vom 02.10.2026 Exempla;-1.00',
        '05.10.2026;15:00;Einkauf vom 05.10.2026 Exempla;-2.00',
      ].join('\n'),
    );
    expect(summary(statement).map((row) => [row.on, row.time])).toEqual([
      ['2026-10-02', undefined],
      ['2026-10-05', '15:00'],
    ]);
  });

  it('leaves files with a purchase-date column alone and applies to mapped files', () => {
    const withTradeDate = parse(
      'Transaktionsdatum;Buchungsdatum;Text;Betrag\n04.10.2026;05.10.2026;Einkauf vom 02.10.2026 Exempla;-1.00\n',
    );
    expect(withTradeDate.rows[0]?.transaction.bookedOn).toBe('2026-10-04');
    const mapped = parse('A;B;C\n05.10.2026;Einkauf vom 02.10.2026 Exempla;-1.00\n', {
      mapping: { headerRow: 1, date: 0, amount: 2, text: [1] },
    });
    expect(mapped.rows[0]?.transaction.bookedOn).toBe('2026-10-02');
  });

  it('reads slash dates in the text in the order of the date column', () => {
    const statement = parse(
      [
        'Date;Description;Amount',
        '10/05/2026;Purchase of 10/02/2026 Exempla Store;-1.00',
        '12/31/2026;Exempla Rent;-2.00',
      ].join('\n'),
    );
    expect(statement.rows.map((row) => row.transaction.bookedOn)).toEqual([
      '2026-10-02',
      '2026-12-31',
    ]);
  });
});

describe('collective bookings (D-043)', () => {
  const UBS_HEADER =
    'Abschlussdatum;Abschlusszeit;Buchungsdatum;Valutadatum;Währung;Belastung;Gutschrift;Einzelbetrag;Saldo;Transaktions-Nr.;Beschreibung1;Beschreibung2;Beschreibung3;Fussnoten;';
  const ubs = (...lines: string[]) => parse([UBS_HEADER, ...lines].join('\n'));
  const total = (amount: string, number = 'TEST0000000009') =>
    `;;2026-09-28;2026-09-28;CHF;${amount};;;;${number};Sammelauftrag;;;;`;
  const detail = (amount: string, name: string, currency = 'CHF', number = 'TEST0000000009') =>
    `;;2026-09-28;2026-09-28;${currency};;;${amount};;${number};${name};;;;`;

  it('keeps the total when the parts do not add up, have other signs or currencies', () => {
    for (const parts of [
      [detail('-100.00', 'Exempla A'), detail('-40.00', 'Exempla B')],
      [detail('-200.00', 'Exempla A'), detail('50.00', 'Exempla B')],
      [detail('-100.00', 'Exempla A'), detail('-50.00', 'Exempla B', 'EUR')],
      [detail('-100.00', 'Exempla A'), detail('-50.005', 'Exempla B')],
      [detail('-150.00', 'Exempla A'), detail('0.00', 'Exempla B')],
    ]) {
      const statement = ubs(total('-150.00'), ...parts);
      expect(statement.rows.map((row) => [row.line, row.transaction.amountRappen])).toEqual([
        [2, -15000],
      ]);
      expect(statement.skipped.map((row) => [row.line, row.reason])).toEqual([
        [3, 'collective_detail'],
        [4, 'collective_detail'],
      ]);
    }
  });

  it('imports a collective credit as its parts, also a single one', () => {
    const credit = ';;2026-09-28;2026-09-28;CHF;;90.00;;;TEST0000000008;Sammelgutschrift;;;;';
    const statement = ubs(
      credit,
      detail('60.00', 'Exempla A', 'CHF', 'TEST0000000008'),
      detail('30.00', 'Exempla B', 'CHF', 'TEST0000000008'),
      total('-25.00'),
      detail('-25.00', 'Exempla C'),
    );
    expect(statement.rows.map((row) => [row.line, row.transaction.amountRappen])).toEqual([
      [3, 6000],
      [4, 3000],
      [6, -2500],
    ]);
    expect(statement.rows[2]?.transaction).toMatchObject({
      merchant: 'Exempla C',
      sourceId: `csv:ubs:TEST0000000009/1`,
    });
    expect(statement.skipped.map((row) => [row.line, row.reason])).toEqual([
      [2, 'collective_total'],
      [5, 'collective_total'],
    ]);
  });

  it('skips detail lines that follow no collective booking', () => {
    const statement = ubs(
      detail('-10.00', 'Exempla A'),
      total('-10.00'),
      detail('-10.00', 'Exempla B'),
    );
    expect(statement.skipped.map((row) => [row.line, row.reason])).toEqual([
      [2, 'collective_detail'],
      [3, 'collective_total'],
    ]);
    expect(statement.rows.map((row) => row.line)).toEqual([4]);
  });

  it('uses the parts’ own references, the total’s date and content ids when there are none', () => {
    const zkb = [
      '"Datum";"Buchungstext";"Whg";"Betrag Detail";"ZKB-Referenz";"Belastung CHF";"Gutschrift CHF"',
      '"28.09.2026";"Sammelauftrag";"";"";"";"30.00";""',
      '"";"Exempla A";"CHF";"10.00";"";"";""',
      '"28.09.2026";"Exempla B";"";"20.00";"";"";""',
      '"29.09.2026";"Sammelauftrag 2";"";"";"Z000000005";"30.00";""',
      '"29.09.2026";"Exempla C";"CHF";"10.00";"Z000000006";"";""',
      '"29.09.2026";"Exempla D";"CHF";"20.00";"Z000000005";"";""',
    ].join('\n');
    const statement = parse(zkb);
    expect(statement.rows.map((row) => row.transaction)).toMatchObject([
      {
        amountRappen: -1000,
        bookedOn: '2026-09-28',
        sourceId: contentId('csv', '2026-09-28', -1000, 'Sammelauftrag; Exempla A'),
      },
      {
        amountRappen: -2000,
        sourceId: contentId('csv', '2026-09-28', -2000, 'Sammelauftrag; Exempla B'),
      },
      { amountRappen: -1000, sourceId: 'csv:zkb:Z000000006' },
      { amountRappen: -2000, sourceId: 'csv:zkb:Z000000005/2' },
    ]);
  });

  it('numbers parts that share a number without a total number', () => {
    const statement = ubs(
      total('-30.00', ''),
      detail('-10.00', 'Exempla A', 'CHF', 'TEST-P'),
      detail('-20.00', 'Exempla B', 'CHF', 'TEST-P'),
    );
    expect(statement.rows.map((row) => row.transaction.sourceId)).toEqual([
      'csv:ubs:TEST-P/1',
      'csv:ubs:TEST-P/2',
    ]);
  });
});

describe('debit/credit marker columns (QA M6)', () => {
  it('signs unsigned amounts by a Soll/Haben column', () => {
    const statement = parse(
      [
        'Datum;Buchungstext;Betrag;Soll/Haben;Valuta',
        '03.10.2026;Exempla Zürich;23.40;S;03.10.2026',
        '04.10.2026;Fictiva Lohn;5200.00;H;04.10.2026',
      ].join('\n'),
    );
    expect(statement.rows.map((row) => row.transaction.amountRappen)).toEqual([-2340, 520000]);
  });

  it('reads a card statement with "Amount" and "Debit/Credit" (Swisscard-like)', () => {
    const statement = parse(
      [
        'Transaction date,Description,Merchant,Card number,Currency,Amount,Debit/Credit,Status,Category',
        '03.10.2026,Exempla,Exempla Zürich,XXXX1234,CHF,23.40,Debit,Posted,Groceries',
        '05.10.2026,Payment,,XXXX1234,CHF,500.00,Credit,Posted,',
      ].join('\n'),
    );
    expect(summary(statement).map((row) => [row.amount, row.on, row.merchant])).toEqual([
      [-2340, '2026-10-03', 'Exempla Zürich'],
      [50000, '2026-10-05', null],
    ]);
  });

  it.each([
    ['S', -1],
    ['d', -1],
    ['DR', -1],
    ['Debit', -1],
    ['Soll', -1],
    ['Belastung', -1],
    ['Lastschrift', -1],
    ['DBIT', -1],
    ['Débit', -1],
    ['Addebito', -1],
    ['Dare', -1],
    ['H', 1],
    ['c', 1],
    ['CR', 1],
    ['Credit', 1],
    ['Haben', 1],
    ['Gutschrift', 1],
    ['CRDT', 1],
    ['Crédit', 1],
    ['Accredito', 1],
    ['Avere', 1],
  ])('reads the marker %s', (marker, sign) => {
    const statement = parse(`Datum;Text;Betrag;CdtDbtInd\n03.10.2026;Exempla;10.00;${marker}\n`);
    expect(statement.rows[0]?.transaction.amountRappen).toBe(sign * 1000);
  });

  it('skips unknown or missing markers, keeps signed amounts, ignores markers for debit/credit columns', () => {
    const statement = parse(
      [
        'Datum;Text;Betrag;D/C',
        '03.10.2026;Exempla unknown;10.00;X',
        '03.10.2026;Exempla missing;10.00;',
        '03.10.2026;Exempla signed;-10.00;',
        '03.10.2026;Exempla signed credit;-10.00;C',
      ].join('\n'),
    );
    expect(statement.rows.map((row) => [row.line, row.transaction.amountRappen])).toEqual([
      [4, -1000],
      [5, -1000],
    ]);
    expect(statement.skipped.map((row) => [row.line, row.reason])).toEqual([
      [2, 'invalid_amount'],
      [3, 'invalid_amount'],
    ]);
    const split = parse('Datum;Text;Belastung;Gutschrift;S/H\n03.10.2026;Exempla;;10.00;S\n');
    expect(split.rows[0]?.transaction.amountRappen).toBe(1000);
  });

  it('takes a "Typ" / "Type" column only when it holds markers', () => {
    const typ = parse('Datum;Text;Betrag;Typ\n03.10.2026;Exempla;10.00;Belastung\n');
    expect(typ.rows[0]?.transaction.amountRappen).toBe(-1000);
    const type = parse('Datum;Text;Betrag;Type\n03.10.2026;Exempla;10.00;Card\n');
    expect(type.rows[0]?.transaction.amountRappen).toBe(1000);
    const empty = parse('Datum;Text;Betrag;Type\n03.10.2026;Exempla;-10.00;\n');
    expect(empty.rows[0]?.transaction.amountRappen).toBe(-1000);
  });

  it('offers a marker column it found to the mapping screen', () => {
    expect(parseStatementText('Datum;Wieviel;Soll/Haben\n03.10.2026;10.00;S\n')).toMatchObject({
      ok: false,
      error: { code: 'unknown_columns', guess: { headerRow: 1, date: 0, direction: 2 } },
    });
  });

  it('applies the person’s marker column and sign inversion', () => {
    const file = [
      'Tag;Was;Wieviel;Art',
      '03.10.2026;Exempla Kauf;23.40;DR',
      '04.10.2026;Exempla Rückgabe;-5.00;',
      '05.10.2026;Fictiva Gutschrift;100.00;CR',
    ].join('\n');
    const amounts = (mapping: Partial<ColumnMapping>) =>
      parse(file, {
        mapping: { headerRow: 1, date: 0, amount: 2, text: [1], ...mapping },
      }).rows.map((row) => row.transaction.amountRappen);
    expect(amounts({ direction: 3 })).toEqual([-2340, -500, 10000]);
    expect(amounts({ invertAmounts: true })).toEqual([-2340, 500, -10000]);
    expect(amounts({ direction: 3, invertAmounts: true })).toEqual([2340, 500, -10000]);
    expect(
      parseStatementText(file, {
        mapping: { headerRow: 1, date: 0, amount: 2, text: [1], direction: 9 },
      }),
    ).toMatchObject({ ok: false, error: { code: 'unknown_columns' } });
  });
});

describe('lines that are not bookings', () => {
  it('skips lines with more filled cells than the header has columns (QA L6)', () => {
    const statement = parse(
      [
        'Date,Description,Amount',
        '2026-10-03,Exempla,"-23,40"',
        '2026-10-04,Fictiva,-1,234.50',
      ].join('\n'),
    );
    expect(statement.rows.map((row) => row.transaction.amountRappen)).toEqual([-2340]);
    expect(statement.skipped).toEqual([
      { line: 3, reason: 'malformed_row', text: '2026-10-04; Fictiva; -1; 234.50' },
    ]);
    // Files without a header line have nothing to compare with.
    const headerless = parse('03.10.2026;Exempla;-1.00;x;y\n', {
      mapping: { headerRow: 0, date: 0, amount: 2, text: [1] },
    });
    expect(headerless.rows).toHaveLength(1);
  });

  it('skips balance and total lines (QA L8)', () => {
    const statement = parse(
      [
        'Datum;Text;Betrag',
        '01.10.2026;Anfangssaldo;1000.00',
        '03.10.2026;Exempla;-1.00',
        ';Total;-1.00',
        'Total;;-1.00',
        '31.10.2026;Schlusssaldo per 31.10.2026;999.00',
        '31.10.2026;Saldo CHF;999.00',
        '31.10.2026;Closing balance:;999.00',
        '31.10.2026;Solde final;999.00',
        '31.10.2026;Saldo finale;999.00',
        '31.10.2026;Kontostand;999.00',
        '31.10.2026;Summe;999.00',
        '31.10.2026;Totale;999.00',
        '31.10.2026;Saldo Kreditkarte Exempla;-50.00',
        'Saldo;;',
      ].join('\n'),
    );
    expect(statement.rows.map((row) => row.line)).toEqual([3, 14]);
    // The last line has neither date nor amount: a footer, dropped without a word.
    expect(statement.skipped.map((row) => [row.line, row.reason])).toEqual(
      [2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((line) => [line, 'balance_line']),
    );
  });

  it('drops repeated header lines, also with other spacing', () => {
    const statement = parse(
      [
        'Datum;Text;Betrag;',
        '03.10.2026;A;-1.00;',
        ' Datum ; Text ; Betrag ',
        '04.10.2026;B;-2.00;',
      ].join('\n'),
    );
    expect(statement.rows).toHaveLength(2);
    expect(statement.skipped).toEqual([]);
  });

  it('counts "Fr.", "SFr." and "chf" as Swiss francs (QA L9)', () => {
    const statement = parse(
      [
        'Datum;Text;Betrag;Währung',
        '03.10.2026;A;-1.00;Fr.',
        '04.10.2026;B;-2.00;SFr.',
        '05.10.2026;C;-3.00;chf',
        '06.10.2026;D;-4.00;Fr',
        '07.10.2026;E;-5.00;EUR',
      ].join('\n'),
    );
    expect(statement.rows.map((row) => row.line)).toEqual([2, 3, 4, 5]);
    expect(statement.skipped.map((row) => [row.line, row.reason])).toEqual([[6, 'not_chf']]);
  });
});

describe('dates and headers', () => {
  it('reads slash dates month first when a column shows it (QA L7)', () => {
    const dates = (rows: string[]) =>
      parse(['Datum;Text;Betrag', ...rows].join('\n')).rows.map((row) => row.transaction.bookedOn);
    expect(dates(['10/03/2026;A;-1', '12/31/2026;B;-1'])).toEqual(['2026-10-03', '2026-12-31']);
    expect(dates(['10/03/2026;A;-1', '31/12/2026;B;-1'])).toEqual(['2026-03-10', '2026-12-31']);
    expect(dates(['10/03/2026;A;-1', '11/04/2026;B;-1'])).toEqual(['2026-03-10', '2026-04-11']);
    // Each column on its own: the trade date is US, the booking date Swiss.
    const statement = parse(
      'Trade date;Booking date;Text;Amount\n;13/10/2026;A;-1\n10/14/2026;15/10/2026;B;-1\n',
    );
    expect(statement.rows.map((row) => row.transaction.bookedOn)).toEqual([
      '2026-10-13',
      '2026-10-14',
    ]);
  });

  it('looks past a metadata line that looks like a header', () => {
    const statement = parse(
      [
        'Kontoauszug;Datum;Betrag',
        'Konto;CH93 0000 0000 0000 0000 0;',
        '',
        'Buchungsdatum;Text;Betrag',
        '03.10.2026;Exempla;-23.40',
      ].join('\n'),
    );
    expect(statement.account.iban).toBe(IBAN);
    expect(summary(statement)).toMatchObject([{ line: 5, amount: -2340, on: '2026-10-03' }]);
    // With no better header the first one is used and its lines are reported.
    for (const text of [
      'Datum;Text;Betrag\nheute;Exempla;-1.00\n',
      'Text;Betrag;Datum\nExempla;-1\n',
    ]) {
      expect(parseStatementText(text)).toMatchObject({
        ok: false,
        error: { code: 'no_transactions', skipped: [{ line: 2, reason: 'invalid_date' }] },
      });
    }
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
