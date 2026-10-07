import {
  RULE_MATCH_TYPES,
  TRANSACTION_SOURCES,
  type IngestRow,
  type Json,
  type LocalDate,
  type Rappen,
  type TransactionSource,
} from '@budget/core';
import {
  keepPreviousData,
  skipToken,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';
import { toRequestError } from '@/lib/requestError';
import { getSupabase } from '@/lib/supabase';

import { TRANSACTION_CATEGORIZED_BY, type TransactionCategorizedBy } from './categorizedBy';
import { jsonReader } from './json';
import { overviewKeys } from './overview';
import { ruleKeys } from './rules';

/**
 * Transactions: listing, reading, adding (manual entry and statement import share one pipeline,
 * `add_transactions`), editing, splitting and deleting. Every call goes through a database
 * function (docs/API.md, "Transactions (Milestone 3)") that runs under row-level security.
 */

export type TransactionSplit = {
  id: string;
  categoryId: string | null;
  amountRappen: Rappen;
  note: string | null;
};

export type TransactionLineItem = {
  description: string;
  amountRappen: Rappen;
  quantity: number | null;
};

export type TransactionItem = {
  id: string;
  /** Signed: negative is money out. */
  amountRappen: Rappen;
  /** ISO instant (UTC). */
  bookedAt: string;
  merchant: string | null;
  rawText: string | null;
  note: string | null;
  mcc: number | null;
  source: TransactionSource;
  dataSourceId: string | null;
  dataSourceName: string | null;
  categoryId: string | null;
  /** 'refund': money in placed like the earlier purchase it seems to pay back (a guess). */
  categorizedBy: TransactionCategorizedBy;
  categoryConfidence: number | null;
  fixedCostId: string | null;
  original: { amountMinor: number; currency: string } | null;
  items: TransactionLineItem[] | null;
  /**
   * The rule "Always do this for …?" would create (D-042, proposed by the database from the
   * merchant), or null when nothing should be offered.
   */
  suggestedRule: RulePatch | null;
  splits: TransactionSplit[];
  /** Other sources that delivered the same purchase (merged duplicates). */
  mergedSources: TransactionSource[];
  needsReview: boolean;
  deletedAt: string | null;
  createdAt: string;
};

const read = jsonReader('transactions');

/** The fields a rule can match that `update_transaction` accepts (docs/API.md, Changing). */
const RULE_PATCH_FIELDS = ['merchant', 'raw_text'] as const;

function parseSuggestedRule(json: unknown, field: string): RulePatch | null {
  if (json === null || json === undefined) return null;
  const rule = read.object(json, field);
  return {
    matchField: read.oneOf(RULE_PATCH_FIELDS, rule.match_field, `${field}.match_field`),
    matchType: read.oneOf(RULE_MATCH_TYPES, rule.match_type, `${field}.match_type`),
    pattern: read.text(rule.pattern, `${field}.pattern`),
  };
}

export function parseTransactionItem(json: unknown, field = 'transaction'): TransactionItem {
  const row = read.object(json, field);
  const at = (key: string) => `${field}.${key}`;
  const originalAmount = read.optionalInteger(
    row.original_amount_minor,
    at('original_amount_minor'),
  );
  const originalCurrency = read.optionalText(row.original_currency, at('original_currency'));
  if ((originalAmount === null) !== (originalCurrency === null)) read.fail(at('original'));
  const items =
    row.items === null || row.items === undefined
      ? null
      : read.array(row.items, at('items')).map((entry, index) => {
          const item = read.object(entry, at(`items[${index}]`));
          return {
            description: read.text(item.description, at(`items[${index}].description`)),
            amountRappen: read.rappen(item.amount_rappen, at(`items[${index}].amount_rappen`)),
            quantity: read.optionalInteger(item.quantity, at(`items[${index}].quantity`)),
          };
        });

  return {
    id: read.text(row.id, at('id')),
    amountRappen: read.rappen(row.amount_rappen, at('amount_rappen')),
    bookedAt: read.text(row.booked_at, at('booked_at')),
    merchant: read.optionalText(row.merchant, at('merchant')),
    rawText: read.optionalText(row.raw_text, at('raw_text')),
    note: read.optionalText(row.note, at('note')),
    mcc: read.optionalInteger(row.mcc, at('mcc')),
    source: read.oneOf(TRANSACTION_SOURCES, row.source, at('source')),
    dataSourceId: read.optionalText(row.data_source_id, at('data_source_id')),
    dataSourceName: read.optionalText(row.data_source_name, at('data_source_name')),
    categoryId: read.optionalText(row.category_id, at('category_id')),
    categorizedBy: read.oneOf(TRANSACTION_CATEGORIZED_BY, row.categorized_by, at('categorized_by')),
    categoryConfidence: read.optionalInteger(row.category_confidence, at('category_confidence')),
    fixedCostId: read.optionalText(row.fixed_cost_id, at('fixed_cost_id')),
    original:
      originalAmount === null || originalCurrency === null
        ? null
        : { amountMinor: originalAmount, currency: originalCurrency },
    items,
    suggestedRule: parseSuggestedRule(row.suggested_rule, at('suggested_rule')),
    splits: read.array(row.splits ?? [], at('splits')).map((entry, index) => {
      const part = read.object(entry, at(`splits[${index}]`));
      return {
        id: read.text(part.id, at(`splits[${index}].id`)),
        categoryId: read.optionalText(part.category_id, at(`splits[${index}].category_id`)),
        amountRappen: read.rappen(part.amount_rappen, at(`splits[${index}].amount_rappen`)),
        note: read.optionalText(part.note, at(`splits[${index}].note`)),
      };
    }),
    mergedSources: read
      .array(row.merged_sources ?? [], at('merged_sources'))
      .map((source, index) =>
        read.oneOf(TRANSACTION_SOURCES, source, at(`merged_sources[${index}]`)),
      ),
    needsReview: read.boolean(row.needs_review, at('needs_review')),
    deletedAt: read.optionalText(row.deleted_at, at('deleted_at')),
    createdAt: read.text(row.created_at, at('created_at')),
  };
}

// ---------------------------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------------------------

export type TransactionFilter = {
  search?: string;
  categoryIds?: string[];
  uncategorized?: boolean;
  sources?: TransactionSource[];
  /** Local dates in the person's time zone, both inclusive. */
  from?: LocalDate;
  to?: LocalDate;
  needsReview?: boolean;
};

export type TransactionCursor = { booked_at: string; id: string };

export type TransactionPage = {
  items: TransactionItem[];
  nextCursor: TransactionCursor | null;
};

export const TRANSACTIONS_PAGE_SIZE = 50;

/** The filter as `list_transactions` reads it; empty filters are left out. */
export function toListParams(
  filter: TransactionFilter,
  cursor: TransactionCursor | null,
  limit = TRANSACTIONS_PAGE_SIZE,
): Record<string, unknown> {
  const params: Record<string, unknown> = { limit };
  const search = filter.search?.trim();
  if (search) params.search = search;
  if (filter.categoryIds && filter.categoryIds.length > 0) params.category_ids = filter.categoryIds;
  if (filter.uncategorized) params.uncategorized = true;
  if (filter.sources && filter.sources.length > 0) params.sources = filter.sources;
  if (filter.from) params.from = filter.from;
  if (filter.to) params.to = filter.to;
  if (filter.needsReview) params.needs_review = true;
  if (cursor) params.cursor = cursor;
  return params;
}

export function parseTransactionPage(json: unknown): TransactionPage {
  const root = read.object(json, 'list_transactions');
  const next =
    root.next_cursor === null || root.next_cursor === undefined
      ? null
      : read.object(root.next_cursor, 'next_cursor');
  return {
    items: read
      .array(root.items, 'items')
      .map((item, index) => parseTransactionItem(item, `items[${index}]`)),
    nextCursor: next
      ? {
          booked_at: read.text(next.booked_at, 'next_cursor.booked_at'),
          id: read.text(next.id, 'next_cursor.id'),
        }
      : null,
  };
}

export async function fetchTransactionsPage(
  filter: TransactionFilter,
  cursor: TransactionCursor | null,
  limit = TRANSACTIONS_PAGE_SIZE,
): Promise<TransactionPage> {
  const { data, error, status } = await getSupabase().rpc('list_transactions', {
    p: toListParams(filter, cursor, limit) as Json,
  });
  if (error) throw toRequestError({ error, status });
  return parseTransactionPage(data);
}

export async function fetchTransaction(id: string): Promise<TransactionItem | null> {
  const { data, error, status } = await getSupabase().rpc('get_transaction', { p_id: id });
  if (error) throw toRequestError({ error, status });
  return data === null ? null : parseTransactionItem(data);
}

export const transactionKeys = {
  all: ['transactions'] as const,
  lists: (userId: string) => ['transactions', userId, 'list'] as const,
  list: (userId: string, filter: TransactionFilter) =>
    ['transactions', userId, 'list', filter] as const,
  detail: (userId: string, id: string) => ['transactions', userId, 'detail', id] as const,
};

/**
 * Pages of transactions, newest first, for a filter. Idle while nobody is signed in. While a new
 * filter or search loads, the previous result stays on screen instead of a spinner.
 */
export function useTransactions(filter: TransactionFilter) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  return useInfiniteQuery({
    queryKey: userId ? transactionKeys.list(userId, filter) : transactionKeys.all,
    queryFn: userId
      ? ({ pageParam }: { pageParam: TransactionCursor | null }) =>
          fetchTransactionsPage(filter, pageParam)
      : skipToken,
    initialPageParam: null as TransactionCursor | null,
    getNextPageParam: (page: TransactionPage) => page.nextCursor,
    placeholderData: keepPreviousData,
  });
}

