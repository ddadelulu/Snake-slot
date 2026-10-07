import { BASE_CURRENCY } from './app';
import { TRANSACTION_SOURCES, type TransactionSource } from './constants';
import { isLocalDate, type LocalDate } from './engine/dates';
import { MAX_ABS_RAPPEN, isRappen, type Rappen } from './money';

/**
 * The plug-in contract for transaction sources (spec section 6). Every source (bank, Android
 * notification listener, iOS Shortcut, email receipt, receipt photo, statement import, manual
 * entry, assistant) is an adapter that turns its own raw input into `SourceTransaction`s. The
 * pipeline after that (validation, deduplication, categorization, storage, cash-feel moment) is
 * the same for all of them and never looks at source-specific formats.
 */
export type SourceTransaction = {
  /** Signed CHF amount as booked: negative = money out, positive = money in (refund). */
  amountRappen: Rappen;
  /** Always CHF: foreign purchases carry the CHF amount the source booked (spec section 4). */
  currency: typeof BASE_CURRENCY;
  /** The amount in the original currency, when the purchase was not in CHF. */
  original?: { amountMinor: number; currency: string };
  /**
   * When the purchase happened, ISO 8601 with offset, e.g. 2026-10-01T12:34:00+02:00. Exactly one
   * of `bookedAt` and `bookedOn` is set.
   */
  bookedAt?: string;
  /**
   * The local calendar day of the purchase, for sources that print no time zone (statement
   * files). The database places it in the user's time zone.
   */
  bookedOn?: LocalDate;
  /** Local time of day (HH:MM or HH:MM:SS) with `bookedOn`, when the source knows it. */
  bookedTime?: string;
  merchant: string | null;
  /** The text the source saw (notification body, statement line, email subject). */
  rawText: string | null;
  /** ISO 18245 merchant category code, when the source provides one. */
  mcc: number | null;
  source: TransactionSource;
  /** The source's own id for this transaction; re-imports with the same id are ignored. */
  sourceId: string | null;
  /** Line items, e.g. from an email receipt or a receipt photo. */
  items?: SourceItem[];
};

export type SourceItem = { description: string; amountRappen: Rappen; quantity?: number };

/**
 * What every adapter implements. `read` returns transactions in the shared shape; adapters never
 * write to the database themselves.
 */
export interface TransactionSourceAdapter<Input> {
  readonly source: TransactionSource;
  read(input: Input): Promise<SourceTransaction[]>;
}

export type SourceValidation =
  { ok: true; value: SourceTransaction } | { ok: false; problems: string[] };

const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/;
const LOCAL_TIME = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const CURRENCY_CODE = /^[A-Z]{3}$/;

/**
 * Checks an adapter's output against the contract (and the database constraints) before it
 * enters the pipeline, so a faulty adapter is caught at its boundary with a clear message.
 */
export function validateSourceTransaction(input: SourceTransaction): SourceValidation {
  const problems: string[] = [];

  if (!isRappen(input.amountRappen) || input.amountRappen === 0) {
    problems.push(`amountRappen must be a non-zero integer within ±${MAX_ABS_RAPPEN}`);
  }
  if (input.currency !== BASE_CURRENCY) problems.push('currency must be CHF');
  if (input.original !== undefined) {
    if (!Number.isSafeInteger(input.original.amountMinor) || input.original.amountMinor === 0) {
      problems.push('original.amountMinor must be a non-zero integer');
    }
    if (!CURRENCY_CODE.test(input.original.currency)) {
      problems.push('original.currency must be an ISO 4217 code such as EUR');
    }
  }
  if ((input.bookedAt === undefined) === (input.bookedOn === undefined)) {
    problems.push('exactly one of bookedAt and bookedOn must be set');
  } else if (input.bookedAt !== undefined) {
    if (!ISO_WITH_OFFSET.test(input.bookedAt) || Number.isNaN(Date.parse(input.bookedAt))) {
      problems.push('bookedAt must be an ISO 8601 date-time with an offset');
    }
    if (input.bookedTime !== undefined) problems.push('bookedTime belongs to bookedOn');
  } else {
    if (!isLocalDate(input.bookedOn)) problems.push('bookedOn must be a date YYYY-MM-DD');
    if (input.bookedTime !== undefined && !LOCAL_TIME.test(input.bookedTime)) {
      problems.push('bookedTime must be HH:MM or HH:MM:SS');
    }
  }
  if (input.merchant !== null && (input.merchant.trim() === '' || input.merchant.length > 200)) {
    problems.push('merchant must be null or 1-200 characters');
  }
  if (input.rawText !== null && input.rawText.length > 4000) {
    problems.push('rawText must be at most 4000 characters');
  }
  if (input.mcc !== null && (!Number.isInteger(input.mcc) || input.mcc < 0 || input.mcc > 9999)) {
    problems.push('mcc must be null or an integer 0-9999');
  }
  if (!(TRANSACTION_SOURCES as readonly string[]).includes(input.source)) {
    problems.push('source is not a known transaction source');
  }
  if (input.sourceId !== null && (input.sourceId === '' || input.sourceId.length > 200)) {
    problems.push('sourceId must be null or 1-200 characters');
  }
  for (const [index, item] of (input.items ?? []).entries()) {
    if (item.description.trim() === '') problems.push(`items[${index}].description is empty`);
    if (!isRappen(item.amountRappen)) problems.push(`items[${index}].amountRappen is not Rappen`);
    if (item.quantity !== undefined && !(Number.isInteger(item.quantity) && item.quantity > 0)) {
      problems.push(`items[${index}].quantity must be a positive integer`);
    }
  }

  return problems.length === 0 ? { ok: true, value: input } : { ok: false, problems };
}
