import { DEFAULT_CATEGORY_KEYS, type DefaultCategoryKey } from '@budget/core';
import { skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';
import { RequestError, toRequestError } from '@/lib/requestError';
import { getSupabase } from '@/lib/supabase';

import { categoryDetailKeys } from './categoryDetail';
import { jsonReader } from './json';
import { overviewKeys } from './overview';

/** The person's categories, active and archived (archived ones still name old transactions). */
export type Category = {
  id: string;
  defaultKey: DefaultCategoryKey | null;
  name: string | null;
  icon: string | null;
  sortOrder: number;
  archived: boolean;
};

const read = jsonReader('categories');

export function toCategory(json: unknown, index: number): Category {
  const row = read.object(json, `categories[${index}]`);
  const at = (key: string) => `categories[${index}].${key}`;
  return {
    id: read.text(row.id, at('id')),
    defaultKey:
      row.default_key === null || row.default_key === undefined
        ? null
        : read.oneOf(DEFAULT_CATEGORY_KEYS, row.default_key, at('default_key')),
    name: read.optionalText(row.name, at('name')),
    icon: read.optionalText(row.icon, at('icon')),
    sortOrder: read.integer(row.sort_order, at('sort_order')),
    archived: read.optionalText(row.archived_at, at('archived_at')) !== null,
  };
}

export async function fetchCategories(): Promise<Category[]> {
  const { data, error, status } = await getSupabase()
    .from('categories')
    .select('id, default_key, name, icon, sort_order, archived_at')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw toRequestError({ error, status });
  return (data ?? []).map((row, index) => toCategory(row, index));
}

export const categoryKeys = {
  all: ['categories'] as const,
  list: (userId: string) => ['categories', userId] as const,
};

/** Every category of the signed-in user, in their order. */
export function useCategories() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  return useQuery({
    queryKey: userId ? categoryKeys.list(userId) : categoryKeys.all,
    queryFn: userId ? fetchCategories : skipToken,
  });
}

export type CategoryChange =
  | { kind: 'add'; name: string; sortOrder: number }
  | { kind: 'rename'; id: string; name: string }
  | { kind: 'archive'; id: string };

/**
 * Adds, renames or archives a category (direct table writes under row-level security, docs/API.md
 * "Editors"). Archived categories stay, so old transactions keep their name. A rename stores the
 * person's own name, which then wins over the translated default name.
 */
export function useChangeCategory() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  return useMutation({
    mutationFn: async (change: CategoryChange) => {
      if (!userId) throw new RequestError('Not signed in', 401, 'not_signed_in');
      const table = getSupabase().from('categories');
      const { error, status } =
        change.kind === 'add'
          ? await table.insert({
              user_id: userId,
              name: change.name.trim(),
              sort_order: change.sortOrder,
            })
          : change.kind === 'rename'
            ? await table.update({ name: change.name.trim() }).eq('id', change.id)
            : await table.update({ archived_at: new Date().toISOString() }).eq('id', change.id);
      if (error) throw toRequestError({ error, status });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: categoryKeys.all }),
        queryClient.invalidateQueries({ queryKey: overviewKeys.all }),
        queryClient.invalidateQueries({ queryKey: categoryDetailKeys.all }),
      ]);
    },
  });
}
