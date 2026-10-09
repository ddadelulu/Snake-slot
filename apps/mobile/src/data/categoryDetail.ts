import type { LocalDate, Rappen } from '@budget/core';
import { skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';
import { toRequestError } from '@/lib/requestError';
import { getSupabase } from '@/lib/supabase';

import { jsonReader } from './json';
import { overviewKeys } from './overview';

/**
 * One category's month (`get_category_detail`, docs/API.md "Editors"): its budget, rollover and
 * spending now, the last six months, and what the pace forecast needs. `set_budget` changes the
 * budget of the open month.
 */

export type CategoryHistoryEntry = {
  startsOn: LocalDate;
  budgetRappen: Rappen;
  spentRappen: Rappen;
};

export type CategoryDetail = {
  categoryId: string;
  today: LocalDate;
  period: { startsOn: LocalDate; endsOn: LocalDate };
  budgetRappen: Rappen;
  rolloverRappen: Rappen;
  spentRappen: Rappen;
  /** Oldest first, the current month last; at most six. */
  history: CategoryHistoryEntry[];
};

const read = jsonReader('get_category_detail');

export function parseCategoryDetail(json: unknown): CategoryDetail | null {
  if (json === null || json === undefined) return null;
  const root = read.object(json, 'detail');
  const period = read.object(root.period, 'period');
  return {
    categoryId: read.text(root.category_id, 'category_id'),
    today: read.date(root.today, 'today'),
    period: {
      startsOn: read.date(period.starts_on, 'period.starts_on'),
      endsOn: read.date(period.ends_on, 'period.ends_on'),
    },
    budgetRappen: read.rappen(root.budget_rappen, 'budget_rappen'),
    rolloverRappen: read.rappen(root.rollover_rappen, 'rollover_rappen'),
    spentRappen: read.rappen(root.spent_rappen, 'spent_rappen'),
    history: read.array(root.history, 'history').map((entry, index) => {
      const row = read.object(entry, `history[${index}]`);
      return {
        startsOn: read.date(row.starts_on, `history[${index}].starts_on`),
        budgetRappen: read.rappen(row.budget_rappen, `history[${index}].budget_rappen`),
        spentRappen: read.rappen(row.spent_rappen, `history[${index}].spent_rappen`),
      };
    }),
  };
}

export const categoryDetailKeys = {
  all: ['category_detail'] as const,
  detail: (userId: string, id: string) => ['category_detail', userId, id] as const,
};

async function fetchCategoryDetail(id: string): Promise<CategoryDetail | null> {
  const { data, error, status } = await getSupabase().rpc('get_category_detail', {
    p_category_id: id,
  });
  if (error) throw toRequestError({ error, status });
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
