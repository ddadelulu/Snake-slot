import { describe, expect, it } from 'vitest';

import { contentId } from './__fixtures__/ids';
import { CAMT_053_04, CAMT_053_08 } from './__fixtures__/statements';
import { parseStatementText } from './index';
import type { ParsedStatement, StatementParseResult } from './types';

// All files here are synthetic test data (see __fixtures__/statements.ts).

const IBAN = 'CH9300000000000000000';
const ACCOUNT = `<Acct><Id><IBAN>${IBAN}</IBAN></Id><Ccy>CHF</Ccy></Acct>`;

function camt(entries: string, account = ACCOUNT): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02"><BkToCstmrStmt>' +
    `<GrpHdr><MsgId>TEST</MsgId></GrpHdr><Stmt><Id>TEST</Id>${account}${entries}</Stmt>` +
    '</BkToCstmrStmt></Document>'
  );
}

/** A booked CHF entry; `inner` adds or overrides elements. */
function entry(inner: string, amount = '<Amt Ccy="CHF">10.00</Amt><CdtDbtInd>DBIT</CdtDbtInd>') {
  return `<Ntry>${amount}<Sts>BOOK</Sts><BookgDt><Dt>2026-09-30</Dt></BookgDt>${inner}</Ntry>`;
}

function parse(text: string): ParsedStatement {
  const result = parseStatementText(text);
  if (!result.ok) throw new Error(`expected a statement, got ${JSON.stringify(result.error)}`);
  return result.statement;
}

function failure(result: StatementParseResult) {
  return result.ok ? null : result.error;
}

describe('camt.053.001.04', () => {
  const statement = parse(CAMT_053_04);

  it('names the account and the bank', () => {
    expect(statement).toMatchObject({
      format: 'camt053',
      bank: 'zkb',
      account: { iban: IBAN },
      from: '2026-09-25',
      to: '2026-09-29',
    });
  });

  it('reads a card purchase with the moment of purchase and the creditor', () => {
    expect(statement.rows[0]).toEqual({
      line: 1,
      transaction: {
        amountRappen: -2340,
        currency: 'CHF',
        bookedOn: '2026-09-29',
        bookedTime: '14:23:00',
        merchant: 'Mustermarkt-4567 Zürich',
        rawText:
          'Einkauf ZKB Visa Debit Karte Nr. xxxx1234, Mustermarkt-4567 Zürich; Einkauf ZKB Visa Debit Karte Nr. xxxx1234',
        mcc: null,
        source: 'statement_import',
        sourceId: `camt053:${IBAN}:TEST-REF-0001`,
      },
    });
  });

  it('splits a batch entry into its transactions', () => {
    expect(statement.rows.slice(1, 3)).toMatchObject([
      {
        line: 2,
        transaction: {
          amountRappen: -10000,
          bookedOn: '2026-09-28',
          merchant: 'Fictiva Versicherung AG',
          rawText: 'Sammelauftrag e-banking; Police 000 Oktober',
          sourceId: `camt053:${IBAN}:TEST-REF-0002/1`,
        },
      },
      {
        line: 2,
        transaction: {
          amountRappen: -5000,
          merchant: 'Beispiel Verein',
          rawText: 'Sammelauftrag e-banking; Mitgliederbeitrag; 2026',
          sourceId: `camt053:${IBAN}:TEST-REF-0002/2`,
        },
      },
    ]);
  });

  it('keeps the original currency and an acceptance time with offset', () => {
    expect(statement.rows[3]?.transaction).toMatchObject({
      amountRappen: -2137,
      bookedAt: '2026-09-26T19:45:00+02:00',
      merchant: 'Exempla Café Paris',
      original: { amountMinor: -2250, currency: 'EUR' },
    });
    expect(statement.rows[3]?.transaction).not.toHaveProperty('bookedOn');
  });

  it('books a reversal as money in and finds the merchant in the text', () => {
    expect(statement.rows[4]).toMatchObject({
      line: 4,
      transaction: {
        amountRappen: 2340,
        merchant: 'Mustermarkt-4567 Zürich',
        sourceId: `camt053:${IBAN}:TEST-NTRY-0004`,
      },
    });
  });

  it('takes the debtor as the counterparty of money in', () => {
    expect(statement.rows[5]?.transaction).toMatchObject({
      amountRappen: 520000,
      merchant: 'Fictiva Arbeitgeber AG',
      rawText: 'Gutschrift Fictiva Arbeitgeber AG; Lohn September',
    });
  });

  it('skips pending entries', () => {
    expect(statement.skipped).toEqual([
      { line: 5, reason: 'not_booked', text: '2026-09-30; DBIT; 12.00; CHF; Einkauf Exempla Bar' },
    ]);
  });
});

