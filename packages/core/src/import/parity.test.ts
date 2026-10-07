import { describe, expect, it } from 'vitest';

import { localDateIn } from '../engine/dates';
import { parseStatementText } from './index';
import type { ParsedStatement } from './types';

// All files here are synthetic test data (see __fixtures__/statements.ts).

/**
 * QA H2 / D-043: the same statement exported as CSV and as camt.053 must give the same amounts on
 * the same days, so that importing both does not count anything twice (the database then sees
 * look-alikes, or already imported rows, instead of new purchases).
 */

const IBAN = 'CH9300000000000000000';

function parse(text: string): ParsedStatement {
  const result = parseStatementText(text);
  if (!result.ok) throw new Error(`expected a statement, got ${JSON.stringify(result.error)}`);
  return result.statement;
}

/** [day in Zurich, amount] per row, in a fixed order. */
function lineUp(statement: ParsedStatement): [string, number][] {
  return statement.rows
    .map(({ transaction }): [string, number] => [
      transaction.bookedOn ??
        localDateIn(new Date(transaction.bookedAt as string), 'Europe/Zurich'),
      transaction.amountRappen,
    ])
    .sort(([dayA, amountA], [dayB, amountB]) =>
      dayA === dayB ? amountA - amountB : dayA < dayB ? -1 : 1,
    );
}

/** A camt.053.001.08 file for the test account with the given entries. */
function camt(entries: string[], bic = 'TESTCHZZXXX'): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.08"><BkToCstmrStmt>' +
    '<GrpHdr><MsgId>TEST-PARITY</MsgId></GrpHdr><Stmt><Id>TEST-PARITY</Id>' +
    `<Acct><Id><IBAN>${IBAN}</IBAN></Id><Ccy>CHF</Ccy><Svcr><FinInstnId><BICFI>${bic}</BICFI></FinInstnId></Svcr></Acct>` +
    `${entries.join('')}</Stmt></BkToCstmrStmt></Document>`
  );
}

type Part = { amount: string; creditor: string; accepted?: string };

/** A booked debit entry; one part is a single transaction, several are a batch. */
function debit(o: { amount: string; booked: string; ref: string; info: string; parts: Part[] }) {
  const details = o.parts
    .map(
      (part) =>
        `<TxDtls><Amt Ccy="CHF">${part.amount}</Amt><CdtDbtInd>DBIT</CdtDbtInd>` +
        `<RltdPties><Cdtr><Pty><Nm>${part.creditor}</Nm></Pty></Cdtr></RltdPties>` +
        (part.accepted === undefined
          ? ''
          : `<RltdDts><AccptncDtTm>${part.accepted}</AccptncDtTm></RltdDts>`) +
        '</TxDtls>',
    )
    .join('');
  return (
    `<Ntry><Amt Ccy="CHF">${o.amount}</Amt><CdtDbtInd>DBIT</CdtDbtInd><Sts><Cd>BOOK</Cd></Sts>` +
    `<BookgDt><Dt>${o.booked}</Dt></BookgDt><AcctSvcrRef>${o.ref}</AcctSvcrRef>` +
    `<NtryDtls>${details}</NtryDtls><AddtlNtryInf>${o.info}</AddtlNtryInf></Ntry>`
  );
}

