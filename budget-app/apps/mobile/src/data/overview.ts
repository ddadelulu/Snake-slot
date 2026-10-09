import {
  DEFAULT_CATEGORY_KEYS,
  TRANSACTION_SOURCES,
  buildOverview,
  isLocalDate,
  isRappen,
  type DefaultCategoryKey,
  type LocalDate,
  type Overview,
  type Rappen,
  type TransactionSource,
} from '@budget/core';
import { skipToken, useQuery } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';
import { toRequestError } from '@/lib/requestError';
import { getSupabase } from '@/lib/supabase';

import { TRANSACTION_CATEGORIZED_BY, type TransactionCategorizedBy } from './categorizedBy';

/**
 * The current month for the home screen. The database rolls the month over on payday and adds up
 * the transactions (`public.get_overview`); the shared engine derives balance, daily allowance,
 * statuses and pace from those totals (`buildOverview`).
 */

export type OverviewCategory = {
  categoryId: string;
  defaultKey: DefaultCategoryKey | null;
  name: string | null;
  icon: string | null;
  sortOrder: number;
  archived: boolean;
  budgetId: string | null;
  budgetAmountRappen: Rappen;
  rolloverRappen: Rappen;
  spentRappen: Rappen;
};

export type RecentTransaction = {
  id: string;
  amountRappen: Rappen;
  bookedAt: string;
  merchant: string | null;
  categoryId: string | null;
  isSplit: boolean;
  source: TransactionSource;
  note: string | null;
  categorizedBy: TransactionCategorizedBy;
  /** No category yet, or only a weak guess: the app asks the person. */
  needsReview: boolean;
};

export type OverviewData = {
  today: LocalDate;
  period: {
    id: string;
    startsOn: LocalDate;
    endsOn: LocalDate;
    incomeRappen: Rappen;
    fixedCostsRappen: Rappen;
    savingsRappen: Rappen;
    carriedOverRappen: Rappen;
  };
  categories: OverviewCategory[];
  uncategorizedSpentRappen: Rappen;
  /** Transactions of this month that need a category from the person. */
  needsReviewCount: number;
  /** Alerts in the inbox not opened yet (the bell on Home); 0 from servers before M4. */
  unreadAlertCount: number;
  recentTransactions: RecentTransaction[];
};

export class OverviewFormatError extends Error {
  constructor(field: string) {
    super(`get_overview returned an unexpected value for ${field}`);
    this.name = 'OverviewFormatError';
  }
}

type Json = Record<string, unknown>;

function object(value: unknown, field: string): Json {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new OverviewFormatError(field);
  }
  return value as Json;
}

function rappen(value: unknown, field: string): Rappen {
  if (!isRappen(value)) throw new OverviewFormatError(field);
  return value;
}

function text(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new OverviewFormatError(field);
  return value;
}

function optionalText(value: unknown, field: string): string | null {
  return value === null || value === undefined ? null : text(value, field);
}

function count(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new OverviewFormatError(field);
  }
  return value;
}

function date(value: unknown, field: string): LocalDate {
  if (!isLocalDate(value)) throw new OverviewFormatError(field);
  return value;
}

function array(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new OverviewFormatError(field);
  return value;
}