describe('camt.053.001.08', () => {
  const statement = parse(CAMT_053_08);

  it('reads prefixed elements, Sts/Cd and Pty names, and skips the EUR account', () => {
    expect(statement).toMatchObject({ bank: 'postfinance', account: { iban: IBAN } });
    expect(statement.rows).toEqual([
      {
        line: 2,
        transaction: {
          amountRappen: -680,
          currency: 'CHF',
          bookedAt: '2026-09-29T07:12:00+02:00',
          merchant: 'Beispiel Bäckerei Bern',
          rawText: 'TWINT KAUF/DIENSTLEISTUNG VOM 29.09.2026 BEISPIEL BAECKEREI BERN',
          mcc: null,
          source: 'statement_import',
          sourceId: `camt053:${IBAN}:TEST-REF-0801`,
        },
      },
      {
        line: 3,
        transaction: {
          amountRappen: 6000,
          currency: 'CHF',
          bookedOn: '2026-09-28',
          merchant: 'Muster Max',
          rawText: 'Anteil Abendessen',
          mcc: null,
          source: 'statement_import',
          sourceId: contentId(`camt053:${IBAN}`, '2026-09-28', 6000, 'Anteil Abendessen'),
        },
      },
    ]);
    expect(statement.skipped).toEqual([
      { line: 1, reason: 'not_chf', text: '2026-09-29; DBIT; 40.00; EUR; Exempla Shop Milano' },
      { line: 4, reason: 'not_booked', text: '2026-09-30; DBIT; 9.90; CHF' },
    ]);
  });
});

