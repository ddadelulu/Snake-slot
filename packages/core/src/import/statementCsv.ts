import { createCollector } from './collect';
import { parseCsv, type CsvRecord } from './csv';
import { merchantFromText } from './merchantText';
import type { ColumnMapping, PartsResult, StatementBank, StatementOptions } from './types';
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
  type AmountCell,
  type StatementDate,
} from './values';

type Role =
  | 'tradeDate'
  | 'bookingDate'
  | 'valueDate'
  | 'time'
  | 'amount'
  | 'debit'
  | 'credit'
  | 'detail'
  | 'text'
  | 'merchant'
  | 'currency'
  | 'id'
  | 'originalAmount'
  | 'originalCurrency'
  | 'iban'
  | 'fee'
  | 'state';

/**
 * Column names per role, as compact keys (lower case, accents folded, no spaces or punctuation:
 * "Transaktions-Nr." → "transaktionsnr", "Data dell'operazione" → "datadelloperazione"). German,
 * English, French and Italian, from the exports of Swiss banks.
 */
const SYNONYMS: Record<Role, readonly string[]> = {
  tradeDate: [
    'abschlussdatum',
    'tradedate',
    'transaktionsdatum',
    'transactiondate',
    'starteddate',
    'kaufdatum',
    'einkaufsdatum',
    'purchasedate',
    'datedetransaction',
    'datedelatransaction',
    'datadelloperazione',
    'dataoperazione',
    'datatransazione',
  ],
  bookingDate: [
    'buchungsdatum',
    'buchungstag',
    'bookingdate',
    'bookeddate',
    'bookedat',
    'postingdate',
    'completeddate',
    'datum',
    'date',
    'datedecomptabilisation',
    'datecomptable',
    'datadiregistrazione',
    'dataregistrazione',
    'datacontabile',
    'data',
  ],
  valueDate: [
    'valuta',
    'valutadatum',
    'valutadate',
    'valuedate',
    'valeur',
    'datevaleur',
    'datedevaleur',
    'datavaluta',
    'wertstellung',
  ],
  time: [
    'abschlusszeit',
    'tradetime',
    'transaktionszeit',
    'transactiontime',
    'uhrzeit',
    'zeit',
    'time',
    'heure',
    'heuredetransaction',
    'ora',
    'oradelloperazione',
  ],
  amount: [
    'betrag',
    'amount',
    'creditdebitamount',
    'montant',
    'importo',
    'umsatz',
    'buchungsbetrag',
    'transaktionsbetrag',
    'transactionamount',
    'chf',
  ],
  debit: [
    'belastung',
    'belastungen',
    'lastschrift',
    'lastschriften',
    'debit',
    'debits',
    'soll',
    'addebito',
    'addebiti',
    'debitamount',
    'moneyout',
    'paidout',
    'ausgang',
    'ausgaben',
  ],
  credit: [
    'gutschrift',
    'gutschriften',
    'credit',
    'credits',
    'haben',
    'accredito',
    'accrediti',
    'creditamount',
    'moneyin',
    'paidin',
    'eingang',
    'einnahmen',
  ],
  detail: [
    'einzelbetrag',
    'betragdetail',
    'detailbetrag',
    'individualamount',
    'sousmontant',
    'importoparziale',
  ],
  text: [
    'avisierungstext',
    'buchungstext',
    'beschreibung',
    'text',
    'texte',
    'testo',
    'description',
    'details',
    'zahlungszweck',
    'mitteilung',
    'mitteilungen',
    'libelle',
    'descrizione',
    'verwendungszweck',
    'bemerkung',
    'bemerkungen',
    'subject',
    'betreff',
    'causale',
    'communication',
  ],
  merchant: [
    'merchant',
    'merchantname',
    'handler',
    'haendler',
    'zahlungsempfanger',
    'zahlungsempfaenger',
    'empfanger',
    'empfaenger',
    'payee',
    'counterparty',
    'gegenpartei',
    'begunstigter',
    'beguenstigter',
    'commercant',
    'beneficiaire',
    'esercente',
    'beneficiario',
  ],
  currency: [
    'wahrung',
    'waehrung',
    'whg',
    'currency',
    'devise',
    'monnaie',
    'moneta',
    'divisa',
    'ccy',
  ],
  id: [
    'transaktionsnr',
    'transaktionsnummer',
    'transactionno',
    'transactionnumber',
    'transactionid',
    'zkbreferenz',
    'buchungsnr',
    'buchungsnummer',
    'referenz',
    'reference',
    'ndetransaction',
    'nditransazione',
    'numeroditransazione',
  ],
  originalAmount: ['originalamount', 'originalbetrag', 'montantoriginal', 'importooriginale'],
  originalCurrency: [
    'originalcurrency',
    'originalwahrung',
    'originalwaehrung',
    'devisedorigine',
    'valutaoriginale',
  ],
  iban: ['iban'],
  fee: ['fee'],
  state: ['state'],
};

