import {
  toIngestRow,
  type ColumnMapping,
  type IngestRow,
  type LocalDate,
  type ParsedStatement,
  type SkippedRow,
  type SkipReason,
  type SourceTransaction,
  type StatementBank,
  type StatementError,
  type StatementFormat,
} from '@budget/core';

import type {
  AddResult,
  AddRowResult,
  DuplicateMatch,
  StatementImportInfo,
} from '@/data/transactions';

/**
 * The statement import (US-3.2, docs/IMPORT_GUIDE.md) as plain data: what the preview shows for
 * each line of the file, which lines are imported, and the column mapping for CSV files the
 * parser does not know. The screens only render this.
 */

// ---------------------------------------------------------------------------------------------
// File problems
// ---------------------------------------------------------------------------------------------

/** Why a picked file leads to no preview: a parser error, or the file could not be read at all. */
export type FileProblem =
  Exclude<StatementError, { code: 'unknown_columns' }> | { code: 'unreadable' };

export type UnknownColumns = Extract<StatementError, { code: 'unknown_columns' }>;

/** "5 MB" for the too_large message. */
export function formatMegabytes(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

// ---------------------------------------------------------------------------------------------
// Where a file came from
// ---------------------------------------------------------------------------------------------

const BANKS = {
  postfinance: true,
  ubs: true,
  zkb: true,
  raiffeisen: true,
  neon: true,
  revolut: true,
} as const satisfies Record<StatementBank, true>;

export function isStatementBank(value: unknown): value is StatementBank {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(BANKS, value);
}

/**
 * What the screens call a file's origin: the recognised bank, else the format ("CSV",
 * "camt.053"), as a translation key. Stored imports keep the bank as text, so unknown values
 * fall back to the format.
 */
export function sourceKey(
  bank: string | null,
  format: StatementFormat,
): `imports.banks.${StatementBank}` | `imports.formats.${StatementFormat}` {
  return isStatementBank(bank) ? `imports.banks.${bank}` : `imports.formats.${format}`;
}

// ---------------------------------------------------------------------------------------------
// Skipped lines
// ---------------------------------------------------------------------------------------------

/**
 * Most common reasons first, so the person sees the expected ones (pending, other currency), then
 * the lines that are not bookings (collective totals imported as their parts and balance lines,
 * D-043), then the lines that could not be read.
 */
export const SKIP_REASONS: readonly SkipReason[] = [
  'not_booked',
  'not_chf',
  'collective_detail',
  'collective_total',
  'balance_line',
  'no_amount',
  'zero_amount',
  'invalid_amount',
  'invalid_date',
  'malformed_row',
  'invalid',
];

export type SkippedGroup = { reason: SkipReason; rows: SkippedRow[] };

/**
 * Skipped lines grouped by reason (in SKIP_REASONS order), each group by line number. A reason
 * the app does not know yet counts as `invalid`, so no line goes missing from the list.
 */
export function groupSkipped(skipped: readonly SkippedRow[]): SkippedGroup[] {
  const known = new Set<string>(SKIP_REASONS);
  const reasonOf = (row: SkippedRow): SkipReason =>
    known.has(row.reason) ? row.reason : 'invalid';
  return SKIP_REASONS.flatMap((reason) => {
    const rows = skipped.filter((row) => reasonOf(row) === reason).sort((a, b) => a.line - b.line);
    return rows.length > 0 ? [{ reason, rows }] : [];
  });
}

// ---------------------------------------------------------------------------------------------
// Preview rows
// ---------------------------------------------------------------------------------------------

/**
 * What importing a line would do, from the dry run:
 * - `new`: stored as a new transaction (checked);
 * - `merge`: the same purchase is already there from another source, e.g. typed in by hand; it is
 *   merged instead of counted twice (checked);
 * - `imported_before`: this file's line was imported before; never added twice (not selectable);
 * - `look_alike`: looks like a stored transaction (D-040): same day, amount and merchant as one
 *   imported from a statement with another reference, or the same amount within four days as one
 *   from another source whose merchant cannot be compared (e.g. typed in by hand without a name);
 *   unchecked, the person checks it if it really is a separate purchase.
 */
export type RowStatus = 'new' | 'merge' | 'imported_before' | 'look_alike';

export type RowMatch = DuplicateMatch;

export type PreviewRow = {
  /** Position in `statement.rows` (stable key and testID). */
  index: number;
  /** 1-based line of the file (CSV line or camt entry). */
  line: number;
  transaction: SourceTransaction;
  status: RowStatus;
  /**
   * The stored transaction a `merge` row is merged into, or a `look_alike` row resembles, as the
   * dry run describes it (`duplicate_of`); null for other rows or when it was not described.
   */
  match: RowMatch | null;
  categoryId: string | null;
  fixedCostId: string | null;
  needsReview: boolean;
};

const STATUS_BY_OUTCOME: Record<AddRowResult['outcome'], RowStatus> = {
  added: 'new',
  merged: 'merge',
  already_imported: 'imported_before',
  possible_duplicate: 'look_alike',
};

/**
 * Joins the parsed lines with the dry run of all of them (`add_transactions` with `dry_run`,
 * rows in file order, so result `index` is the position in `statement.rows`).
 */
export function toPreviewRows(statement: ParsedStatement, dryRun: AddResult): PreviewRow[] {
  const byIndex = new Map(dryRun.results.map((result) => [result.index, result]));
  return statement.rows.map((row, index) => {
    const result = byIndex.get(index);
    const status = result ? STATUS_BY_OUTCOME[result.outcome] : 'new';
    return {
      index,
      line: row.line,
      transaction: row.transaction,
      status,
      match: status === 'merge' || status === 'look_alike' ? (result?.duplicateOf ?? null) : null,
      categoryId: result?.categoryId ?? null,
      fixedCostId: result?.fixedCostId ?? null,
      needsReview: result?.needsReview ?? false,
    };
  });
}

export function countByStatus(rows: readonly PreviewRow[]): Record<RowStatus, number> {
  const counts: Record<RowStatus, number> = {
    new: 0,
    merge: 0,
    imported_before: 0,
    look_alike: 0,
  };
  for (const row of rows) counts[row.status] += 1;
  return counts;
}

/** Lines imported before can never be imported again. */
export function isSelectable(row: PreviewRow): boolean {
  return row.status !== 'imported_before';
}

/** New lines and merges are checked; look-alikes wait for the person's decision. */
export function initialSelection(rows: readonly PreviewRow[]): Set<number> {
  return new Set(
    rows.filter((row) => row.status === 'new' || row.status === 'merge').map((row) => row.index),
  );
}

export function selectAll(rows: readonly PreviewRow[]): Set<number> {
  return new Set(rows.filter(isSelectable).map((row) => row.index));
}

export function toggleSelection(
  selection: ReadonlySet<number>,
  row: PreviewRow,
): ReadonlySet<number> {
  if (!isSelectable(row)) return selection;
  const next = new Set(selection);
  if (next.has(row.index)) next.delete(row.index);
  else next.add(row.index);
  return next;
}

/** Every line of the file as an `add_transactions` row, for the dry run. */
export function dryRunRows(statement: ParsedStatement): IngestRow[] {
  return statement.rows.map((row) => toIngestRow(row.transaction));
}

/**
 * The checked lines in file order; a checked look-alike is stored anyway (`allow_duplicate`),
 * because the person said it is a separate purchase.
 */
export function rowsToImport(rows: readonly PreviewRow[], selection: ReadonlySet<number>) {
  return rows
    .filter((row) => isSelectable(row) && selection.has(row.index))
    .map((row) =>
      toIngestRow(
        row.transaction,
        row.status === 'look_alike' ? { allowDuplicate: true } : undefined,
      ),
    );
}

export function importInfo(fileName: string, statement: ParsedStatement): StatementImportInfo {
  return { fileName, format: statement.format, bank: statement.bank };
}

/** The local day a line was booked (statement lines carry a day, camt sometimes an instant). */
export function bookingDay(transaction: SourceTransaction): LocalDate {
  return transaction.bookedOn ?? (transaction.bookedAt as string).slice(0, 10);
}

/** What a line is about: the merchant, else the statement text, else null. */
export function rowDescription(transaction: SourceTransaction): string | null {
  return transaction.merchant ?? transaction.rawText ?? null;
}

// ---------------------------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------------------------

export type ImportSummary = {
  added: number;
  merged: number;
  /** Imported before, or a look-alike that turned up since the preview: nothing stored. */
  alreadyThere: number;
  needsReview: number;
};

export function summarize(result: AddResult): ImportSummary {
  return {
    added: result.counts.added,
    merged: result.counts.merged,
    alreadyThere: result.counts.already_imported + result.counts.possible_duplicate,
    needsReview: result.counts.needs_review,
  };
}

// ---------------------------------------------------------------------------------------------
// Column mapping (CSV files the parser does not recognise)
// ---------------------------------------------------------------------------------------------

export type AmountKind = 'single' | 'split';

/** The mapping screen's state; column indexes are 0-based. */
export type MappingDraft = {
  date: number | null;
  amountKind: AmountKind;
  amount: number | null;
  debit: number | null;
  credit: number | null;
  /** Optional debit/credit indicator column (single amount column only). */
  direction: number | null;
  /** Purchases are positive in the file (single amount column without a direction column). */
  invertAmounts: boolean;
  text: number[];
};

export type MappingProblem = 'date' | 'amount' | 'text';

/** Starts from what the parser recognised (`guess`), including a debit/credit column. */
export function mappingDraftFrom(guess: Partial<ColumnMapping>): MappingDraft {
  const split = guess.amount === undefined && (guess.debit ?? guess.credit) !== undefined;
  return {
    date: guess.date ?? null,
    amountKind: split ? 'split' : 'single',
    amount: guess.amount ?? null,
    debit: guess.debit ?? null,
    credit: guess.credit ?? null,
    direction: guess.direction ?? null,
    invertAmounts: guess.invertAmounts ?? false,
    text: [...(guess.text ?? [])].sort((a, b) => a - b),
  };
}

export function toggleTextColumn(draft: MappingDraft, column: number): MappingDraft {
  const text = draft.text.includes(column)
    ? draft.text.filter((index) => index !== column)
    : [...draft.text, column].sort((a, b) => a - b);
  return { ...draft, text };
}

export function mappingProblems(draft: MappingDraft): MappingProblem[] {
  const problems: MappingProblem[] = [];
  if (draft.date === null) problems.push('date');
  const hasAmount =
    draft.amountKind === 'single'
      ? draft.amount !== null
      : draft.debit !== null || draft.credit !== null;
  if (!hasAmount) problems.push('amount');
  if (draft.text.length === 0) problems.push('text');
  return problems;
}

/**
 * The mapping for `readStatement`, or null while it is incomplete. The debit/credit column
 * (`direction`) and "purchases are shown as positive amounts" (`invertAmounts`, D-043) belong to
 * a single amount column; a direction column decides the sign on its own, so the switch is then
 * left out.
 */
export function toColumnMapping(draft: MappingDraft, headerRow: number): ColumnMapping | null {
  if (mappingProblems(draft).length > 0 || draft.date === null) return null;
  const mapping: ColumnMapping = { headerRow, date: draft.date, text: draft.text };
  if (draft.amountKind === 'single' && draft.amount !== null) {
    mapping.amount = draft.amount;
    if (draft.direction !== null) mapping.direction = draft.direction;
    else if (draft.invertAmounts) mapping.invertAmounts = true;
  } else {
    if (draft.debit !== null) mapping.debit = draft.debit;
    if (draft.credit !== null) mapping.credit = draft.credit;
  }
  return mapping;
}

/**
 * One entry per column: its name from the header line, or null when the file has no header line
 * (`headerRow` 0) or the cell is empty (the screen then says "Column 3").
 */
export function columnNames(request: UnknownColumns): (string | null)[] {
  const count = Math.max(request.columns.length, ...request.sample.map((row) => row.length));
  return Array.from({ length: count }, (_, column) => {
    const name = request.headerRow === 0 ? '' : (request.columns[column] ?? '');
    return name.trim() === '' ? null : name;
  });
}

/** Up to `max` example values of a column from the sample rows, empty cells left out. */
export function columnSamples(request: UnknownColumns, column: number, max = 3): string[] {
  return request.sample
    .map((row) => (row[column] ?? '').trim())
    .filter((value) => value !== '')
    .slice(0, max);
}