describe('camt.053 entries', () => {
  it('reads dates from BookgDt/DtTm and ValDt, and entries without status', () => {
    const rows = parse(
      camt(
        '<Ntry><Amt Ccy="CHF">1.00</Amt><CdtDbtInd>DBIT</CdtDbtInd><BookgDt><DtTm>2026-09-30T08:15:00</DtTm></BookgDt></Ntry>' +
          '<Ntry><Amt Ccy="CHF">2.00</Amt><CdtDbtInd>DBIT</CdtDbtInd><ValDt><Dt>2026-09-29</Dt></ValDt></Ntry>' +
          '<Ntry><Amt Ccy="CHF">3.00</Amt><CdtDbtInd>DBIT</CdtDbtInd><BookgDt><Dt>kaputt</Dt></BookgDt><ValDt><DtTm>2026-09-28T00:00:00</DtTm></ValDt></Ntry>',
      ),
    ).rows.map((row) => row.transaction);
    expect(rows).toMatchObject([
      {
        amountRappen: -100,
        bookedOn: '2026-09-30',
        bookedTime: '08:15:00',
        merchant: null,
        rawText: null,
      },
      { amountRappen: -200, bookedOn: '2026-09-29' },
      { amountRappen: -300, bookedOn: '2026-09-28' },
    ]);
    expect(rows[0]?.sourceId).toBe(contentId(`camt053:${IBAN}`, '2026-09-30', -100, null));
  });

  it('skips entries it cannot import, with the reason', () => {
    const result = parseStatementText(
      camt(
        entry('', '<Amt Ccy="EUR">10.00</Amt><CdtDbtInd>DBIT</CdtDbtInd>') +
          entry('', '<Amt Ccy="CHF">abc</Amt><CdtDbtInd>DBIT</CdtDbtInd>') +
          entry('', '<Amt Ccy="CHF"/><CdtDbtInd>DBIT</CdtDbtInd>') +
          entry('', '<Amt Ccy="CHF">10.00</Amt>') +
          entry('', '<Amt Ccy="CHF">0.00</Amt><CdtDbtInd>CRDT</CdtDbtInd>') +
          '<Ntry><Amt Ccy="CHF">10.00</Amt><CdtDbtInd>DBIT</CdtDbtInd><Sts>BOOK</Sts></Ntry>' +
          entry('', '<Amt Ccy="CHF">100000000.01</Amt><CdtDbtInd>DBIT</CdtDbtInd>'),
      ),
    );
    expect(failure(result)).toMatchObject({
      code: 'no_transactions',
      skipped: [
        { line: 1, reason: 'not_chf' },
        { line: 2, reason: 'invalid_amount' },
        { line: 3, reason: 'invalid_amount' },
        { line: 4, reason: 'invalid_amount' },
        { line: 5, reason: 'zero_amount' },
        { line: 6, reason: 'invalid_date' },
        { line: 7, reason: 'invalid' },
      ],
    });
  });

  it('treats empty text elements as absent', () => {
    const statement = parse(
      camt(entry('<AddtlNtryInf>   </AddtlNtryInf><AcctSvcrRef></AcctSvcrRef>')),
    );
    expect(statement.rows[0]?.transaction).toMatchObject({
      rawText: null,
      sourceId: contentId(`camt053:${IBAN}`, '2026-09-30', -1000, null),
    });
  });

  it('takes an amount without currency to be in the account currency', () => {
    const statement = parse(camt(entry('', '<Amt>4.50</Amt><CdtDbtInd>DBIT</CdtDbtInd>')));
    expect(statement.rows[0]?.transaction.amountRappen).toBe(-450);
  });

  it('keeps a batch together when its parts do not add up or lack amounts', () => {
    const parts = (a: string, b: string) =>
      `<NtryDtls><TxDtls>${a}<RltdPties><Cdtr><Nm>Exempla Eins</Nm></Cdtr></RltdPties></TxDtls><TxDtls>${b}</TxDtls></NtryDtls>`;
    const statement = parse(
      camt(
        entry(
          `<AcctSvcrRef>TEST-A</AcctSvcrRef>${parts('<Amt Ccy="CHF">4.00</Amt>', '<Amt Ccy="CHF">5.00</Amt>')}<AddtlNtryInf>Sammelbuchung Exempla</AddtlNtryInf>`,
        ) +
          entry(
            `<AcctSvcrRef>TEST-B</AcctSvcrRef>${parts('<Amt Ccy="CHF">10.00</Amt>', '<AddtlTxInf>ohne Betrag</AddtlTxInf>')}`,
          ) +
          entry(
            `<AcctSvcrRef>TEST-C</AcctSvcrRef>${parts('<Amt Ccy="CHF">4.00</Amt>', '<Amt Ccy="EUR">6.00</Amt>')}`,
          ),
      ),
    );
    expect(statement.rows.map((row) => row.transaction)).toMatchObject([
      {
        amountRappen: -1000,
        merchant: 'Sammelbuchung Exempla',
        sourceId: `camt053:${IBAN}:TEST-A`,
      },
      { amountRappen: -1000, merchant: null, sourceId: `camt053:${IBAN}:TEST-B` },
      { amountRappen: -1000, sourceId: `camt053:${IBAN}:TEST-C` },
    ]);
  });

  it('splits batches by their own references, own signs or 001.02 amounts', () => {
    const statement = parse(
      camt(
        entry(
          '<NtryRef>TEST-N</NtryRef><NtryDtls>' +
            '<TxDtls><Refs><AcctSvcrRef>TEST-OWN</AcctSvcrRef></Refs><AmtDtls><TxAmt><Amt Ccy="CHF">12.00</Amt></TxAmt></AmtDtls></TxDtls>' +
            '<TxDtls><Amt Ccy="CHF">2.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><RltdPties><Dbtr><Nm>Exempla Rückzahlung</Nm></Dbtr></RltdPties></TxDtls>' +
            '</NtryDtls>',
        ) +
          entry(
            '<NtryDtls><TxDtls><Amt Ccy="CHF">6.00</Amt><AddtlTxInf>Einkauf Exempla Sechs</AddtlTxInf></TxDtls>' +
              '<TxDtls><Amt Ccy="CHF">4.00</Amt><RmtInf><Ustrd>Exempla Vier</Ustrd></RmtInf></TxDtls></NtryDtls>',
          ),
      ),
    );
    expect(statement.rows.map((row) => row.transaction)).toMatchObject([
      { amountRappen: -1200, sourceId: `camt053:${IBAN}:TEST-OWN` },
      { amountRappen: 200, merchant: 'Exempla Rückzahlung', sourceId: `camt053:${IBAN}:TEST-N/2` },
      {
        amountRappen: -600,
        merchant: 'Exempla Sechs',
        sourceId: contentId(`camt053:${IBAN}`, '2026-09-30', -600, 'Einkauf Exempla Sechs'),
      },
      {
        amountRappen: -400,
        merchant: 'Exempla Vier',
        sourceId: contentId(`camt053:${IBAN}`, '2026-09-30', -400, 'Exempla Vier'),
      },
    ]);
  });

  it('gives an entry listed twice the same id, and numbers other bookings sharing a reference', () => {
    const twice = entry('<AcctSvcrRef>TEST-SAME</AcctSvcrRef>');
    const other = entry(
      '<AcctSvcrRef>TEST-SAME</AcctSvcrRef>',
      '<Amt Ccy="CHF">10.00</Amt><CdtDbtInd>CRDT</CdtDbtInd>',
    );
    const ids = parse(camt(twice + twice + other + twice)).rows.map(
      (row) => row.transaction.sourceId,
    );
    expect(ids).toEqual([
      `camt053:${IBAN}:TEST-SAME`,
      `camt053:${IBAN}:TEST-SAME`,
      `camt053:${IBAN}:TEST-SAME:2`,
      `camt053:${IBAN}:TEST-SAME`,
    ]);
  });

  it('gives the same entry in two statements of one file the same id (QA L10)', () => {
    const coffee = entry(
      '<AcctSvcrRef>TEST-KAFFEE</AcctSvcrRef><AddtlNtryInf>Kaffee</AddtlNtryInf>',
      '<Amt Ccy="CHF">4.50</Amt><CdtDbtInd>DBIT</CdtDbtInd>',
    );
    const statement = (iban: string) =>
      `<Stmt><Id>TEST</Id><Acct><Id><IBAN>${iban}</IBAN></Id><Ccy>CHF</Ccy></Acct>${coffee}</Stmt>`;
    const file = (statements: string) =>
      '<Document><BkToCstmrStmt><GrpHdr><MsgId>TEST</MsgId></GrpHdr>' +
      `${statements}</BkToCstmrStmt></Document>`;
    const ids = (text: string) => parse(text).rows.map((row) => row.transaction.sourceId);
    expect(ids(file(statement(IBAN) + statement(IBAN)))).toEqual([
      `camt053:${IBAN}:TEST-KAFFEE`,
      `camt053:${IBAN}:TEST-KAFFEE`,
    ]);
    // Another account keeps its own ids.
    expect(ids(file(statement(IBAN) + statement('CH5604835012345678009')))).toEqual([
      `camt053:${IBAN}:TEST-KAFFEE`,
      'camt053:CH5604835012345678009:TEST-KAFFEE',
    ]);
  });

  it('numbers batch parts that share their own reference by position', () => {
    const part = (amount: string, name: string) =>
      `<TxDtls><Refs><AcctSvcrRef>TEST-SHARED</AcctSvcrRef></Refs><Amt Ccy="CHF">${amount}</Amt>` +
      `<RltdPties><Cdtr><Nm>${name}</Nm></Cdtr></RltdPties></TxDtls>`;
    const batch = (inner: string) =>
      entry(inner, '<Amt Ccy="CHF">10.00</Amt><CdtDbtInd>DBIT</CdtDbtInd>');
    const statement = parse(
      camt(
        batch(
          `<AcctSvcrRef>TEST-ENTRY</AcctSvcrRef><NtryDtls>${part('5.00', 'Exempla A')}${part('5.00', 'Exempla B')}</NtryDtls>`,
        ) +
          batch(`<NtryDtls>${part('5.00', 'Exempla C')}${part('5.00', 'Exempla D')}</NtryDtls>`) +
          batch(
            '<AcctSvcrRef>TEST-OWN</AcctSvcrRef><NtryDtls>' +
              '<TxDtls><Refs><AcctSvcrRef>TEST-OWN</AcctSvcrRef></Refs><Amt Ccy="CHF">4.00</Amt></TxDtls>' +
              '<TxDtls><Refs><AcctSvcrRef>TEST-OTHER</AcctSvcrRef></Refs><Amt Ccy="CHF">6.00</Amt></TxDtls>' +
              '</NtryDtls>',
          ),
      ),
    );
    expect(statement.rows.map((row) => row.transaction.sourceId)).toEqual([
      `camt053:${IBAN}:TEST-ENTRY/1`,
      `camt053:${IBAN}:TEST-ENTRY/2`,
      `camt053:${IBAN}:TEST-SHARED/1`,
      `camt053:${IBAN}:TEST-SHARED/2`,
      `camt053:${IBAN}:TEST-OWN/1`,
      `camt053:${IBAN}:TEST-OTHER`,
    ]);
  });

  it('skips a negative amount (the sign belongs in CdtDbtInd) and keeps such a batch whole', () => {
    const result = parseStatementText(
      camt(
        entry(
          '<AcctSvcrRef>TEST-NEG</AcctSvcrRef>',
          '<Amt Ccy="CHF">-5.00</Amt><CdtDbtInd>DBIT</CdtDbtInd>',
        ) +
          entry(
            '<AcctSvcrRef>TEST-BATCH</AcctSvcrRef><NtryDtls>' +
              '<TxDtls><Amt Ccy="CHF">15.00</Amt></TxDtls><TxDtls><Amt Ccy="CHF">-5.00</Amt></TxDtls>' +
              '</NtryDtls>',
          ),
      ),
    );
    expect(result).toMatchObject({
      ok: true,
      statement: {
        rows: [
          { line: 2, transaction: { amountRappen: -1000, sourceId: `camt053:${IBAN}:TEST-BATCH` } },
        ],
        skipped: [{ line: 1, reason: 'invalid_amount', text: '2026-09-30; DBIT; -5.00; CHF' }],
      },
    });
  });

  it('finds names in ultimate parties, repeated elements and entities', () => {
    const detail = (parties: string) =>
      `<NtryDtls><TxDtls><RltdPties>${parties}</RltdPties></TxDtls></NtryDtls>`;
    const statement = parse(
      camt(
        entry(
          detail(
            '<Cdtr><Id>0</Id></Cdtr><UltmtCdtr><Nm>Exempla Endempf&#228;nger</Nm></UltmtCdtr>',
          ),
        ) +
          entry(detail('<Cdtr><Nm>M&amp;M Exempla</Nm></Cdtr><Cdtr><Nm>Zweiter</Nm></Cdtr>')) +
          entry(detail('<Cdtr><Nm>Exempla &#0; &#xD800; &#1114112; &copy;</Nm></Cdtr>')) +
          entry(detail('<Dbtr><Nm>Falsche Richtung</Nm></Dbtr>')),
      ),
    );
    expect(statement.rows.map((row) => row.transaction.merchant)).toEqual([
      'Exempla Endempfänger',
      'M&M Exempla',
      'Exempla &#0; &#xD800; &#1114112; &copy;',
      null,
    ]);
  });

  it('keeps an acceptance time with an offset as the exact instant, also at midnight', () => {
    const accepted = (moment: string) =>
      entry(
        `<NtryDtls><TxDtls><RltdDts><AccptncDtTm>${moment}</AccptncDtTm></RltdDts></TxDtls></NtryDtls>`,
      );
    const rows = parse(
      camt(
        accepted('2026-09-29T00:00:00+05:00') +
          accepted('2026-09-29T00:00:00Z') +
          accepted('2026-09-29T00:00:00') +
          accepted('2026-09-29T23:30:00.123+0200') +
          accepted('kaputt'),
      ),
    ).rows.map((row) => row.transaction);
    expect(rows.map((row) => row.bookedAt ?? [row.bookedOn, row.bookedTime])).toEqual([
      '2026-09-29T00:00:00+05:00',
      '2026-09-29T00:00:00Z',
      ['2026-09-29', undefined],
      '2026-09-29T23:30:00+02:00',
      ['2026-09-30', undefined],
    ]);
  });

  it('dates a card purchase without acceptance time by the day its text states (D-043)', () => {
    const booked = (bookingDate: string, info: string) =>
      `<Ntry><Amt Ccy="CHF">19.90</Amt><CdtDbtInd>DBIT</CdtDbtInd><Sts>BOOK</Sts>` +
      `<BookgDt><Dt>${bookingDate}</Dt></BookgDt><AddtlNtryInf>${info}</AddtlNtryInf></Ntry>`;
    const rows = parse(
      camt(
        booked(
          '2026-10-03',
          'KAUF/DIENSTLEISTUNG VOM 02.10.2026 KARTEN NR. XXXX1234 EXEMPLA ZUERICH',
        ) +
          booked('2026-10-03', 'Achat du 03.10.2026 Exempla Lausanne') +
          booked('2026-10-03', 'Einkauf vom 04.10.2026 Exempla Bern') +
          booked('2026-11-05', 'Einkauf vom 02.10.2026 Exempla Basel') +
          '<Ntry><Amt Ccy="CHF">5.00</Amt><CdtDbtInd>DBIT</CdtDbtInd><ValDt><Dt>2026-10-03</Dt></ValDt>' +
          '<NtryDtls><TxDtls><RmtInf><Ustrd>Einkauf vom 01.10.2026</Ustrd></RmtInf></TxDtls></NtryDtls></Ntry>',
      ),
    ).rows.map((row) => row.transaction.bookedOn);
    // Later than the booking or more than 31 days before it: the booking date stays.
    expect(rows).toEqual(['2026-10-02', '2026-10-03', '2026-10-03', '2026-11-05', '2026-10-01']);
  });

  it('reads original amounts by ISO 4217 minor units and ignores unusable ones', () => {
    const instructed = (amount: string) =>
      `<NtryDtls><TxDtls><AmtDtls><InstdAmt>${amount}</InstdAmt></AmtDtls></TxDtls></NtryDtls>`;
    const statement = parse(
      camt(
        entry(instructed('<Amt Ccy="JPY">1800</Amt>')) +
          entry('<AmtDtls><InstdAmt><Amt Ccy="KWD">3.125</Amt></InstdAmt></AmtDtls>') +
          entry(instructed('<Amt Ccy="CHF">10.00</Amt>')) +
          entry(instructed('<Amt Ccy="EUR">1.005</Amt>')) +
          entry(instructed('<Amt>9.00</Amt>')) +
          entry(instructed('<Amt Ccy="USD"/>')),
      ),
    );
    expect(statement.rows.map((row) => row.transaction.original)).toEqual([
      { amountMinor: -1800, currency: 'JPY' },
      { amountMinor: -3125, currency: 'KWD' },
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });

  it('works without IBAN, currency or a known bank', () => {
    const statement = parse(
      camt(
        entry('<AcctSvcrRef>TEST-X</AcctSvcrRef>'),
        '<Acct><Id><Othr><Id>0000</Id></Othr></Id><Svcr><FinInstnId><BIC>TESTCHZZ</BIC></FinInstnId></Svcr></Acct>',
      ),
    );
    expect(statement).toMatchObject({ bank: null, account: { iban: null } });
    expect(statement.rows[0]?.transaction.sourceId).toBe('camt053:camt053:TEST-X');
  });
});

describe('camt.053 files', () => {
  it('refuses a file without a CHF statement', () => {
    const euro = ACCOUNT.replace('CHF', 'EUR');
    expect(parseStatementText(camt(entry(''), euro))).toEqual({
      ok: false,
      error: { code: 'not_chf' },
    });
  });

  it('reports a statement without entries', () => {
    expect(failure(parseStatementText(camt('')))).toEqual({ code: 'no_transactions', skipped: [] });
    const noStatement =
      '<Document><BkToCstmrStmt><GrpHdr><MsgId>TEST</MsgId></GrpHdr></BkToCstmrStmt></Document>';
    expect(failure(parseStatementText(noStatement))).toEqual({
      code: 'no_transactions',
      skipped: [],
    });
  });

  it('refuses DOCTYPE and ENTITY declarations (no entity expansion)', () => {
    const bomb =
      '<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;">]>' +
      '<Document><BkToCstmrStmt><Stmt>&lol2;</Stmt></BkToCstmrStmt></Document>';
    expect(failure(parseStatementText(bomb))).toEqual({
      code: 'invalid_xml',
      message: 'DOCTYPE and ENTITY declarations are not allowed',
    });
    expect(
      failure(parseStatementText('<!ENTITY x "y"><Document><BkToCstmrStmt/></Document>')),
    ).toMatchObject({
      code: 'invalid_xml',
    });
  });

  it('refuses malformed XML and dangerous element names', () => {
    expect(failure(parseStatementText('<Document><BkToCstmrStmt></Document>'))).toMatchObject({
      code: 'invalid_xml',
    });
    expect(
      failure(
        parseStatementText(
          '<Document><BkToCstmrStmt><__proto__>x</__proto__></BkToCstmrStmt></Document>',
        ),
      ),
    ).toEqual({ code: 'invalid_xml', message: 'The file is not a readable XML document' });
  });

  it('refuses other XML that only mentions BkToCstmrStmt', () => {
    expect(failure(parseStatementText('<Other><BkToCstmrStmt/></Other>'))).toEqual({
      code: 'unsupported_format',
    });
  });
});
