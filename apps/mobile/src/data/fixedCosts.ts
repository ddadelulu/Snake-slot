import { FIXED_COST_KINDS, type FixedCostKind, type Rappen } from '@budget/core';
import { skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';
import { RequestError, toRequestError } from '@/lib/requestError';
import { getSupabase } from '@/lib/supabase';

import { jsonReader } from './json';
import { overviewKeys } from './overview';

/** A fixed cost from onboarding (rent, health insurance, …), used to mark its payments. */
export type FixedCost = {
  id: string;
  kind: FixedCostKind;
  label: string | null;
  amountRappen: Rappen;
  merchantHint: string | null;
  active: boolean;
};

const read = jsonReader('fixed_costs');

export function toFixedCost(json: unknown, index: number): FixedCost {
  const row = read.object(json, `fixed_costs[${index}]`);
  const at = (key: string) => `fixed_costs[${index}].${key}`;
  return {
    id: read.text(row.id, at('id')),
    kind: read.oneOf(FIXED_COST_KINDS, row.kind, at('kind')),
    label: read.optionalText(row.label, at('label')),
    amountRappen: read.rappen(row.amount_rappen, at('amount_rappen')),
    merchantHint: read.optionalText(row.merchant_hint, at('merchant_hint')),
    active: read.boolean(row.active, at('active')),
  };
}

export async function fetchFixedCosts(): Promise<FixedCost[]> {
  const { data, error, status } = await getSupabase()
    .from('fixed_costs')
    .select('id, kind, label, amount_rappen, merchant_hint, active')
    .order('created_at', { ascending: true });
  if (error) throw toRequestError({ error, status });
  return (data ?? []).map((row, index) => toFixedCost(row, index));
}

export const fixedCostKeys = {
  all: ['fixed_costs'] as const,
  list: (userId: string) => ['fixed_costs', userId] as const,
};

export function useFixedCosts() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  return useQuery({
    queryKey: userId ? fixedCostKeys.list(userId) : fixedCostKeys.all,
    queryFn: userId ? fetchFixedCosts : skipToken,
  });
}

export type FixedCostFields = { kind: FixedCostKind; label: string | null; amountRappen: Rappen };

export type FixedCostChange =
  | { action: 'add'; fields: FixedCostFields }
  | { action: 'edit'; id: string; fields: FixedCostFields }
  | { action: 'stop'; id: string };

const toColumns = (fields: FixedCostFields) => ({
  kind: fields.kind,
  label: fields.label?.trim() ? fields.label.trim() : null,
  amount_rappen: fields.amountRappen,
});

/**
 * Adds, edits or stops a fixed cost. Fixed costs are never deleted (`active = false`), so past
 * payments keep their link; changes count from the next month (docs/API.md "Editors").
 */
export function useChangeFixedCost() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  return useMutation({
    mutationFn: async (change: FixedCostChange) => {
      if (!userId) throw new RequestError('Not signed in', 401, 'not_signed_in');
      const table = getSupabase().from('fixed_costs');
      const { error, status } =
        change.action === 'add'
          ? await table.insert({ user_id: userId, active: true, ...toColumns(change.fields) })
          : change.action === 'edit'
            ? await table.update(toColumns(change.fields)).eq('id', change.id)
            : await table.update({ active: false }).eq('id', change.id);
      if (error) throw toRequestError({ error, status });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: fixedCostKeys.all }),
        queryClient.invalidateQueries({ queryKey: overviewKeys.all }),
      ]);
    },
  });
}