const ROLE_BY_KEY = new Map<string, Role>();
for (const [role, keys] of Object.entries(SYNONYMS) as [Role, readonly string[]][]) {
  for (const key of keys) ROLE_BY_KEY.set(key, role);
}
/** UBS splits its text into Beschreibung1-3 / Description1-3 / Descrizione1-3. */
const NUMBERED_TEXT = /^(?:beschreibung|description|descrizione|libelle|text|texte|testo)\d$/;

const FOLD = new Map<string, string>();
for (const [letters, plain] of [
  ['àáâãäå', 'a'],
  ['ç', 'c'],
  ['èéêë', 'e'],
  ['ìíîï', 'i'],
  ['ñ', 'n'],
  ['òóôõöø', 'o'],
  ['ùúûü', 'u'],
  ['ýÿ', 'y'],
  ['ß', 'ss'],
  ['æ', 'ae'],
  ['œ', 'oe'],
] as const) {
  for (const letter of letters) FOLD.set(letter, plain);
}

const HEADER_SEARCH = 30;
const VALUTA_SAMPLE = 20;
const SAMPLE_ROWS = 5;
const MAX_RAW_TEXT = 4000;
const MAX_MERCHANT = 200;

/** Column positions of one file (0-based). `dates` is in priority order: trade, booking, value. */
type Layout = {
  dates: number[];
  time?: number;
  amount?: number;
  debit?: number;
  credit?: number;
  detail?: number;
  fee?: number;
  state?: number;
  text: number[];
  merchant?: number;
  currency?: number;
  id?: number;
  originalAmount?: number;
  originalCurrency?: number;
  iban?: number;
  /** False when the amount columns say CHF in their name (ZKB "Belastung CHF"). */
  filterCurrency: boolean;
};

type SingleRole = Exclude<Role, 'text' | 'tradeDate' | 'bookingDate' | 'valueDate'>;

/**
 * Parses a bank's CSV export (D-032). Finds the header line below any metadata lines, maps the
 * columns by name (see SYNONYMS) and reads each data line into a transaction. With
 * `options.mapping` the person's own column assignment is used instead. When no date column or no
 * amount column is recognised, returns `unknown_columns` with the columns and a sample for the
 * mapping screen.
 */
export function parseStatementCsv(text: string, options: StatementOptions): PartsResult {
  const { records } = parseCsv(text);
  if (options.mapping !== undefined) return parseWithMapping(records, options.mapping);

  for (let index = 0; index < Math.min(records.length, HEADER_SEARCH); index += 1) {
    const header = records[index] as CsvRecord;
    const data = records.slice(index + 1);
    const { layout, bank } = detectLayout(header.fields, data);
    if (layout !== null) return readRows(records.slice(0, index), header, data, layout, bank);
  }
  return unknownColumns(records);
}

