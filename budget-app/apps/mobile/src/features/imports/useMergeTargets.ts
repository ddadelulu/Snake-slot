import { useQueries, type UseQueryResult } from '@tanstack/react-query';

import { fetchTransaction, transactionKeys, type TransactionItem } from '@/data/transactions';
import { useAuth } from '@/features/auth/AuthProvider';

function byId(
  results: UseQueryResult<TransactionItem | null>[],
): ReadonlyMap<string, TransactionItem> {
  const map = new Map<string, TransactionItem>();
  for (const result of results) if (result.data) map.set(result.data.id, result.data);
  return map;
}

/**
 * The transactions that statement lines would be merged into (the dry run names them by id), so
 * the preview can say which purchase a line belongs to. Lines whose target is still loading or
 * unknown are shown without the details.
 */
export function useMergeTargets(ids: readonly string[]): ReadonlyMap<string, TransactionItem> {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  return useQueries({
    queries: userId
      ? [...new Set(ids)].map((id) => ({
          queryKey: transactionKeys.detail(userId, id),
          queryFn: () => fetchTransaction(id),
        }))
      : [],
    combine: byId,
  });
}
