import { describe, expect, it } from 'vitest';

import { contentId } from './__fixtures__/ids';
import { parseStatementText, readStatement } from './index';
import type { ParsedStatement, StatementParseResult } from './types';

/**
 * The reproductions of the Milestone 3 QA review (statement parsers), with their inputs as QA
 * wrote them and the expected results. Findings: H2 (CSV and camt.053 of one statement, see
 * parity.test.ts), M6 (debit/credit marker columns), L6 (unquoted thousands separators), L7 (US
 * dates), L8 (balance lines), L9 (francs written "Fr."), L10 (camt edge cases), L11 (decoding).
 * Every name and number is made up.
 */

function statementOf(result: StatementParseResult): ParsedStatement {
  if (!result.ok) throw new Error(`expected a statement, got ${JSON.stringify(result.error)}`);
  return result.statement;
}

/** [line, amount, day or instant] per row. */
function rows(result: StatementParseResult) {
  return statementOf(result).rows.map(({ line, transaction }) => [
    line,
    transaction.amountRappen,
    transaction.bookedAt ?? transaction.bookedOn,
  ]);
}

/** [line, reason] per skipped line. */
function skipped(result: StatementParseResult) {
  return statementOf(result).skipped.map(({ line, reason }) => [line, reason]);
}

const BASIC =
  'Datum;Text;Betrag\r\n03.10.2026;Bäckerei Zürich;-4.50\r\n04.10.2026;"Coop; Zürich";-12.30\r\n';

const units = (text: string) => [...text].map((char) => char.charCodeAt(0));
const win1252 = (text: string) =>
  Uint8Array.from(units(text).map((code) => (code === 0x20ac ? 0x80 : code)));
function utf8(text: string): number[] {
  return units(text).flatMap((code) =>
    code < 0x80 ? [code] : [0xc0 | (code >> 6), 0x80 | (code & 0x3f)],
  );
}
const utf16le = (text: string, bom = true) =>
  Uint8Array.from([...(bom ? [0xff, 0xfe] : []), ...units(text).flatMap((u) => [u & 255, u >> 8])]);
const utf16be = (text: string) =>
  Uint8Array.from([0xfe, 0xff, ...units(text).flatMap((u) => [u >> 8, u & 255])]);

describe('QA csv1: encodings (L11)', () => {
  const expected = [
    [2, -450, '2026-10-03'],
    [3, -1230, '2026-10-04'],
  ];

  it.each([
    ['Windows-1252', win1252(BASIC)],
    ['UTF-8 with BOM', Uint8Array.from([0xef, 0xbb, 0xbf, ...utf8(BASIC)])],
    ['UTF-16 LE with BOM', utf16le(BASIC)],
    ['UTF-16 BE with BOM', utf16be(BASIC)],
    ['UTF-16 LE without BOM', utf16le(BASIC, false)],
  ])('reads %s', (_, bytes) => {
    const result = readStatement(bytes);
    expect(rows(result)).toEqual(expected);
    expect(statementOf(result).rows[0]?.transaction.merchant).toBe('Bäckerei Zürich');
  });

  it('reads UTF-8 with a line pasted from a Windows-1252 file as UTF-8 when the stray bytes are few', () => {
    const pasted = [...win1252('05.10.2026;Café Müller;-3.00\r\n')];
    const longer = readStatement(Uint8Array.from([...utf8(BASIC.repeat(2)), ...pasted]));
    expect(statementOf(longer).rows.map((row) => row.transaction.merchant)).toEqual([
      'Bäckerei Zürich',
      'Coop; Zürich',
      'Bäckerei Zürich',
      'Coop; Zürich',
      'Caf� M�ller',
    ]);
    // QA's file itself: 2 stray bytes in 120 are more than 1 %, so it is read as Windows-1252.
    const tiny = readStatement(Uint8Array.from([...utf8(BASIC), ...pasted]));
    expect(statementOf(tiny).rows.map((row) => row.transaction.merchant)).toEqual([
      'BÃ¤ckerei ZÃ¼rich',
      'Coop; ZÃ¼rich',
      'Café Müller',
    ]);
  });

  it('reads quoted line breaks, semicolons and quotes', () => {
    const result = parseStatementText(
      'Datum;Text;Betrag\n03.10.2026;"Coop\nZürich";-4.50\n04.10.2026;"He said ""hi""; ok";-1.00\n05.10.2026;x;-2.00\n',
    );
    expect(rows(result)).toEqual([
      [2, -450, '2026-10-03'],
      [4, -100, '2026-10-04'],
      [5, -200, '2026-10-05'],
    ]);
  });
});