/** Compact key of a column name: "Belastung CHF" → "belastungchf", "Währung" → "wahrung". */
function headerKey(name: string): string {
  let folded = '';
  for (const char of name.toLowerCase()) folded += FOLD.get(char) ?? char;
  return folded.replace(/[^a-z0-9]/g, '');
}

function roleOf(key: string): Role | undefined {
  return ROLE_BY_KEY.get(key) ?? (NUMBERED_TEXT.test(key) ? 'text' : undefined);
}

function detectBank(keys: ReadonlySet<string>): StatementBank | null {
  const all = (...names: string[]) => names.every((name) => keys.has(name));
  const any = (...names: string[]) => names.some((name) => keys.has(name));
  if (keys.has('zkbreferenz')) return 'zkb';
  if (all('type', 'product', 'starteddate', 'completeddate', 'state')) return 'revolut';
  if (all('originalamount', 'originalcurrency', 'exchangerate', 'subject')) return 'neon';
  if (all('bookedat', 'creditdebitamount')) return 'raiffeisen';
  if (keys.has('avisierungstext')) return 'postfinance';
  if (
    any('einzelbetrag', 'individualamount', 'sousmontant', 'importoparziale') &&
    any('beschreibung1', 'description1', 'descrizione1')
  ) {
    return 'ubs';
  }
  return null;
}

function detectLayout(
  headerFields: readonly string[],
  data: readonly CsvRecord[],
): { layout: Layout | null; bank: StatementBank | null; guess: Partial<ColumnMapping> } {
  const keys = headerFields.map((field) => headerKey(cleanCell(field)));
  const bank = detectBank(new Set(keys));
  const single: Partial<Record<SingleRole, number>> = {};
  const dated: Partial<Record<'tradeDate' | 'bookingDate' | 'valueDate', number>> = {};
  const text: number[] = [];
  let filterCurrency = true;

  keys.forEach((key, column) => {
    const base = key.length > 3 ? key.replace(/(?:in)?chf$/, '') : key;
    let role = roleOf(key) ?? roleOf(base);
    if (role === undefined) return;
    if (key === 'valuta' && looksLikeCurrency(data, column)) role = 'currency';
    if (key === 'description' && (bank === 'neon' || bank === 'revolut')) role = 'merchant';
    if ((role === 'fee' || role === 'state') && bank !== 'revolut') return;
    if (role === 'text') {
      text.push(column);
    } else if (role === 'tradeDate' || role === 'bookingDate' || role === 'valueDate') {
      dated[role] ??= column;
    } else {
      single[role] ??= column;
      if (base !== key && (role === 'amount' || role === 'debit' || role === 'credit')) {
        filterCurrency = false;
      }
    }
  });

  const dates = [dated.tradeDate, dated.bookingDate, dated.valueDate].filter(
    (column): column is number => column !== undefined,
  );
  const guess: Partial<ColumnMapping> = { text };
  if (dates[0] !== undefined) guess.date = dates[0];
  for (const role of ['time', 'amount', 'debit', 'credit', 'merchant', 'currency', 'id'] as const) {
    if (single[role] !== undefined) guess[role] = single[role];
  }
  const hasAmount =
    single.amount !== undefined || single.debit !== undefined || single.credit !== undefined;
  const layout = dates.length > 0 && hasAmount ? { ...single, dates, text, filterCurrency } : null;
  return { layout, bank, guess };
}

/** Italian exports call the currency "Valuta", German ones the value date: the cells decide. */
function looksLikeCurrency(data: readonly CsvRecord[], column: number): boolean {
  const values = data
    .slice(0, VALUTA_SAMPLE)
    .map((record) => cleanCell(record.fields[column] ?? ''))
    .filter((value) => value !== '');
  return values.length > 0 && values.every((value) => /^[A-Za-z]{3}$/.test(value));
}

