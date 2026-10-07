import { BASE_CURRENCY } from '../app';
import type { Rappen } from '../money';
import { validateSourceTransaction, type SourceTransaction } from '../sources';
import { createSourceIds } from './sourceId';
import type { SkippedRow, SkipReason, StatementBank, StatementFormat, StatementRow } from './types';
import { truncate, type StatementDate } from './values';

/** What a parser knows about one transaction before it gets its id and is validated. */
export type RowDraft = {
  line: number;
  amountRappen: Rappen;
  when: StatementDate;
  merchant: string | null;
  rawText: string | null;
  original?: { amountMinor: number; currency: string };
  /** The bank's reference for the row, or null to derive the id from the content. */
  reference: string | null;
  /** The account's IBAN when the file names it; scopes the id. */
  iban: string | null;
};

export type Collector = {
  rows: StatementRow[];
  skipped: SkippedRow[];
  skip(line: number, reason: SkipReason, text: string): void;
  /** Validates the draft; a valid one becomes a row, an invalid one is skipped as `invalid`. */
  add(draft: RowDraft, text: string): void;
};

const MAX_SKIP_TEXT = 500;

/** Collects one file's rows and skipped lines, giving each row its external id. */
export function createCollector(format: StatementFormat, bank: StatementBank | null): Collector {
  const ids = createSourceIds(format, bank);
  const rows: StatementRow[] = [];
  const skipped: SkippedRow[] = [];
  const skip = (line: number, reason: SkipReason, text: string) => {
    skipped.push({ line, reason, text: truncate(text, MAX_SKIP_TEXT) });
  };
  return {
    rows,
    skipped,
    skip,
    add(draft, text) {
      const { date, time, offset } = draft.when;
      const transaction: SourceTransaction = {
        amountRappen: draft.amountRappen,
        currency: BASE_CURRENCY,
        ...(draft.original === undefined ? {} : { original: draft.original }),
        ...(offset !== undefined
          ? { bookedAt: `${date}T${time as string}${offset}` }
          : { bookedOn: date, ...(time === undefined ? {} : { bookedTime: time }) }),
        merchant: draft.merchant,
        rawText: draft.rawText,
        mcc: null,
        source: 'statement_import',
        sourceId:
          draft.reference === null
            ? ids.forContent(draft.iban, date, draft.amountRappen, draft.rawText ?? draft.merchant)
            : ids.forReference(draft.iban, draft.reference, `${date}:${draft.amountRappen}`),
      };
      if (validateSourceTransaction(transaction).ok) {
        rows.push({ line: draft.line, transaction });
      } else {
        skip(draft.line, 'invalid', text);
      }
    },
  };
}
