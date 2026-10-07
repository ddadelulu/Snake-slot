import {
  addDays,
  parseLocalDate,
  periodContaining,
  type LocalDate,
  type Period,
} from '@budget/core';

import type { TransactionFilter } from '@/data/transactions';

/** The Transactions tab's filters (US-3.4) as the person sets them. */

export const PERIOD_CHOICES = ['all', 'this_month', 'last_month'] as const;
export type PeriodChoice = (typeof PERIOD_CHOICES)[number];

export const SOURCE_CHOICES = ['all', 'manual', 'statement_import'] as const;
export type SourceChoice = (typeof SOURCE_CHOICES)[number];

export type ListFilterState = {
  /** Categories to show (a split matches by any part). */
  categoryIds: string[];
  /** Also show transactions without a category. */
  uncategorized: boolean;
  source: SourceChoice;
  period: PeriodChoice;
};

export const DEFAULT_LIST_FILTER: ListFilterState = {
  categoryIds: [],
  uncategorized: false,
  source: 'all',
  period: 'all',
};

export type DateRange = { from: LocalDate; to: LocalDate };

/**
 * Local dates (both inclusive) of a period choice. "This month" is the current budget period from
 * payday to the day before the next payday; "last month" the one before it. Null for all time, and
 * while the current period is not known yet.
 */
export function periodRange(
  choice: PeriodChoice,
  current: Period | null,
  payday: number | null,
): DateRange | null {
  if (choice === 'all' || current === null) return null;
  if (choice === 'this_month') return { from: current.startsOn, to: addDays(current.endsOn, -1) };
  const to = addDays(current.startsOn, -1);
  const day = payday ?? parseLocalDate(current.startsOn).day;
  return { from: periodContaining(to, day).startsOn, to };
}

/** True when the period choice needs the current period, which has not loaded yet. */
export function waitsForPeriod(state: ListFilterState, current: Period | null): boolean {
  return state.period !== 'all' && current === null;
}

/** The filter for `list_transactions`. */
export function toTransactionFilter(
  state: ListFilterState,
  search: string,
  current: Period | null,
  payday: number | null,
): TransactionFilter {
  const filter: TransactionFilter = {};
  const query = search.trim();
  if (query !== '') filter.search = query;
  if (state.categoryIds.length > 0) filter.categoryIds = [...state.categoryIds];
  if (state.uncategorized) filter.uncategorized = true;
  if (state.source !== 'all') filter.sources = [state.source];
  const range = periodRange(state.period, current, payday);
  if (range) {
    filter.from = range.from;
    filter.to = range.to;
  }
  return filter;
}

/** How many of the filters narrow the list (search not included). */
export function activeFilterCount(state: ListFilterState): number {
  return (
    (state.categoryIds.length > 0 || state.uncategorized ? 1 : 0) +
    (state.source !== 'all' ? 1 : 0) +
    (state.period !== 'all' ? 1 : 0)
  );
}

/** Adds or removes a category from the category filter. */
export function toggleCategory(state: ListFilterState, categoryId: string): ListFilterState {
  const has = state.categoryIds.includes(categoryId);
  return {
    ...state,
    categoryIds: has
      ? state.categoryIds.filter((id) => id !== categoryId)
      : [...state.categoryIds, categoryId],
  };
}