function parseWithMapping(records: readonly CsvRecord[], mapping: ColumnMapping): PartsResult {
  const headerIndex =
    mapping.headerRow === 0 ? -1 : records.findIndex((record) => record.line === mapping.headerRow);
  const columns = records.reduce((most, record) => Math.max(most, record.fields.length), 0);
  const indexes = [
    mapping.date,
    mapping.time,
    mapping.amount,
    mapping.debit,
    mapping.credit,
    mapping.merchant,
    mapping.currency,
    mapping.id,
    ...mapping.text,
  ];
  const valid =
    (mapping.headerRow === 0 || headerIndex !== -1) &&
    (mapping.amount ?? mapping.debit ?? mapping.credit) !== undefined &&
    indexes.every(
      (index) => index === undefined || (Number.isInteger(index) && index >= 0 && index < columns),
    );
  if (!valid) return unknownColumns(records);

  const layout: Layout = {
    dates: [mapping.date],
    time: mapping.time,
    amount: mapping.amount,
    debit: mapping.debit,
    credit: mapping.credit,
    text: mapping.text,
    merchant: mapping.merchant,
    currency: mapping.currency,
    id: mapping.id,
    filterCurrency: true,
  };
  const metadata = records.slice(0, Math.max(headerIndex, 0));
  return readRows(metadata, records[headerIndex], records.slice(headerIndex + 1), layout, null);
}

function unknownColumns(records: readonly CsvRecord[]): PartsResult {
  const frequency = new Map<number, number>();
  for (const record of records) {
    const count = record.fields.length;
    if (count >= 2) frequency.set(count, (frequency.get(count) ?? 0) + 1);
  }
  let modal = 0;
  let modalTimes = 0;
  for (const [count, times] of frequency) {
    if (times > modalTimes || (times === modalTimes && count > modal)) {
      modal = count;
      modalTimes = times;
    }
  }
  const index = records.findIndex((record) => record.fields.length === modal);
  if (index === -1) return { ok: false, error: { code: 'unsupported_format' } };
  const header = records[index] as CsvRecord;
  const data = records.slice(index + 1);
  const sample = data
    .map((record) => record.fields.map(cleanCell))
    .filter((cells) => cells.some((cell) => cell !== ''))
    .slice(0, SAMPLE_ROWS);
  const { guess } = detectLayout(header.fields, data);
  return {
    ok: false,
    error: {
      code: 'unknown_columns',
      headerRow: header.line,
      columns: header.fields.map(cleanCell),
      sample,
      guess: { headerRow: header.line, ...guess },
    },
  };
}

/** Trims, collapses whitespace and unwraps Excel's text-forcing `="01.09.2026"`. */
function cleanCell(field: string): string {
  const text = cleanText(field);
  const excel = /^="(.*)"$/.exec(text);
  return excel === null ? text : (excel[1] as string).trim();
}