/** One transaction (null when it does not exist, was merged, or belongs to someone else). */
export function useTransaction(id: string | undefined) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  return useQuery({
    queryKey: userId && id ? transactionKeys.detail(userId, id) : transactionKeys.all,
    queryFn: userId && id ? () => fetchTransaction(id) : skipToken,
  });
}

/** After any change: every list, every detail and the home screen are out of date. */
export async function invalidateTransactionViews(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: transactionKeys.all }),
    queryClient.invalidateQueries({ queryKey: overviewKeys.all }),
  ]);
}

// ---------------------------------------------------------------------------------------------
// Adding (manual entry and statement import)
// ---------------------------------------------------------------------------------------------

export const ADD_OUTCOMES = ['added', 'merged', 'already_imported', 'possible_duplicate'] as const;
export type AddOutcome = (typeof ADD_OUTCOMES)[number];

/** A stored transaction an added row resembles or was merged into. */
export type DuplicateMatch = {
  id: string;
  bookedAt: string;
  merchant: string | null;
  amountRappen: Rappen;
  source: TransactionSource;
};

export type AddRowResult = {
  index: number;
  outcome: AddOutcome;
  transactionId: string | null;
  /**
   * `possible_duplicate`: the stored transaction the row looks like (from the same source, or
   * from another one when the merchants cannot be compared, D-040). `merged`: the transaction it
   * was merged into. Otherwise null.
   */
  duplicateOf: DuplicateMatch | null;
  categoryId: string | null;
  categorizedBy: TransactionCategorizedBy;
  categoryConfidence: number | null;
  fixedCostId: string | null;
  needsReview: boolean;
};