describe('QA csv1: amounts, dates, totals, currencies', () => {
  it('reads thousands separators and signs', () => {
    // QA's spaces in "1 234,50" were all plain; the no-break and narrow no-break spaces Swiss
    // exports also use stand in for two of them.
    const amounts = [
      "1'234.50",
      '1’234.50',
      '1 234,50',
      '1 234,50',
      '1 234,50',
      '1.234,50',
      '1,234.50',
      "-1'234.50",
      '1234.50-',
      '(12.00)',
      '-0.00',
      '0.00',
      '+12.00',
      '12.-',
      '12.–',
      'CHF 12.00',
      '-CHF 12.00',
      '12,5',
      '1.234',
      '−12.00',
      '12.00 −',
      '- 12.00',
      '12.005',
      "1'234'567.89",
    ];
    const text =
      'Datum;Text;Betrag\n' +
      amounts
        .map((amount, i) => `0${(i % 9) + 1}.10.2026;Row ${i} ${amount};"${amount}"`)
        .join('\n');
    const result = parseStatementText(text);
    expect(rows(result).map(([line, amount]) => [line, amount])).toEqual([
      [2, 123450],
      [3, 123450],
      [4, 123450],
      [5, 123450],
      [6, 123450],
      [7, 123450],
      [8, 123450],
      [9, -123450],
      [10, -123450],
      [11, -1200],
      [14, 1200],
      [15, 1200],
      [16, 1200],
      [17, 1200],
      [19, 1250],
      [21, -1200],
      [22, -1200],
      [23, -1200],
      [25, 123456789],
    ]);
    expect(skipped(result)).toEqual([
      [12, 'zero_amount'],
      [13, 'zero_amount'],
      [18, 'invalid_amount'],
      [20, 'invalid_amount'],
      [24, 'invalid_amount'],
    ]);
  });

  it('reads dates, slash dates month first in a column that shows it (L7)', () => {
    const dates = [
      '29.02.2027',
      '29.02.2028',
      '31.09.2026',
      '03.10.26',
      '3.10.26',
      '10/03/2026',
      '12/31/2026',
      '2026-10-03',
      '2026-10-03 14:23',
      '2026-10-03T14:23:05+02:00',
      '2026-10-03 00:00:00.0',
      '03.10.2026 23:59',
      '03-10-2026',
      '2026/10/03',
      '03.10.69',
      '03.10.70',
      '3 Oct 2026',
      '20261003',
      '03.10.2026 24:00',
      '03.10.2026 14:60',
    ];
    const text =
      'Datum;Text;Betrag\n' + dates.map((date, i) => `${date};Row ${i};-${i + 1}.00`).join('\n');
    const result = parseStatementText(text);
    expect(rows(result)).toEqual([
      [3, -200, '2028-02-29'],
      [5, -400, '2026-10-03'],
      [6, -500, '2026-10-03'],
      [7, -600, '2026-10-03'],
      [8, -700, '2026-12-31'],
      [9, -800, '2026-10-03'],
      [10, -900, '2026-10-03'],
      [11, -1000, '2026-10-03T14:23:05+02:00'],
      [12, -1100, '2026-10-03'],
      [13, -1200, '2026-10-03'],
      [14, -1300, '2026-10-03'],
      [16, -1500, '2069-10-03'],
      [17, -1600, '1970-10-03'],
    ]);
    expect(skipped(result)).toEqual(
      [2, 4, 15, 18, 19, 20, 21].map((line) => [line, 'invalid_date']),
    );
  });

  it('drops repeated headers and skips totals and balances (L8)', () => {
    const text = [
      'Datum;Text;Betrag;',
      '03.10.2026;A;-1.00;',
      'Datum;Text;Betrag;',
      '04.10.2026;B;-2.00;',
      ' Datum ; Text ; Betrag ',
      ';Total;-3.00;',
      'Total;;-3.00;',
      '30.10.2026;Saldo;1234.00;',
      ';;;',
      'Erstellt am 05.10.2026;;;',
    ].join('\n');
    const result = parseStatementText(text);
    expect(rows(result)).toEqual([
      [2, -100, '2026-10-03'],
      [4, -200, '2026-10-04'],
    ]);
    expect(skipped(result)).toEqual([
      [6, 'balance_line'],
      [7, 'balance_line'],
      [8, 'balance_line'],
    ]);
  });

  it('takes "Fr." for Swiss francs (L9)', () => {
    const text = [
      'Datum;Text;Betrag;Währung',
      '03.10.2026;A;-1.00;CHF',
      '04.10.2026;B EUR;-2.00;EUR',
      '05.10.2026;C;-3.00;',
      '06.10.2026;D;-4.00;chf',
      '07.10.2026;E;-5.00;Fr.',
    ].join('\n');
    const result = parseStatementText(text);
    expect(rows(result).map(([line]) => line)).toEqual([2, 4, 5, 6]);
    expect(skipped(result)).toEqual([[3, 'not_chf']]);
  });
});