describe('the same statement as CSV and camt.053', () => {
  it('lines up a UBS statement: card purchases, a collective order, a direct debit', () => {
    const csv = parse(
      [
        'IBAN:;CH93 0000 0000 0000 0000 0;',
        '',
        'Abschlussdatum;Abschlusszeit;Buchungsdatum;Valutadatum;Währung;Belastung;Gutschrift;Einzelbetrag;Saldo;Transaktions-Nr.;Beschreibung1;Beschreibung2;Beschreibung3;Fussnoten;',
        '2026-10-02;18:40:00;2026-10-05;2026-10-05;CHF;-45.80;;;;TEST0000000101;Exempla Markt Zürich;Zahlung Debitkarte;Kartennummer: XXXX 1234;;',
        '2026-10-02;09:10:00;2026-10-03;2026-10-03;CHF;-6.80;;;;TEST0000000102;Exempla Bäckerei Bern;TWINT;;;',
        ';;2026-10-01;2026-10-01;CHF;-420.00;;;;TEST0000000103;Fictiva Krankenkasse AG;Lastschrift;;;',
        ';;2026-09-30;2026-09-30;CHF;-150.00;;;;TEST0000000104;Sammelauftrag;e-banking-Auftrag;;;',
        ';;2026-09-30;2026-09-30;CHF;;;-100.00;;TEST0000000104;Fictiva Versicherung AG;;;;',
        ';;2026-09-30;2026-09-30;CHF;;;-50.00;;TEST0000000104;Beispiel Verein;;;;',
      ].join('\r\n'),
    );
    const xml = parse(
      camt(
        [
          debit({
            amount: '45.80',
            booked: '2026-10-05',
            ref: 'TEST-UBS-1',
            info: 'Zahlung Debitkarte',
            parts: [
              {
                amount: '45.80',
                creditor: 'Exempla Markt Zürich',
                accepted: '2026-10-02T18:40:00+02:00',
              },
            ],
          }),
          debit({
            amount: '6.80',
            booked: '2026-10-03',
            ref: 'TEST-UBS-2',
            info: 'TWINT',
            parts: [
              {
                amount: '6.80',
                creditor: 'Exempla Bäckerei Bern',
                accepted: '2026-10-02T09:10:00',
              },
            ],
          }),
          debit({
            amount: '420.00',
            booked: '2026-10-01',
            ref: 'TEST-UBS-3',
            info: 'Lastschrift',
            parts: [{ amount: '420.00', creditor: 'Fictiva Krankenkasse AG' }],
          }),
          debit({
            amount: '150.00',
            booked: '2026-09-30',
            ref: 'TEST-UBS-4',
            info: 'Sammelauftrag e-banking-Auftrag',
            parts: [
              { amount: '100.00', creditor: 'Fictiva Versicherung AG' },
              { amount: '50.00', creditor: 'Beispiel Verein' },
            ],
          }),
        ],
        'UBSWCHZH80A',
      ),
    );
    const expected: [string, number][] = [
      ['2026-09-30', -10000],
      ['2026-09-30', -5000],
      ['2026-10-01', -42000],
      ['2026-10-02', -4580],
      ['2026-10-02', -680],
    ];
    expect(lineUp(csv)).toEqual(expected);
    expect(lineUp(xml)).toEqual(expected);
    expect([csv.bank, xml.bank]).toEqual(['ubs', 'ubs']);
    expect(csv.rows.map((row) => row.transaction.merchant)).toEqual(
      xml.rows.map((row) => row.transaction.merchant),
    );
  });

  it('lines up a PostFinance statement whose card purchases state their day in the text (QA e2e1)', () => {
    const csv = parse(
      [
        'Datum von:;01.10.2026',
        'Konto:;CH9300000000000000000',
        'Buchungsdatum;Avisierungstext;Gutschrift;Lastschrift;Valuta;Saldo',
        '05.10.2026;"KAUF/DIENSTLEISTUNG VOM 02.10.2026 KARTEN NR. XXXX1234 MIGROS M ZUERICH";;-45.80;05.10.2026;1211.16',
        '03.10.2026;"KAUF/DIENSTLEISTUNG VOM 02.10.2026 KARTEN NR. XXXX1234 COOP-4567 ZUERICH";;-19.90;03.10.2026;1257.0',
        '01.10.2026;"LASTSCHRIFT CSS KRANKEN-VERSICHERUNG AG";;-420.00;01.10.2026;1276.9',
      ].join('\r\n'),
    );
    const card = (
      amount: string,
      booked: string,
      ref: string,
      merchant: string,
      accepted?: string,
    ) =>
      debit({
        amount,
        booked,
        ref,
        info: `KAUF/DIENSTLEISTUNG VOM 02.10.2026 KARTEN NR. XXXX1234 ${merchant.toUpperCase()}`,
        parts: [{ amount, creditor: merchant, ...(accepted === undefined ? {} : { accepted }) }],
      });
    const directDebit = debit({
      amount: '420.00',
      booked: '2026-10-01',
      ref: 'PF-3',
      info: 'LASTSCHRIFT CSS KRANKEN-VERSICHERUNG AG',
      parts: [{ amount: '420.00', creditor: 'CSS Kranken-Versicherung AG' }],
    });
    // With the acceptance time (as in the QA file) and without (the text's day is used).
    const withTimes = parse(
      camt(
        [
          card('45.80', '2026-10-05', 'PF-1', 'Migros M Zürich', '2026-10-02T18:40:00+02:00'),
          card('19.90', '2026-10-03', 'PF-2', 'Coop-4567 Zürich', '2026-10-02T09:10:00+02:00'),
          directDebit,
        ],
        'POFICHBEXXX',
      ),
    );
    const withoutTimes = parse(
      camt(
        [
          card('45.80', '2026-10-05', 'PF-1', 'Migros M Zürich'),
          card('19.90', '2026-10-03', 'PF-2', 'Coop-4567 Zürich'),
          directDebit,
        ],
        'POFICHBEXXX',
      ),
    );
    const expected: [string, number][] = [
      ['2026-10-01', -42000],
      ['2026-10-02', -4580],
      ['2026-10-02', -1990],
    ];
    expect(lineUp(csv)).toEqual(expected);
    expect(lineUp(withTimes)).toEqual(expected);
    expect(lineUp(withoutTimes)).toEqual(expected);
    expect(withTimes.rows[0]?.transaction.bookedAt).toBe('2026-10-02T18:40:00+02:00');
  });

  it('lines up a ZKB statement with an unsigned collective order and a direct debit', () => {
    const csv = parse(
      [
        '"Datum";"Buchungstext";"Whg";"Betrag Detail";"ZKB-Referenz";"Referenznummer";"Belastung CHF";"Gutschrift CHF";"Valuta";"Saldo CHF";"Zahlungszweck";"Details"',
        '"02.10.2026";"Sammelauftrag e-banking";"";"";"Z000000101";"";"230.00";"";"02.10.2026";"1\'000.00";"";""',
        '"02.10.2026";"Fictiva Versicherung AG";"CHF";"180.00";"";"";"";"";"02.10.2026";"";"Police 000";""',
        '"02.10.2026";"Beispiel Verein";"CHF";"50.00";"";"";"";"";"02.10.2026";"";"Beitrag";""',
        '"01.10.2026";"LSV Fictiva Krankenkasse AG";"";"";"Z000000102";"";"412.35";"";"01.10.2026";"1\'230.00";"";""',
      ].join('\r\n'),
    );
    const xml = parse(
      camt(
        [
          debit({
            amount: '230.00',
            booked: '2026-10-02',
            ref: 'Z000000101',
            info: 'Sammelauftrag e-banking',
            parts: [
              { amount: '180.00', creditor: 'Fictiva Versicherung AG' },
              { amount: '50.00', creditor: 'Beispiel Verein' },
            ],
          }),
          debit({
            amount: '412.35',
            booked: '2026-10-01',
            ref: 'Z000000102',
            info: 'LSV Fictiva Krankenkasse AG',
            parts: [{ amount: '412.35', creditor: 'Fictiva Krankenkasse AG' }],
          }),
        ],
        'ZKBKCHZZ80A',
      ),
    );
    const expected: [string, number][] = [
      ['2026-10-01', -41235],
      ['2026-10-02', -18000],
      ['2026-10-02', -5000],
    ];
    expect(lineUp(csv)).toEqual(expected);
    expect(lineUp(xml)).toEqual(expected);
  });
});