/** Checks and converts the JSON from get_overview; null means "no current month yet". */
export function parseOverview(json: unknown): OverviewData | null {
  if (json === null || json === undefined) return null;
  const root = object(json, 'overview');
  const period = object(root.period, 'period');

  return {
    today: date(root.today, 'today'),
    period: {
      id: text(period.id, 'period.id'),
      startsOn: date(period.starts_on, 'period.starts_on'),
      endsOn: date(period.ends_on, 'period.ends_on'),
      incomeRappen: rappen(period.income_rappen, 'period.income_rappen'),
      fixedCostsRappen: rappen(period.fixed_costs_rappen, 'period.fixed_costs_rappen'),
      savingsRappen: rappen(period.savings_rappen, 'period.savings_rappen'),
      carriedOverRappen: rappen(period.carried_over_rappen, 'period.carried_over_rappen'),
    },
    categories: array(root.categories, 'categories').map((entry, index) => {
      const row = object(entry, `categories[${index}]`);
      const key = row.default_key;
      if (key !== null && !(DEFAULT_CATEGORY_KEYS as readonly unknown[]).includes(key)) {
        throw new OverviewFormatError(`categories[${index}].default_key`);
      }
      if (typeof row.sort_order !== 'number' || typeof row.archived !== 'boolean') {
        throw new OverviewFormatError(`categories[${index}]`);
      }
      return {
        categoryId: text(row.category_id, `categories[${index}].category_id`),
        defaultKey: key as DefaultCategoryKey | null,
        name: optionalText(row.name, `categories[${index}].name`),
        icon: optionalText(row.icon, `categories[${index}].icon`),
        sortOrder: row.sort_order,
        archived: row.archived,
        budgetId: optionalText(row.budget_id, `categories[${index}].budget_id`),
        budgetAmountRappen: rappen(
          row.budget_amount_rappen,
          `categories[${index}].budget_amount_rappen`,
        ),
        rolloverRappen: rappen(row.rollover_rappen, `categories[${index}].rollover_rappen`),
        spentRappen: rappen(row.spent_rappen, `categories[${index}].spent_rappen`),
      };
    }),
    uncategorizedSpentRappen: rappen(root.uncategorized_spent_rappen, 'uncategorized_spent_rappen'),
    needsReviewCount: count(root.needs_review_count, 'needs_review_count'),
    unreadAlertCount:
      root.unread_alert_count === undefined
        ? 0
        : count(root.unread_alert_count, 'unread_alert_count'),
    recentTransactions: array(root.recent_transactions, 'recent_transactions').map(
      (entry, index) => {
        const row = object(entry, `recent_transactions[${index}]`);
        if (!(TRANSACTION_SOURCES as readonly unknown[]).includes(row.source)) {
          throw new OverviewFormatError(`recent_transactions[${index}].source`);
        }
        if (typeof row.is_split !== 'boolean') {
          throw new OverviewFormatError(`recent_transactions[${index}].is_split`);
        }
        if (!(TRANSACTION_CATEGORIZED_BY as readonly unknown[]).includes(row.categorized_by)) {
          throw new OverviewFormatError(`recent_transactions[${index}].categorized_by`);
        }
        if (typeof row.needs_review !== 'boolean') {
          throw new OverviewFormatError(`recent_transactions[${index}].needs_review`);
        }
        return {
          id: text(row.id, `recent_transactions[${index}].id`),
          amountRappen: rappen(row.amount_rappen, `recent_transactions[${index}].amount_rappen`),
          bookedAt: text(row.booked_at, `recent_transactions[${index}].booked_at`),
          merchant: optionalText(row.merchant, `recent_transactions[${index}].merchant`),
          categoryId: optionalText(row.category_id, `recent_transactions[${index}].category_id`),
          isSplit: row.is_split,
          source: row.source as TransactionSource,
          note: optionalText(row.note, `recent_transactions[${index}].note`),
          categorizedBy: row.categorized_by as TransactionCategorizedBy,
          needsReview: row.needs_review,
        };
      },
    ),
  };
}

export type HomeModel = {
  data: OverviewData;
  overview: Overview;
};

/** The engine's view of the month (balance, allowance, statuses, pace) for parsed data. */
export function toHomeModel(data: OverviewData): HomeModel {
  const overview = buildOverview({
    period: { startsOn: data.period.startsOn, endsOn: data.period.endsOn },
    today: data.today,
    plan: {
      incomeRappen: data.period.incomeRappen,
      fixedCostsRappen: data.period.fixedCostsRappen,
      savingsRappen: data.period.savingsRappen,
      carriedOverRappen: data.period.carriedOverRappen,
    },
    categories: data.categories.map((category) => ({
      categoryId: category.categoryId,
      // A category's budget is its amount plus what rolled over into it. The payday job only
      // carries money at the period level today, so this is never negative; clamping keeps the
      // home screen working should a later feature carry a category deficit.
      budgetRappen: Math.max(0, category.budgetAmountRappen + category.rolloverRappen),
      spentRappen: category.spentRappen,
    })),
    uncategorizedSpentRappen: data.uncategorizedSpentRappen,
  });
  return { data, overview };
}

export const overviewKeys = {
  all: ['overview'] as const,
  current: (userId: string) => ['overview', userId] as const,
};

export async function fetchOverview(): Promise<HomeModel | null> {
  const { data, error, status } = await getSupabase().rpc('get_overview');
  if (error) throw toRequestError({ error, status });
  const parsed = parseOverview(data);
  return parsed ? toHomeModel(parsed) : null;
}

/** The current month for the signed-in user; refetched when the app returns to the foreground. */
export function useOverview() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  return useQuery({
    queryKey: userId ? overviewKeys.current(userId) : overviewKeys.all,
    queryFn: userId ? fetchOverview : skipToken,
  });
}
