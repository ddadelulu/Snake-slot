import type { TransactionSource } from './constants';
import type { LocalDate } from './engine/dates';
import type { Rappen } from './money';
import type { SourceTransaction } from './sources';

/**
 * One row of the `add_transactions` RPC (docs/API.md, "Adding transactions"), in the database's
 * snake_case. Every source reaches the database through this shape, so deduplication, fixed-cost
 * detection and categorization run the same way for all of them.
 */
export type IngestRow = {
  amount_rappen: Rappen;
  booked_at?: string;
  booked_on?: LocalDate;
  booked_time?: string;
  merchant: string | null;
  raw_text: string | null;
  mcc: number | null;
  source: TransactionSource;
  external_id: string | null;
  original_amount_minor?: number;
  original_currency?: string;
  items?: IngestItem[];
  /** A category the person chose (manual entry): stored as categorized by the user. */
  category_id?: string | null;
  /** Parts of a split; the transaction itself then has no category. */
  splits?: IngestSplit[];
  note?: string | null;
  /** Store the row even though it looks like one already stored from the same source. */
  allow_duplicate?: boolean;
};

export type IngestItem = { description: string; amount_rappen: Rappen; quantity?: number };

export type IngestSplit = {
  category_id: string | null;
  amount_rappen: Rappen;
  note: string | null;
};

/** What the person decided about a transaction before it is stored. */
export type IngestChoices = {
  categoryId?: string | null;
  splits?: { categoryId: string | null; amountRappen: Rappen; note?: string | null }[];
  note?: string | null;
  allowDuplicate?: boolean;
};

/** Turns an adapter's (already validated) output plus the person's choices into an RPC row. */
export function toIngestRow(
  transaction: SourceTransaction,
  choices: IngestChoices = {},
): IngestRow {
  const row: IngestRow = {
    amount_rappen: transaction.amountRappen,
    merchant: transaction.merchant,
    raw_text: transaction.rawText,
    mcc: transaction.mcc,
    source: transaction.source,
    external_id: transaction.sourceId,
  };
  if (transaction.bookedAt !== undefined) row.booked_at = transaction.bookedAt;
  if (transaction.bookedOn !== undefined) row.booked_on = transaction.bookedOn;
  if (transaction.bookedTime !== undefined) row.booked_time = transaction.bookedTime;
  if (transaction.original !== undefined) {
    row.original_amount_minor = transaction.original.amountMinor;
    row.original_currency = transaction.original.currency;
  }
  if (transaction.items !== undefined) {
    row.items = transaction.items.map((item) => ({
      description: item.description,
      amount_rappen: item.amountRappen,
      ...(item.quantity === undefined ? {} : { quantity: item.quantity }),
    }));
  }
  if (choices.categoryId !== undefined) row.category_id = choices.categoryId;
  if (choices.splits !== undefined) {
    row.splits = choices.splits.map((part) => ({
      category_id: part.categoryId,
      amount_rappen: part.amountRappen,
      note: part.note ?? null,
    }));
  }
  if (choices.note !== undefined) row.note = choices.note;
  if (choices.allowDuplicate !== undefined) row.allow_duplicate = choices.allowDuplicate;
  return row;
}