function readRows(
  metadata: readonly CsvRecord[],
  header: CsvRecord | undefined,
  data: readonly CsvRecord[],
  layout: Layout,
  bank: StatementBank | null,
): PartsResult {
  const iban = findIban(metadata, data, layout.iban);
  const collector = createCollector('csv', bank);
  const headerCells = header?.fields.map(cleanCell).join('\u0000');

  for (const record of data) {
    const cells = record.fields.map(cleanCell);
    if (cells.every((cell) => cell === '') || cells.join('\u0000') === headerCells) continue;
    const cell = (column: number | undefined) =>
      column === undefined ? '' : (cells[column] ?? '');
    const line = record.line;
    const display = cells.filter((value) => value !== '').join('; ');

    const state = cell(layout.state).toUpperCase();
    if (state !== '' && state !== 'COMPLETED') {
      collector.skip(line, 'not_booked', display);
      continue;
    }
    const currency = cell(layout.currency).toUpperCase();
    if (layout.filterCurrency && currency !== '' && currency !== 'CHF') {
      collector.skip(line, 'not_chf', display);
      continue;
    }

    const amount = parseAmountCell(cell(layout.amount));
    const debit = parseAmountCell(cell(layout.debit));
    const credit = parseAmountCell(cell(layout.credit));
    const fee = parseAmountCell(cell(layout.fee));
    const mainEmpty = [amount, debit, credit].every((value) => value.kind === 'empty');
    if (mainEmpty && parseAmountCell(cell(layout.detail)).kind !== 'empty') {
      collector.skip(line, 'collective_detail', display);
      continue;
    }

    let when = rowDate(layout.dates.map(cell));
    if (mainEmpty) {
      // Lines without any amount and without a date are footers ("Disclaimer: …"), not data.
      if (when !== null) collector.skip(line, 'no_amount', display);
      continue;
    }
    if (when === null) {
      collector.skip(line, 'invalid_date', display);
      continue;
    }
    if ([amount, debit, credit, fee].some((value) => value.kind === 'invalid')) {
      collector.skip(line, 'invalid_amount', display);
      continue;
    }

    const debitValue = valueOf(debit);
    const creditValue = valueOf(credit);
    let total =
      debitValue === undefined && creditValue === undefined
        ? (valueOf(amount) as number)
        : Math.abs(creditValue ?? 0) - Math.abs(debitValue ?? 0);
    // Revolut lists its fee apart from the amount; it is money out too.
    total -= Math.abs(valueOf(fee) ?? 0);
    if (total === 0) {
      collector.skip(line, 'zero_amount', display);
      continue;
    }

    if (when.time === undefined) {
      const time = parseStatementTime(cell(layout.time));
      if (time) when = { ...when, time };
    }

    const merchantCell = cell(layout.merchant);
    const texts = layout.text.map(cell);
    const reference = cell(layout.id);
    const originalCurrency = cell(layout.originalCurrency).toUpperCase();
    const originalMinor = /^[A-Z]{3}$/.test(originalCurrency)
      ? parseDecimalMinor(cell(layout.originalAmount), currencyExponent(originalCurrency))
      : null;

    collector.add(
      {
        line,
        amountRappen: total,
        when,
        merchant: merchantCell === '' ? firstMerchant(texts) : truncate(merchantCell, MAX_MERCHANT),
        rawText: joinTexts([merchantCell, ...texts], MAX_RAW_TEXT),
        ...(originalMinor && originalCurrency !== 'CHF'
          ? {
              original: {
                amountMinor: Math.sign(total) * Math.abs(originalMinor),
                currency: originalCurrency,
              },
            }
          : {}),
        reference: reference === '' ? null : reference,
        iban,
      },
      display,
    );
  }

  return {
    ok: true,
    parts: { format: 'csv', bank, iban, rows: collector.rows, skipped: collector.skipped },
  };
}

/** The first non-empty date cell in priority order decides; a bad one is not skipped over. */
function rowDate(cells: readonly string[]): StatementDate | null {
  const first = cells.find((value) => value !== '');
  return first === undefined ? null : parseStatementDate(first);
}

function valueOf(cell: AmountCell): number | undefined {
  return cell.kind === 'value' ? cell.rappen : undefined;
}

function firstMerchant(texts: readonly string[]): string | null {
  for (const text of texts) {
    const merchant = merchantFromText(text);
    if (merchant !== null) return merchant;
  }
  return null;
}

/** The account IBAN: from an IBAN column (Raiffeisen), else from the metadata lines above. */
function findIban(
  metadata: readonly CsvRecord[],
  data: readonly CsvRecord[],
  column: number | undefined,
): string | null {
  const cells =
    column === undefined
      ? metadata.flatMap((record) => record.fields)
      : data.map((record) => record.fields[column] ?? '');
  for (const value of cells) {
    const iban = ibanIn(cleanCell(value));
    if (iban !== null) return iban;
  }
  return null;
}
