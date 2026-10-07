import type { Rappen } from '../money';
import { createCollector } from './collect';
import { parseCsv, type CsvRecord } from './csv';
import { merchantFromText } from './merchantText';
import type {
  ColumnMapping,
  PartsResult,
  SkipReason,
  StatementBank,
  StatementOptions,
} from './types';
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
  type AmountCell,
  type SlashOrder,
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
  | 'direction'
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
    'debitcreditamount',
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
  direction: [
    'sollhaben',
    'sh',
    'debitcredit',
    'creditdebit',
    'dc',
    'cd',
    'belastunggutschrift',
    'gutschriftbelastung',
    'dareavere',
    'cdtdbtind',
    'creditdebitindicator',
    'debitcreditindicator',
    'sollhabenkennzeichen',
    'shkennzeichen',
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
/** Columns that hold a debit/credit marker only when their values say so (Revolut's "Type" does not). */
const MARKER_KEYS = new Set(['typ', 'type']);

const HEADER_SEARCH = 30;
/** Rows looked at to tell a column's content (currency codes, debit/credit markers, dates). */
const COLUMN_SAMPLE = 20;
const DATED_ROW_SEARCH = 50;
const SAMPLE_ROWS = 5;
const MAX_RAW_TEXT = 4000;
const MAX_MERCHANT = 200;

/** Column positions of one file (0-based). `dates` is in priority order: trade, booking, value. */
type Layout = {
  dates: number[];
  /** True when the first date column is the trade (purchase) date: texts are not searched. */
  tradeDate: boolean;
  time?: number;
  amount?: number;
  debit?: number;
  credit?: number;
  direction?: number;
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
  /** The person said the file prints purchases as positive numbers (`ColumnMapping`). */
  invertAmounts: boolean;
};

type SingleRole = Exclude<Role, 'text' | 'tradeDate' | 'bookingDate' | 'valueDate'>;

/**
 * Parses a bank's CSV export (D-032). Finds the header line below any metadata lines, maps the
 * columns by name (see SYNONYMS) and reads each data line into a transaction. With
 * `options.mapping` the person's own column assignment is used instead. When no date column or no
 * amount column is recognised, returns `unknown_columns` with the columns and a sample for the
 * mapping screen.
 *
 * Per line (D-043): a file without a purchase-date column dates a card purchase by the day its
 * text states ("Einkauf vom 02.10.2026", see `purchaseDateIn`); a debit/credit marker column signs
 * unsigned amounts; slash dates are read month first when the column shows it (`slashOrderOf`). A
 * collective booking whose detail lines (UBS "Einzelbetrag", ZKB "Betrag Detail") add up exactly to
 * its total, all with the total's sign and in CHF, is imported as its details, as camt.053 does;
 * otherwise as its total. Lines that are not bookings are listed in `skipped` (see `SkipReason`).
 */
export function parseStatementCsv(text: string, options: StatementOptions): PartsResult {
  const { records } = parseCsv(text);
  if (options.mapping !== undefined) return parseWithMapping(records, options.mapping);

  let first: { index: number; layout: Layout; bank: StatementBank | null } | null = null;
  for (let index = 0; index < Math.min(records.length, HEADER_SEARCH); index += 1) {
    const data = records.slice(index + 1);
    const { layout, bank } = detectLayout((records[index] as CsvRecord).fields, data);
    if (layout === null) continue;
    // A metadata line can look like a header ("Kontoauszug;Datum;Betrag"): a later header whose
    // lines carry dates is the real one.
    if (hasDatedRow(data, layout)) return readRows(records, index, layout, bank);
    first ??= { index, layout, bank };
  }
  return first === null
    ? unknownColumns(records)
    : readRows(records, first.index, first.layout, first.bank);
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
  const keys = headerFields.map((field) => compactKey(cleanCell(field)));
  const bank = detectBank(new Set(keys));
  const single: Partial<Record<SingleRole, number>> = {};
  const dated: Partial<Record<'tradeDate' | 'bookingDate' | 'valueDate', number>> = {};
  const text: number[] = [];
  let filterCurrency = true;

  keys.forEach((key, column) => {
    const base = key.length > 3 ? key.replace(/(?:in)?chf$/, '') : key;
    let role = roleOf(key) ?? roleOf(base);
    if (MARKER_KEYS.has(key) && looksLikeMarkers(data, column)) role = 'direction';
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
  for (const role of [
    'time',
    'amount',
    'debit',
    'credit',
    'direction',
    'merchant',
    'currency',
    'id',
  ] as const) {
    if (single[role] !== undefined) guess[role] = single[role];
  }
  const hasAmount =
    single.amount !== undefined || single.debit !== undefined || single.credit !== undefined;
  const layout =
    dates.length > 0 && hasAmount
      ? {
          ...single,
          dates,
          tradeDate: dated.tradeDate !== undefined,
          text,
          filterCurrency,
          invertAmounts: false,
        }
      : null;
  return { layout, bank, guess };
}

/** The first non-empty values of a column, for telling what it holds. */
function sampleValues(data: readonly CsvRecord[], column: number): string[] {
  return data
    .slice(0, COLUMN_SAMPLE)
    .map((record) => cleanCell(record.fields[column] ?? ''))
    .filter((value) => value !== '');
}

/** Italian exports call the currency "Valuta", German ones the value date: the cells decide. */
function looksLikeCurrency(data: readonly CsvRecord[], column: number): boolean {
  const values = sampleValues(data, column);
  return values.length > 0 && values.every((value) => /^[A-Za-z]{3}$/.test(value));
}

/** A "Typ" / "Type" column is a debit/credit marker when every value is one (S/H, D/C, …). */
function looksLikeMarkers(data: readonly CsvRecord[], column: number): boolean {
  const values = sampleValues(data, column);
  return values.length > 0 && values.every((value) => Math.abs(directionSign(value) ?? 0) === 1);
}

/** True when one of the first lines below a header candidate has a readable date in its columns. */
function hasDatedRow(data: readonly CsvRecord[], layout: Layout): boolean {
  return data.slice(0, DATED_ROW_SEARCH).some((record) =>
    layout.dates.some((column) => {
      const value = cleanCell(record.fields[column] ?? '');
      return (
        parseStatementDate(value) !== null ||
        parseStatementDate(value, { slashOrder: 'month-first' }) !== null
      );
    }),
  );
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
    mapping.direction,
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
    tradeDate: false,
    time: mapping.time,
    amount: mapping.amount,
    debit: mapping.debit,
    credit: mapping.credit,
    direction: mapping.direction,
    text: mapping.text,
    merchant: mapping.merchant,
    currency: mapping.currency,
    id: mapping.id,
    filterCurrency: true,
    invertAmounts: mapping.invertAmounts === true,
  };
  return readRows(records, headerIndex, layout, null);
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

/** What one booking line holds once its amount and date are read. */
type Booking = {
  amountRappen: Rappen;
  when: StatementDate;
  merchantCell: string;
  texts: string[];
  reference: string;
  original?: { amountMinor: number; currency: string };
};

/** A detail line of a collective booking (amount only in the detail column). */
type Detail = {
  value: AmountCell;
  chf: boolean;
  when: StatementDate | null;
  merchantCell: string;
  texts: string[];
  reference: string;
};

/** One data line after the first pass, in file order. */
type Line =
  | { kind: 'skip'; line: number; reason: SkipReason; display: string }
  | { kind: 'booking'; line: number; display: string; booking: Booking }
  | { kind: 'detail'; line: number; display: string; detail: Detail };

type DetailLine = Extract<Line, { kind: 'detail' }>;

/** What reading the lines of one file needs besides the line itself. */
type ReadContext = {
  layout: Layout;
  /** Slash-date order per date column (`layout.dates`). */
  orders: SlashOrder[];
  /** The header's cells joined, to drop repeated header lines; null without a header. */
  headerCells: string | null;
  /** Number of header columns; a line with more filled cells is malformed. */
  columns: number | null;
};

/**
 * Reads the data lines below the header at `headerIndex` (-1: no header, every line is data),
 * with the lines above it as metadata.
 */
function readRows(
  records: readonly CsvRecord[],
  headerIndex: number,
  layout: Layout,
  bank: StatementBank | null,
): PartsResult {
  const header = records[headerIndex];
  const data = records.slice(headerIndex + 1);
  const iban = findIban(records.slice(0, Math.max(headerIndex, 0)), data, layout.iban);
  const context: ReadContext = {
    layout,
    orders: layout.dates.map((column) =>
      slashOrderOf(data.map((record) => cleanCell(record.fields[column] ?? ''))),
    ),
    headerCells:
      header === undefined ? null : filledCells(header.fields.map(cleanCell)).join('\u0000'),
    columns: header === undefined ? null : header.fields.length,
  };
  const lines = data
    .map((record) => readLine(record, context))
    .filter((line): line is Line => line !== null);

  const collector = createCollector('csv', bank);
  /** `context`: texts that precede the line's own in `rawText` (a collective's total). */
  const addBooking = (line: number, display: string, booking: Booking, context: string[] = []) => {
    collector.add(
      {
        line,
        amountRappen: booking.amountRappen,
        when: booking.when,
        merchant:
          booking.merchantCell === ''
            ? firstMerchant(booking.texts)
            : truncate(booking.merchantCell, MAX_MERCHANT),
        rawText: joinTexts([...context, booking.merchantCell, ...booking.texts], MAX_RAW_TEXT),
        ...(booking.original === undefined ? {} : { original: booking.original }),
        reference: booking.reference === '' ? null : booking.reference,
        iban,
      },
      display,
    );
  };

  for (let index = 0; index < lines.length; index += 1) {
    const item = lines[index] as Line;
    if (item.kind === 'skip') {
      collector.skip(item.line, item.reason, item.display);
      continue;
    }
    if (item.kind === 'detail') {
      // Detail lines that follow no booking.
      collector.skip(item.line, 'collective_detail', item.display);
      continue;
    }
    const details: DetailLine[] = [];
    for (let next = lines[index + 1]; next?.kind === 'detail'; next = lines[index + 1]) {
      details.push(next);
      index += 1;
    }
    const parts = collectiveParts(item.booking.amountRappen, details);
    if (parts === null) {
      addBooking(item.line, item.display, item.booking);
      for (const detail of details)
        collector.skip(detail.line, 'collective_detail', detail.display);
      continue;
    }
    collector.skip(item.line, 'collective_total', item.display);
    const total = item.booking;
    details.forEach(({ line, display, detail }, position) => {
      const booking = {
        amountRappen: parts[position] as Rappen,
        when: detail.when ?? total.when,
        merchantCell: detail.merchantCell,
        texts: detail.texts,
        reference: detailReference(total.reference, details, position),
      };
      addBooking(line, display, booking, [total.merchantCell, ...total.texts]);
    });
  }

  return {
    ok: true,
    parts: { format: 'csv', bank, iban, rows: collector.rows, skipped: collector.skipped },
  };
}

function filledCells(cells: readonly string[]): string[] {
  return cells.filter((value) => value !== '');
}

/**
 * First pass over one data line: a booking, a collective detail, a skipped line, or null for
 * lines that are no data at all (blank, a repeated header, a footer without date and amount).
 */
function readLine(record: CsvRecord, context: ReadContext): Line | null {
  const { layout } = context;
  const cells = record.fields.map(cleanCell);
  const filled = filledCells(cells);
  if (filled.length === 0 || filled.join('\u0000') === context.headerCells) return null;
  const line = record.line;
  const display = filled.join('; ');
  const skip = (reason: SkipReason): Line => ({ kind: 'skip', line, reason, display });
  // An unquoted thousands separator in a comma-separated file ("-1,234.50") shifts the cells.
  if (context.columns !== null && filled.length > context.columns) return skip('malformed_row');

  const cell = (column: number | undefined) => (column === undefined ? '' : (cells[column] ?? ''));
  const state = cell(layout.state).toUpperCase();
  if (state !== '' && state !== 'COMPLETED') return skip('not_booked');

  const merchantCell = cell(layout.merchant);
  const texts = layout.text.map(cell);
  const amount = parseAmountCell(cell(layout.amount));
  const debit = parseAmountCell(cell(layout.debit));
  const credit = parseAmountCell(cell(layout.credit));
  const detailValue = parseAmountCell(cell(layout.detail));
  const mainEmpty = [amount, debit, credit].every((value) => value.kind === 'empty');
  const when = rowWhen(cell, context, [merchantCell, ...texts]);
  // Lines without any amount and without a date are footers ("Disclaimer: …"), not data.
  if (mainEmpty && detailValue.kind === 'empty' && when === null) return null;
  if (isBalanceLine(cells, [merchantCell, ...texts])) return skip('balance_line');

  const currency = cell(layout.currency);
  if (mainEmpty && detailValue.kind !== 'empty') {
    const detail = {
      value: detailValue,
      chf: currency === '' || isChf(currency),
      when,
      merchantCell,
      texts,
      reference: cell(layout.id),
    };
    return { kind: 'detail', line, display, detail };
  }
  if (layout.filterCurrency && currency !== '' && !isChf(currency)) return skip('not_chf');
  if (mainEmpty) return skip('no_amount');
  if (when === null) return skip('invalid_date');
  const fee = parseAmountCell(cell(layout.fee));
  if ([amount, debit, credit, fee].some((value) => value.kind === 'invalid')) {
    return skip('invalid_amount');
  }

  const debitValue = valueOf(debit);
  const creditValue = valueOf(credit);
  let total: number;
  if (debitValue === undefined && creditValue === undefined) {
    total = valueOf(amount) as number;
    if (layout.direction !== undefined) {
      // The marker signs an unsigned amount; an amount printed with a minus keeps it.
      const sign = directionSign(cell(layout.direction));
      if (sign === null || (sign === 0 && total > 0)) return skip('invalid_amount');
      if (sign !== 0 && total > 0) total *= sign;
    }
  } else {
    total = Math.abs(creditValue ?? 0) - Math.abs(debitValue ?? 0);
  }
  // Revolut lists its fee apart from the amount; it is money out too.
  total -= Math.abs(valueOf(fee) ?? 0);
  if (layout.invertAmounts) total = -total;
  if (total === 0) return skip('zero_amount');

  const originalCurrency = cell(layout.originalCurrency).toUpperCase();
  const originalMinor = /^[A-Z]{3}$/.test(originalCurrency)
    ? parseDecimalMinor(cell(layout.originalAmount), currencyExponent(originalCurrency))
    : null;
  const booking: Booking = {
    amountRappen: total,
    when,
    merchantCell,
    texts,
    reference: cell(layout.id),
    ...(originalMinor && originalCurrency !== 'CHF'
      ? {
          original: {
            amountMinor: Math.sign(total) * Math.abs(originalMinor),
            currency: originalCurrency,
          },
        }
      : {}),
  };
  return { kind: 'booking', line, display, booking };
}

/**
 * The line's date: the first non-empty date cell in priority order decides (a bad one is not
 * skipped over). Without a trade-date column, a purchase day stated in the text takes its place
 * (D-043); the time column applies only to the date it belongs to.
 */
function rowWhen(
  cell: (column: number | undefined) => string,
  context: ReadContext,
  texts: readonly string[],
): StatementDate | null {
  const { layout, orders } = context;
  const index = layout.dates.findIndex((column) => cell(column) !== '');
  if (index === -1) return null;
  const when = parseStatementDate(cell(layout.dates[index]), { slashOrder: orders[index] });
  if (when === null) return null;
  if (!layout.tradeDate) {
    const purchase = purchaseDateIn(texts, when.date, orders[0]);
    if (purchase !== null && purchase !== when.date) return { date: purchase };
  }
  if (when.time !== undefined) return when;
  const time = parseStatementTime(cell(layout.time));
  return time ? { ...when, time } : when;
}

/** A line whose texts are only a balance or total label ("Saldo", "Total", "Closing balance"). */
function isBalanceLine(cells: readonly string[], texts: readonly string[]): boolean {
  return cells.some(isBalanceLabel) && texts.every((text) => text === '' || isBalanceLabel(text));
}

/**
 * The amounts of a collective booking's details when they add up exactly to its total, each with
 * the total's sign and in CHF (UBS prints them signed, ZKB unsigned); null when they do not, so
 * the total is imported instead.
 */
function collectiveParts(total: Rappen, details: readonly DetailLine[]): Rappen[] | null {
  if (details.length === 0) return null;
  const values: Rappen[] = [];
  for (const { detail } of details) {
    if (!detail.chf || detail.value.kind !== 'value' || detail.value.rappen === 0) return null;
    values.push(detail.value.rappen);
  }
  const sum = values.reduce((a, b) => a + b, 0);
  if (sum === total && values.every((value) => Math.sign(value) === Math.sign(total))) {
    return values;
  }
  if (sum === -total && values.every((value) => value > 0)) return values.map((value) => -value);
  return null;
}

/**
 * A detail's reference: its own when only it has that number, otherwise the total's (or the
 * shared one) with its position ("TEST0000000002/1"), like camt.053 batch parts; '' (an id from
 * the content) when there is neither.
 */
function detailReference(total: string, details: readonly DetailLine[], position: number): string {
  const own = (details[position] as DetailLine).detail.reference;
  const shared = details.filter(({ detail }) => detail.reference === own).length > 1;
  if (own !== '' && own !== total && !shared) return own;
  const base = total === '' ? own : total;
  return base === '' ? '' : `${base}/${position + 1}`;
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
