import {
  DEFAULT_CATEGORY_KEYS,
  type DefaultCategoryKey,
  type LocalDate,
  type Rappen,
} from '@budget/core';
import { skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';
import { toRequestError } from '@/lib/requestError';
import { getSupabase } from '@/lib/supabase';

import { jsonReader } from './json';
import { overviewKeys } from './overview';

/**
 * One category's month (`get_category_detail`, docs/API.md "Editors"): its budget, rollover and
 * spending now, the six months before, and what the pace forecast needs. `set_budget` changes the
 * budget of the open month.
 */

export type CategoryHistoryEntry = {
  startsOn: LocalDate;
  /** Budget plus what rolled into it that month. */
  budgetRappen: Rappen;
  spentRappen: Rappen;
};

export type CategoryDetail = {
  category: {
    id: string;
    defaultKey: DefaultCategoryKey | null;
    name: string | null;
    archived: boolean;
  };
  today: LocalDate;
  period: { startsOn: LocalDate; endsOn: LocalDate };
  budgetRappen: Rappen;
  rolloverRappen: Rappen;
  spentRappen: Rappen;
  /** The (up to) six months before this one, oldest first. */
  history: CategoryHistoryEntry[];
};

const read = jsonReader('get_category_detail');

export function parseCategoryDetail(json: unknown): CategoryDetail {
  const root = read.object(json, 'detail');
  const category = read.object(root.category, 'category');
  const period = read.object(root.period, 'period');
  const pace = read.object(root.pace, 'pace');
  return {
    category: {
      id: read.text(category.id, 'category.id'),
      defaultKey:
        category.default_key === null || category.default_key === undefined
          ? null
          : read.oneOf(DEFAULT_CATEGORY_KEYS, category.default_key, 'category.default_key'),
      name: read.optionalText(category.name, 'category.name'),
      archived: read.boolean(category.archived, 'category.archived'),
    },
    today: read.date(pace.today, 'pace.today'),
    period: {
      startsOn: read.date(period.starts_on, 'period.starts_on'),
      endsOn: read.date(period.ends_on, 'period.ends_on'),
    },
    budgetRappen: read.rappen(root.budget_amount_rappen, 'budget_amount_rappen'),
    rolloverRappen: read.rappen(root.rollover_rappen, 'rollover_rappen'),
    spentRappen: read.rappen(root.spent_rappen, 'spent_rappen'),
    history: read
      .array(root.history, 'history')
      .map((entry, index) => {
        const row = read.object(entry, `history[${index}]`);
        const at = (key: string) => `history[${index}].${key}`;
        return {
          startsOn: read.date(row.starts_on, at('starts_on')),
          budgetRappen:
            read.rappen(row.budget_amount_rappen, at('budget_amount_rappen')) +
            read.rappen(row.rollover_rappen, at('rollover_rappen')),
          spentRappen: read.rappen(row.spent_rappen, at('spent_rappen')),
        };
      })
      // Newest first from the database; the chart reads left to right.
      .reverse(),
  };
}

export const categoryDetailKeys = {
  all: ['category_detail'] as const,
  detail: (userId: string, id: string) => ['category_detail', userId, id] as const,
};

/** null when the category does not exist (or is someone else's): `category_not_found`. */
async function fetchCategoryDetail(id: string): Promise<CategoryDetail | null> {
  const { data, error, status } = await getSupabase().rpc('get_category_detail', {
    p_category_id: id,
  });
  if (error) {
    const failure = toRequestError({ error, status });
    if (failure.reason === 'category_not_found') return null;
    throw failure;
  }
  return parseCategoryDetail(data);
}

export function useCategoryDetail(id: string | undefined) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  return useQuery({
    queryKey: userId && id ? categoryDetailKeys.detail(userId, id) : categoryDetailKeys.all,
    queryFn: userId && id ? () => fetchCategoryDetail(id) : skipToken,
  });
}

export function useSetBudget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { categoryId: string; amountRappen: Rappen }) => {
      const { error, status } = await getSupabase().rpc('set_budget', {
        p_category_id: input.categoryId,
        p_amount_rappen: input.amountRappen,
      });
      if (error) throw toRequestError({ error, status });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: categoryDetailKeys.all }),
        queryClient.invalidateQueries({ queryKey: overviewKeys.all }),
      ]);
    },
  });
}
