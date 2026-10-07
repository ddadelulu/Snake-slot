import {
  RULE_MATCH_FIELDS,
  RULE_MATCH_TYPES,
  type RuleMatchField,
  type RuleMatchType,
} from '@budget/core';
import { skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';
import { toRequestError } from '@/lib/requestError';
import { getSupabase } from '@/lib/supabase';

import { jsonReader } from './json';

/** "Always do this for Manor?" rules (created through `update_transaction`). */
export type CategorizationRule = {
  id: string;
  matchField: RuleMatchField;
  matchType: RuleMatchType;
  pattern: string;
  categoryId: string;
  priority: number;
  createdAt: string;
};

const read = jsonReader('categorization_rules');

export function toRule(json: unknown, index: number): CategorizationRule {
  const row = read.object(json, `rules[${index}]`);
  const at = (key: string) => `rules[${index}].${key}`;
  return {
    id: read.text(row.id, at('id')),
    matchField: read.oneOf(RULE_MATCH_FIELDS, row.match_field, at('match_field')),
    matchType: read.oneOf(RULE_MATCH_TYPES, row.match_type, at('match_type')),
    pattern: read.text(row.pattern, at('pattern')),
    categoryId: read.text(row.category_id, at('category_id')),
    priority: read.integer(row.priority, at('priority')),
    createdAt: read.text(row.created_at, at('created_at')),
  };
}

export async function fetchRules(): Promise<CategorizationRule[]> {
  const { data, error, status } = await getSupabase()
    .from('categorization_rules')
    .select('id, match_field, match_type, pattern, category_id, priority, created_at')
    .order('priority', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw toRequestError({ error, status });
  return (data ?? []).map((row, index) => toRule(row, index));
}

/** Deleting a rule leaves the transactions it already placed as they are. */
export async function deleteRule(id: string): Promise<void> {
  const { error, status } = await getSupabase().from('categorization_rules').delete().eq('id', id);
  if (error) throw toRequestError({ error, status });
}

export const ruleKeys = {
  all: ['rules'] as const,
  list: (userId: string) => ['rules', userId] as const,
};

export function useRules() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  return useQuery({
    queryKey: userId ? ruleKeys.list(userId) : ruleKeys.all,
    queryFn: userId ? fetchRules : skipToken,
  });
}

export function useDeleteRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteRule,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ruleKeys.all }),
  });
}