describe('QA csv2: layouts', () => {
  it('signs amounts by a Soll/Haben column (M6)', () => {
    const result = parseStatementText(
      [
        'Datum;Buchungstext;Betrag;Soll/Haben;Valuta',
        '03.10.2026;Coop Zürich;23.40;S;03.10.2026',
        '04.10.2026;Lohn;5200.00;H;04.10.2026',
      ].join('\n'),
    );
    expect(rows(result)).toEqual([
      [2, -2340, '2026-10-03'],
      [3, 520000, '2026-10-04'],
    ]);
  });

  it('signs amounts by a Debit/Credit column (M6, Swisscard-like)', () => {
    const result = parseStatementText(
      [
        'Transaction date,Description,Merchant,Card number,Currency,Amount,Debit/Credit,Status,Category',
        '03.10.2026,Coop,Coop Zürich,XXXX1234,CHF,23.40,Debit,Posted,Groceries',
        '05.10.2026,Payment,,XXXX1234,CHF,500.00,Credit,Posted,',
      ].join('\n'),
    );
    expect(rows(result)).toEqual([
      [2, -2340, '2026-10-03'],
      [3, 50000, '2026-10-05'],
    ]);
  });

  it('reads debit and credit columns, CHF in the header and a value date first', () => {
    expect(
      rows(
        parseStatementText(
          [
            'Datum;Text;Belastung;Gutschrift',
            '03.10.2026;Coop;23.40;',
            '04.10.2026;Lohn;;5200.00',
            '05.10.2026;Both;10.00;3.00',
          ].join('\n'),
        ),
      ),
    ).toEqual([
      [2, -2340, '2026-10-03'],
      [3, 520000, '2026-10-04'],
      [4, -700, '2026-10-05'],
    ]);
    expect(rows(parseStatementText('Datum;Text;Betrag (CHF)\n03.10.2026;Coop;-23.40'))).toEqual([
      [2, -2340, '2026-10-03'],
    ]);
    const paris = parseStatementText(
      'Datum;Text;Betrag CHF;Währung;Originalbetrag\n03.10.2026;Coop Paris;-23.40;EUR;-25.00',
    );
    expect(rows(paris)).toEqual([[2, -2340, '2026-10-03']]);
    expect(
      rows(parseStatementText('Valuta;Datum;Text;Betrag\n05.10.2026;03.10.2026;Coop;-23.40')),
    ).toEqual([[2, -2340, '2026-10-03']]);
  });

  it('looks past a metadata line that looks like a header', () => {
    const result = parseStatementText(
      [
        'Kontoauszug;Datum;Betrag',
        'Konto;CH93 0000 0000 0000 0000 0;',
        '',
        'Buchungsdatum;Text;Betrag',
        '03.10.2026;Coop;-23.40',
      ].join('\n'),
    );
    expect(rows(result)).toEqual([[5, -2340, '2026-10-03']]);
    expect(statementOf(result).rows[0]?.transaction.sourceId).toBe(
      contentId('csv:CH9300000000000000000', '2026-10-03', -2340, 'Coop'),
    );
  });

  it('reads separator hints, tabs, BOMs and Excel text cells', () => {
    for (const text of [
      'sep=,\nDate,Description,Amount\n2026-10-03,"Coop, Zürich",-23.40',
      'Datum\tText\tBetrag\n03.10.2026\tCoop; Zürich\t-23,40',
      '﻿Datum;Text;Betrag\n03.10.2026;Coop;-23.40',
      'Datum;Text;Betrag\n="03.10.2026";="Coop";="-23.40"',
    ]) {
      expect(rows(parseStatementText(text)).map(([, amount, day]) => [amount, day])).toEqual([
        [-2340, '2026-10-03'],
      ]);
    }
  });

  it('skips a comma-separated line with an unquoted thousands separator (L6)', () => {
    const result = parseStatementText(
      ['Date,Description,Amount', '2026-10-03,Coop,"-23,40"', '2026-10-04,Migros,-1,234.50'].join(
        '\n',
      ),
    );
    expect(rows(result)).toEqual([[2, -2340, '2026-10-03']]);
    expect(skipped(result)).toEqual([[3, 'malformed_row']]);
  });

  it('reads Revolut fees and exchanges', () => {
    const result = parseStatementText(
      [
        'Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance',
        'CARD_PAYMENT,Current,2026-09-29 14:23:11,2026-09-30 09:12:45,Mustermarkt,-23.40,0.00,CHF,COMPLETED,1211.16',
        'EXCHANGE,Current,2026-09-29 15:00:00,2026-09-29 15:00:00,Exchanged to EUR,-100.00,0.50,CHF,COMPLETED,1100',
        'CARD_REFUND,Current,2026-09-30 15:00:00,2026-09-30 15:00:00,Mustermarkt,23.40,0.00,CHF,COMPLETED,1123',
        'TRANSFER,Current,2026-09-30 16:00:00,2026-09-30 16:00:00,To CHF Savings,-50.00,0.00,CHF,COMPLETED,1073',
        'CARD_PAYMENT,Current,2026-09-30 17:00:00,2026-09-30 17:00:00,Fee only,0.00,1.00,CHF,COMPLETED,1072',
      ].join('\n'),
    );
    expect(rows(result)).toEqual([
      [2, -2340, '2026-09-29'],
      [3, -10050, '2026-09-29'],
      [4, 2340, '2026-09-30'],
      [5, -5000, '2026-09-30'],
      [6, -100, '2026-09-30'],
    ]);
  });
});

