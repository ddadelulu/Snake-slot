import type { Rappen } from '@budget/core';
import { skipToken, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';
import { toRequestError } from '@/lib/requestError';
import { getSupabase } from '@/lib/supabase';

import { jsonReader } from './json';
import { invalidateTransactionViews } from './transactions';

/**
 * Cash-feel payment moments (spec section 8; docs/API.md, "Moments"). `pending_moments()` lists
 * the purchases of the last 7 days the person has not confirmed yet, oldest first, with the
 * balance and the category before and after each; `acknowledge_transactions` is "I paid this".
 */

export type Moment = {
  /** The transaction's id. */
  id: string;
  /** Negative: money out. */
  amountRappen: Rappen;
  bookedAt: string;
  merchant: string | null;
  note: string | null;
  categoryId: string | null;
  balanceBeforeRappen: Rappen;
  balanceAfterRappen: Rappen;
  /** The category's money left before and after; null without a category or budget. */
  remainingBeforeRappen: Rappen | null;
  remainingAfterRappen: Rappen | null;
  budgetRappen: Rappen | null;
  overBudget: boolean;
};

const read = jsonReader('pending_moments');

const optionalRappen = (value: unknown, field: string): Rappen | null =>
  value === null || value === undefined ? null : read.rappen(value, field);

export function parseMoments(json: unknown): Moment[] {
  return read.array(json ?? [], 'moments').map((entry, index) => {
    const row = read.object(entry, `moments[${index}]`);
    const at = (key: string) => `moments[${index}].${key}`;
    return {
      id: read.text(row.id, at('id')),
      amountRappen: read.rappen(row.amount_rappen, at('amount_rappen')),
      bookedAt: read.text(row.booked_at, at('booked_at')),
      merchant: read.optionalText(row.merchant, at('merchant')),
      note: read.optionalText(row.note, at('note')),
      categoryId: read.optionalText(row.category_id, at('category_id')),
      balanceBeforeRappen: read.rappen(row.balance_before_rappen, at('balance_before_rappen')),
      balanceAfterRappen: read.rappen(row.balance_after_rappen, at('balance_after_rappen')),
      remainingBeforeRappen: optionalRappen(row.remaining_before_rappen, at('remaining_before_rappen')),
      remainingAfterRappen: optionalRappen(row.remaining_after_rappen, at('remaining_after_rappen')),
      budgetRappen: optionalRappen(row.budget_rappen, at('budget_rappen')),
      overBudget: read.boolean(row.over_budget, at('over_budget')),
    };
  });
}

export async function fetchPendingMoments(): Promise<Moment[]> {
  const { data, error, status } = await getSupabase().rpc('pending_moments');
  if (error) throw toRequestError({ error, status });
  return parseMoments(data);
}

export const momentKeys = {
  all: ['moments'] as const,
  pending: (userId: string) => ['moments', userId, 'pending'] as const,
};

export function usePendingMoments() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  return useQuery({
    queryKey: userId ? momentKeys.pending(userId) : momentKeys.all,
    queryFn: userId ? fetchPendingMoments : skipToken,
  });
}

/** Fresh from the server: are there purchases waiting for their moment? */
export async function hasPendingMoments(queryClient: QueryClient, userId: string): Promise<boolean> {
  try {
    const moments = await queryClient.fetchQuery({
      queryKey: momentKeys.pending(userId),
      queryFn: fetchPendingMoments,
      staleTime: 0,
    });
    return moments.length > 0;
  } catch {
    // The moment is a nudge, never a blocker: without an answer the app carries on.
    return false;
  }
}

export async function acknowledgeTransactions(ids: readonly string[]): Promise<void> {
  const { error, status } = await getSupabase().rpc('acknowledge_transactions', {
    p_ids: [...ids],
  });
  if (error) throw toRequestError({ error, status });
}

/** "I paid this": the moments are done, and the balance everywhere shows the new state. */
export function useAcknowledgeTransactions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: acknowledgeTransactions,
    onSuccess: async () => {
      await Promise.all([
        invalidateTransactionViews(queryClient),
        queryClient.invalidateQueries({ queryKey: momentKeys.all }),
      ]);
    },
  });
}
