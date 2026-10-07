import type { LocalDate } from '../engine/dates';
import type { SourceTransaction } from '../sources';

/** The file formats the import understands (D-032). */
export type StatementFormat = 'csv' | 'camt053';

/** Banks whose CSV export (or camt.053 servicer BIC) is recognised; null for any other bank. */
export type StatementBank = 'postfinance' | 'ubs' | 'zkb' | 'raiffeisen' | 'neon' | 'revolut';

/**
 * Why a line of the file did not become a transaction. The import screen lists these so the
 * person sees that nothing was silently lost.
 *
 * - `invalid_date`: the row has an amount but no readable calendar date.
 * - `no_amount`: the row has a date but every amount cell is empty.
 * - `invalid_amount`: an amount cell is not a CHF amount (e.g. "12.505").
 * - `zero_amount`: the amount is CHF 0.00.
 * - `not_chf`: the row, entry or whole statement is in another currency (EUR account, Revolut
 *   EUR pocket); the app books CHF only.
 * - `collective_detail`: a detail line of a collective booking (UBS "Einzelbetrag", ZKB
 *   "Betrag Detail"); the collective booking itself is imported, its parts would count twice.
 * - `not_booked`: pending, informational or not completed (camt PDNG/INFO, Revolut PENDING,
 *   REVERTED, DECLINED).
 * - `invalid`: the transaction failed `validateSourceTransaction` (e.g. an amount above the
 *   CHF 100 million limit).
 */
export type SkipReason =
  | 'invalid_date'
  | 'no_amount'
  | 'invalid_amount'
  | 'zero_amount'
  | 'not_chf'
  | 'collective_detail'
  | 'not_booked'
  | 'invalid';

/** A transaction read from the file; `line` is the 1-based CSV line or camt entry number. */
export type StatementRow = { line: number; transaction: SourceTransaction };

/** A line that was not imported, with the reason and the line's text for display. */
export type SkippedRow = { line: number; reason: SkipReason; text: string };

export type ParsedStatement = {
  format: StatementFormat;
  bank: StatementBank | null;
  /** The account's IBAN when the file names it (camt Acct/Id/IBAN, CSV metadata or column). */
  account: { iban: string | null };
  rows: StatementRow[];
  skipped: SkippedRow[];
  /** First and last booking day of the imported rows (null when there are none). */
  from: LocalDate | null;
  to: LocalDate | null;
};

/**
 * The person's own column assignment for a CSV the parser did not recognise, as 0-based column
 * indexes. `headerRow` is the 1-based line of the header (as returned with `unknown_columns`), or
 * 0 when the file has no header line and every line is data. `date` plus `amount` (signed) or
 * `debit` / `credit` are required.
 */
export type ColumnMapping = {
  headerRow: number;
  date: number;
  time?: number;
  amount?: number;
  debit?: number;
  credit?: number;
  text: number[];
  merchant?: number;
  currency?: number;
  id?: number;
};

export type StatementOptions = { mapping?: ColumnMapping };

export type StatementError =
  | { code: 'empty' }
  | { code: 'too_large'; maxBytes: number }
  | { code: 'unsupported_format' }
  | { code: 'invalid_xml'; message: string }
  | { code: 'not_chf' }
  | { code: 'no_transactions'; skipped: SkippedRow[] }
  | {
      code: 'unknown_columns';
      /** 1-based line of the probable header (pass back in `ColumnMapping.headerRow`). */
      headerRow: number;
      columns: string[];
      /** Up to 5 data rows after the header, for the mapping screen. */
      sample: string[][];
      /** The columns that were recognised, to pre-fill the mapping screen. */
      guess: Partial<ColumnMapping>;
    }
  | { code: 'too_many_rows'; count: number; max: number };

export type StatementParseResult =
  { ok: true; statement: ParsedStatement } | { ok: false; error: StatementError };

/** What a format parser hands to `finishStatement` (internal). */
export type StatementParts = {
  format: StatementFormat;
  bank: StatementBank | null;
  iban: string | null;
  rows: StatementRow[];
  skipped: SkippedRow[];
};

export type PartsResult =
  { ok: true; parts: StatementParts } | { ok: false; error: StatementError };