export type AddResult = {
  dataSourceId: string | null;
  results: AddRowResult[];
  counts: Record<AddOutcome | 'needs_review', number>;
};

export type StatementImportInfo = {
  fileName: string;
  format: 'csv' | 'camt053';
  bank: string | null;
};

export type AddTransactionsInput = {
  rows: IngestRow[];
  import?: StatementImportInfo;
  /** Work out what would happen (duplicates, categories) without storing anything. */
  dryRun?: boolean;
};

export function parseAddResult(json: unknown): AddResult {
  const root = read.object(json, 'add_transactions');
  const counts = read.object(root.counts, 'counts');
  return {
    dataSourceId: read.optionalText(root.data_source_id, 'data_source_id'),
    results: read.array(root.results, 'results').map((entry, index) => {
      const row = read.object(entry, `results[${index}]`);
      const at = (key: string) => `results[${index}].${key}`;
      const duplicate =
        row.duplicate_of === null || row.duplicate_of === undefined
          ? null
          : read.object(row.duplicate_of, at('duplicate_of'));
      return {
        index: read.integer(row.index, at('index')),
        outcome: read.oneOf(ADD_OUTCOMES, row.outcome, at('outcome')),
        transactionId: read.optionalText(row.transaction_id, at('transaction_id')),
        duplicateOf: duplicate
          ? {
              id: read.text(duplicate.id, at('duplicate_of.id')),
              bookedAt: read.text(duplicate.booked_at, at('duplicate_of.booked_at')),
              merchant: read.optionalText(duplicate.merchant, at('duplicate_of.merchant')),
              amountRappen: read.rappen(duplicate.amount_rappen, at('duplicate_of.amount_rappen')),
              source: read.oneOf(TRANSACTION_SOURCES, duplicate.source, at('duplicate_of.source')),
            }
          : null,
        categoryId: read.optionalText(row.category_id, at('category_id')),
        categorizedBy: read.oneOf(
          TRANSACTION_CATEGORIZED_BY,
          row.categorized_by,
          at('categorized_by'),
        ),
        categoryConfidence: read.optionalInteger(
          row.category_confidence,
          at('category_confidence'),
        ),
        fixedCostId: read.optionalText(row.fixed_cost_id, at('fixed_cost_id')),
        needsReview: read.boolean(row.needs_review, at('needs_review')),
      };
    }),
    counts: {
      added: read.integer(counts.added, 'counts.added'),
      merged: read.integer(counts.merged, 'counts.merged'),
      already_imported: read.integer(counts.already_imported, 'counts.already_imported'),
      possible_duplicate: read.integer(counts.possible_duplicate, 'counts.possible_duplicate'),
      needs_review: read.integer(counts.needs_review, 'counts.needs_review'),
    },
  };
}

