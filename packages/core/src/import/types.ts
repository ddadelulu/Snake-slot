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
 *   "Betrag Detail") whose details do not add up to the total (or that follows no total); the
 *   total is imported, its parts would count twice.
 * - `collective_total`: the total of a collective booking whose detail lines add up to it
 *   exactly (same sign, CHF); the details are imported instead, as camt.053 does (D-043).
 * - `balance_line`: a line whose text is only a balance or total label ("Saldo", "Schlusssaldo",
 *   "Total", "Closing balance", "Solde", "Saldo finale", …), not a booking.
 * - `malformed_row`: a data line with more filled cells than the header has columns, typically
 *   an amount with an unquoted thousands separator in a comma-separated file ("-1,234.50"); its
 *   cells cannot be assigned to the columns safely.
 * - `not_booked`: pending, informational or not completed (camt PDNG/INFO, Revolut PENDING,
 *   REVERTED, DECLINED).
 * - `invalid`: the transaction failed `validateSourceTransaction` (e.g. an amount above the
 *   CHF 100 million limit).
 *
 * `invalid_amount` also covers a negative camt.053 `<Amt>` and an unknown or missing
 * debit/credit marker for an unsigned amount (see `ColumnMapping.direction`).
 */
export type SkipReason =
  | 'invalid_date'
  | 'no_amount'
  | 'invalid_amount'
  | 'zero_amount'
  | 'not_chf'
  | 'collective_detail'
  | 'collective_total'
  | 'balance_line'
  | 'malformed_row'
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
  /**
   * A debit/credit marker column ("Soll/Haben", "S/H", "Debit/Credit", "D/C", "CdtDbtInd", …)
   * that signs the `amount` column: S, D, DR, Debit, Soll, Belastung, Lastschrift, DBIT, Débit,
   * Addebito, Dare = money out; H, C, CR, Credit, Haben, Gutschrift, CRDT, Crédit, Accredito,
   * Avere = money in (any case, accents optional). A positive amount gets the marker's sign; an
   * amount printed with a minus keeps it. An unknown marker, or none for a positive amount, skips
   * the line as `invalid_amount`. Ignored for `debit` / `credit` columns, which are signed by
   * their column.
   */
  direction?: number;
  /**
   * True for files that print purchases as positive numbers and refunds or income as negative
   * ones: every line's amount changes sign (after `direction` is applied).
   */
  invertAmounts?: boolean;
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
      /**
       * The columns that were recognised, to pre-fill the mapping screen (`date`, `time`,
       * `amount`, `debit`, `credit`, `direction`, `merchant`, `currency`, `id`, `text`;
       * never `invertAmounts`).
       */
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
