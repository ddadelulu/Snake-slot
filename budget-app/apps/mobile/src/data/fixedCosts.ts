import { FIXED_COST_KINDS, type FixedCostKind, type Rappen } from '@budget/core';
import { skipToken, useQuery } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';
import { toRequestError } from '@/lib/requestError';
import { getSupabase } from '@/lib/supabase';

import { jsonReader } from './json';

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