export async function addTransactions(input: AddTransactionsInput): Promise<AddResult> {
  const p: Record<string, unknown> = { rows: input.rows, dry_run: input.dryRun ?? false };
  if (input.import) {
    p.import = {
      file_name: input.import.fileName,
      format: input.import.format,
      bank: input.import.bank,
    };
  }
  const { data, error, status } = await getSupabase().rpc('add_transactions', { p: p as Json });
  if (error) throw toRequestError({ error, status });
  return parseAddResult(data);
}

/** Stores transactions (a dry run stores nothing and leaves every cache alone). */
export function useAddTransactions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: addTransactions,
    onSuccess: async (_result, input) => {
      if (!input.dryRun) await invalidateTransactionViews(queryClient);
    },
  });
}

// ---------------------------------------------------------------------------------------------
// Changing
// ---------------------------------------------------------------------------------------------

export type RulePatch = {
  matchField: 'merchant' | 'raw_text';
  matchType: 'contains' | 'equals';
  pattern: string;
};

export type TransactionPatch = {
  /** The person's choice; null means "no category" (not asked again). */
  categoryId?: string | null;
  /** "Always do this for …": needs a non-null categoryId in the same patch. */
  rule?: RulePatch;
  fixedCostId?: string | null;
  note?: string | null;
  merchant?: string | null;
  /** Manual entries only. */
  amountRappen?: Rappen;
  /** Manual entries only (ISO instant). */
  bookedAt?: string;
  deleted?: boolean;
};

export type UpdateResult = {
  transaction: TransactionItem;
  ruleId: string | null;
  recategorizedCount: number;
};

export function toUpdateParams(patch: TransactionPatch): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  if (patch.categoryId !== undefined) params.category_id = patch.categoryId;
  if (patch.rule !== undefined) {
    params.rule = {
      match_field: patch.rule.matchField,
      match_type: patch.rule.matchType,
      pattern: patch.rule.pattern,
    };
  }
  if (patch.fixedCostId !== undefined) params.fixed_cost_id = patch.fixedCostId;
  if (patch.note !== undefined) params.note = patch.note ?? '';
  if (patch.merchant !== undefined) params.merchant = patch.merchant ?? '';
  if (patch.amountRappen !== undefined) params.amount_rappen = patch.amountRappen;
  if (patch.bookedAt !== undefined) params.booked_at = patch.bookedAt;
  if (patch.deleted !== undefined) params.deleted = patch.deleted;
  return params;
}

export function parseUpdateResult(json: unknown): UpdateResult {
  const root = read.object(json, 'update_transaction');
  return {
    transaction: parseTransactionItem(root.transaction),
    ruleId: read.optionalText(root.rule_id, 'rule_id'),
    recategorizedCount: read.integer(root.recategorized_count ?? 0, 'recategorized_count'),
  };
}

export async function updateTransaction(
  id: string,
  patch: TransactionPatch,
): Promise<UpdateResult> {
  const { data, error, status } = await getSupabase().rpc('update_transaction', {
    p_id: id,
    p: toUpdateParams(patch) as Json,
  });
  if (error) throw toRequestError({ error, status });
  return parseUpdateResult(data);
}

export type SplitPart = { categoryId: string | null; amountRappen: Rappen; note: string | null };

/** Replaces the parts of a split; an empty list removes the split. */
export async function setTransactionSplits(
  id: string,
  parts: SplitPart[],
): Promise<TransactionItem> {
  const { data, error, status } = await getSupabase().rpc('set_transaction_splits', {
    p_id: id,
    p_parts: parts.map((part) => ({
      category_id: part.categoryId,
      amount_rappen: part.amountRappen,
      note: part.note,
    })) as Json,
  });
  if (error) throw toRequestError({ error, status });
  return parseTransactionItem(data);
}

function useStoreTransaction() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return async (transaction: TransactionItem) => {
    if (user)
      queryClient.setQueryData(transactionKeys.detail(user.id, transaction.id), transaction);
    await invalidateTransactionViews(queryClient);
  };
}

/** Edits one transaction; afterwards every list, the detail and Home show the new state. */
export function useUpdateTransaction() {
  const store = useStoreTransaction();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TransactionPatch }) =>
      updateTransaction(id, patch),
    onSuccess: async (result, { patch }) => {
      await store(result.transaction);
      if (patch.rule) await queryClient.invalidateQueries({ queryKey: ruleKeys.all });
    },
  });
}

export function useSetTransactionSplits() {
  const store = useStoreTransaction();
  return useMutation({
    mutationFn: ({ id, parts }: { id: string; parts: SplitPart[] }) =>
      setTransactionSplits(id, parts),
    onSuccess: store,
  });
}