describe('QA camt1: camt.053 edge cases (L10)', () => {
  const doc = (statements: string, ns = '') =>
    `<?xml version="1.0" encoding="UTF-8"?><${ns}Document xmlns${ns ? ':' + ns.slice(0, -1) : ''}="urn:iso:std:iso:20022:tech:xsd:camt.053.001.08"><${ns}BkToCstmrStmt><${ns}GrpHdr><${ns}MsgId>M</${ns}MsgId></${ns}GrpHdr>${statements}</${ns}BkToCstmrStmt></${ns}Document>`;
  const stmt = (entries: string, iban = 'CH9300000000000000000', ccy = 'CHF') =>
    `<Stmt><Id>S</Id><Acct><Id><IBAN>${iban}</IBAN></Id><Ccy>${ccy}</Ccy></Acct>${entries}</Stmt>`;
  type Entry = {
    amt: string;
    cd?: string;
    ccy?: string;
    book?: string;
    val?: string;
    ref?: string;
    ntryRef?: string;
    sts?: string;
    info?: string;
    dtls?: string;
    rvsl?: boolean;
  };
  const ntry = (o: Entry) =>
    `<Ntry>${o.ntryRef ? `<NtryRef>${o.ntryRef}</NtryRef>` : ''}<Amt Ccy="${o.ccy ?? 'CHF'}">${o.amt}</Amt><CdtDbtInd>${o.cd ?? 'DBIT'}</CdtDbtInd>${o.rvsl ? '<RvslInd>true</RvslInd>' : ''}<Sts><Cd>${o.sts ?? 'BOOK'}</Cd></Sts>${o.book ? `<BookgDt><Dt>${o.book}</Dt></BookgDt>` : ''}${o.val ? `<ValDt><Dt>${o.val}</Dt></ValDt>` : ''}${o.ref ? `<AcctSvcrRef>${o.ref}</AcctSvcrRef>` : ''}${o.dtls ? `<NtryDtls>${o.dtls}</NtryDtls>` : ''}${o.info ? `<AddtlNtryInf>${o.info}</AddtlNtryInf>` : ''}</Ntry>`;
  type Tx = { amt?: string; cd?: string; cdtr?: string; dbtr?: string; acc?: string };
  const tx = (o: Tx) =>
    `<TxDtls>${o.amt ? `<Amt Ccy="CHF">${o.amt}</Amt>` : ''}${o.cd ? `<CdtDbtInd>${o.cd}</CdtDbtInd>` : ''}${o.cdtr || o.dbtr ? `<RltdPties>${o.cdtr ? `<Cdtr><Pty><Nm>${o.cdtr}</Nm></Pty></Cdtr>` : ''}${o.dbtr ? `<Dbtr><Pty><Nm>${o.dbtr}</Nm></Pty></Dbtr>` : ''}</RltdPties>` : ''}${o.acc ? `<RltdDts><AccptncDtTm>${o.acc}</AccptncDtTm></RltdDts>` : ''}</TxDtls>`;
  const IBAN = 'CH9300000000000000000';

  it('reads batches, reversals, dates and refuses bad amounts', () => {
    const result = parseStatementText(
      doc(
        stmt(
          [
            ntry({
              amt: '150.00',
              book: '2026-10-01',
              ref: 'R1',
              info: 'Sammelauftrag',
              dtls:
                tx({ amt: '100.00', cd: 'DBIT', cdtr: 'Versicherung A' }) +
                tx({ amt: '40.00', cd: 'DBIT', cdtr: 'Verein B' }),
            }),
            ntry({
              amt: '150.00',
              book: '2026-10-01',
              ref: 'R2',
              info: 'Sammelauftrag',
              dtls:
                tx({ amt: '100.00', cd: 'DBIT', cdtr: 'Versicherung A' }) +
                tx({ amt: '50.00', cd: 'DBIT', cdtr: 'Verein B' }),
            }),
            ntry({
              amt: '150.00',
              book: '2026-10-01',
              info: 'Sammelauftrag ohne Ref',
              dtls:
                tx({ amt: '100.00', cd: 'DBIT', cdtr: 'Versicherung A' }) +
                tx({ amt: '50.00', cd: 'DBIT', cdtr: 'Verein B' }),
            }),
            ntry({
              amt: '23.40',
              cd: 'CRDT',
              rvsl: true,
              book: '2026-10-02',
              ntryRef: 'N4',
              info: 'Storno Coop-4567 Zürich',
            }),
            ntry({
              amt: '23.40',
              cd: 'DBIT',
              rvsl: true,
              book: '2026-10-02',
              ref: 'R5',
              info: 'Storno Gutschrift Lohn',
            }),
            ntry({ amt: '9.00', val: '2026-10-03', ref: 'R6', info: 'Kein Buchungsdatum Kiosk' }),
            ntry({ amt: '9.00', ref: 'R7', info: 'Gar kein Datum' }),
            ntry({
              amt: '5.00',
              book: '2026-10-04',
              ref: 'R8',
              dtls: tx({ acc: '2026-10-03T23:30:00', cdtr: 'Bar ohne Offset' }),
            }),
            ntry({
              amt: '5.00',
              book: '2026-10-04',
              ref: 'R9',
              dtls: tx({ acc: '2026-10-03T23:30:00Z', cdtr: 'Bar Z' }),
            }),
            ntry({
              amt: '5.00',
              book: '2026-10-04',
              ref: 'R10',
              dtls: tx({ acc: '2026-10-03T23:30:00.123+0200', cdtr: 'Bar 0200' }),
            }),
            ntry({
              amt: '5.00',
              book: '2026-10-04',
              ref: 'R11',
              dtls: tx({ acc: '2026-10-03T00:00:00+05:00', cdtr: 'Midnight +5' }),
            }),
            ntry({
              amt: '5.00',
              book: '2026-10-04',
              ref: 'R12',
              dtls: tx({ acc: 'garbage', cdtr: 'Bad acc' }),
            }),
            ntry({ amt: '0.00', book: '2026-10-04', ref: 'R13' }),
            ntry({ amt: '-5.00', book: '2026-10-04', ref: 'R14', info: 'negative amt' }),
            ntry({ amt: '5.005', book: '2026-10-04', ref: 'R15', info: 'three decimals' }),
            ntry({ amt: '1,234.50', book: '2026-10-04', ref: 'R16', info: 'thousands' }),
            ntry({
              amt: '5.00',
              ccy: 'EUR',
              book: '2026-10-04',
              ref: 'R17',
              info: 'EUR entry in CHF acct',
            }),
            ntry({ amt: '5.00', sts: 'PDNG', book: '2026-10-04', ref: 'R18', info: 'pending' }),
            ntry({
              amt: '7.00',
              book: '2026-10-04',
              ref: 'R19',
              dtls: tx({ amt: '7.00', cd: 'DBIT', cdtr: 'Batch of one' }),
            }),
            ntry({
              amt: '10.00',
              book: '2026-10-04',
              ref: 'R20',
              dtls:
                tx({ amt: '15.00', cd: 'DBIT', cdtr: 'A' }) +
                tx({ amt: '5.00', cd: 'CRDT', dbtr: 'B' }),
            }),
          ].join(''),
        ),
      ),
    );
    expect(rows(result)).toEqual([
      [1, -15000, '2026-10-01'],
      [2, -10000, '2026-10-01'],
      [2, -5000, '2026-10-01'],
      [3, -10000, '2026-10-01'],
      [3, -5000, '2026-10-01'],
      [4, 2340, '2026-10-02'],
      [5, -2340, '2026-10-02'],
      [6, -900, '2026-10-03'],
      [8, -500, '2026-10-03'],
      [9, -500, '2026-10-03T23:30:00Z'],
      [10, -500, '2026-10-03T23:30:00+02:00'],
      [11, -500, '2026-10-03T00:00:00+05:00'],
      [12, -500, '2026-10-04'],
      [19, -700, '2026-10-04'],
      [20, -1500, '2026-10-04'],
      [20, 500, '2026-10-04'],
    ]);
    expect(skipped(result)).toEqual([
      [7, 'invalid_date'],
      [13, 'zero_amount'],
      [14, 'invalid_amount'],
      [15, 'invalid_amount'],
      [16, 'invalid_amount'],
      [17, 'not_chf'],
      [18, 'not_booked'],
    ]);
    expect(
      statementOf(result)
        .rows.slice(1, 3)
        .map((row) => row.transaction.sourceId),
    ).toEqual([`camt053:${IBAN}:R2/1`, `camt053:${IBAN}:R2/2`]);
  });

  it('gives one entry in two statements of the same account one id', () => {
    const coffee = ntry({ amt: '4.50', book: '2026-10-01', ref: 'SAME', info: 'Kaffee' });
    const ids = (result: StatementParseResult) =>
      statementOf(result).rows.map((row) => row.transaction.sourceId);
    expect(ids(parseStatementText(doc(stmt(coffee) + stmt(coffee))))).toEqual([
      `camt053:${IBAN}:SAME`,
      `camt053:${IBAN}:SAME`,
    ]);
    expect(
      ids(parseStatementText(doc(stmt(coffee) + stmt(coffee, 'CH5604835012345678009')))),
    ).toEqual([`camt053:${IBAN}:SAME`, 'camt053:CH5604835012345678009:SAME']);
    const euroFirst = parseStatementText(
      doc(stmt(coffee, 'CH5604835012345678009', 'EUR') + stmt(coffee)),
    );
    expect(ids(euroFirst)).toEqual([`camt053:${IBAN}:SAME`]);
    expect(skipped(euroFirst)).toEqual([[1, 'not_chf']]);
    const prefixed = doc(stmt(coffee).replace(/<(\/?)(\w)/g, '<$1camt:$2'), 'camt:');
    expect(ids(parseStatementText(prefixed))).toEqual([`camt053:${IBAN}:SAME`]);
  });

  it('reads CDATA, entities and comments', () => {
    const result = parseStatementText(
      doc(
        stmt(
          ntry({
            amt: '4.50',
            book: '2026-10-01',
            ref: 'C1',
            info: '<![CDATA[Coop & Co <Zürich>]]>',
          }) +
            ntry({
              amt: '4.50',
              book: '2026-10-01',
              ref: 'C2',
              info: 'M&amp;M &lt;3 &#x1F600; &#0;',
            }) +
            ntry({
              amt: '4.50',
              book: '2026-10-01',
              ref: 'C3',
              info: 'Kiosk <!-- comment --> Bern',
            }),
        ),
      ),
    );
    expect(statementOf(result).rows.map((row) => row.transaction.rawText)).toEqual([
      'Coop & Co <Zürich>',
      'M&M <3 😀 &#0;',
      'Kiosk Bern',
    ]);
  });
});
