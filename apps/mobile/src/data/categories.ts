import { DEFAULT_CATEGORY_KEYS, type DefaultCategoryKey } from '@budget/core';
import { skipToken, useQuery } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';
import { toRequestError } from '@/lib/requestError';
import { getSupabase } from '@/lib/supabase';

import { jsonReader } from './json';

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
      row.default_key === null
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
