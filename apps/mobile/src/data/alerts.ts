import type { Json } from '@budget/core';
import {
  skipToken,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';
import { toRequestError } from '@/lib/requestError';
import { getSupabase } from '@/lib/supabase';

import { jsonReader } from './json';
import { overviewKeys } from './overview';

/**
 * The alerts inbox (spec section 9; docs/API.md, "Inbox"). The database writes every alert with
 * its title and body already in the person's language; the app lists, opens, marks read and
 * dismisses them.
 */

export type AlertItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  categoryId: string | null;
  transactionId: string | null;
  read: boolean;
  createdAt: string;
};

export type AlertCursor = { created_at: string; id: string };
export type AlertPage = { items: AlertItem[]; nextCursor: AlertCursor | null };

export const ALERTS_PAGE_SIZE = 30;

const read = jsonReader('list_alerts');

export function parseAlertPage(json: unknown): AlertPage {
  const root = read.object(json, 'list_alerts');
  const next =
    root.next_cursor === null || root.next_cursor === undefined
      ? null
      : read.object(root.next_cursor, 'next_cursor');
  return {
    items: read.array(root.items, 'items').map((entry, index) => {
      const row = read.object(entry, `items[${index}]`);
      const at = (key: string) => `items[${index}].${key}`;
      return {
        id: read.text(row.id, at('id')),
        type: read.text(row.type, at('type')),
        title: read.text(row.title, at('title')),
        body: read.text(row.body, at('body')),
        categoryId: read.optionalText(row.category_id, at('category_id')),
        transactionId: read.optionalText(row.transaction_id, at('transaction_id')),
        read: read.optionalText(row.read_at, at('read_at')) !== null,
        createdAt: read.text(row.created_at, at('created_at')),
      };
    }),
    nextCursor: next
      ? {
          created_at: read.text(next.created_at, 'next_cursor.created_at'),
          id: read.text(next.id, 'next_cursor.id'),
        }
      : null,
  };
}

export async function fetchAlertPage(cursor: AlertCursor | null): Promise<AlertPage> {
  const p: Record<string, unknown> = { limit: ALERTS_PAGE_SIZE };
  if (cursor) p.cursor = cursor;
  const { data, error, status } = await getSupabase().rpc('list_alerts', { p: p as Json });
  if (error) throw toRequestError({ error, status });
  return parseAlertPage(data);
}

export const alertKeys = {
  all: ['alerts'] as const,
  list: (userId: string) => ['alerts', userId, 'list'] as const,
};

/** The inbox, newest first, page by page. */
export function useAlerts() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  return useInfiniteQuery({
    queryKey: userId ? alertKeys.list(userId) : alertKeys.all,
    queryFn: userId
      ? ({ pageParam }: { pageParam: AlertCursor | null }) => fetchAlertPage(pageParam)
      : skipToken,
    initialPageParam: null as AlertCursor | null,
    getNextPageParam: (page: AlertPage) => page.nextCursor,
  });
}

type Pages = InfiniteData<AlertPage, AlertCursor | null>;

/** Changes the cached inbox at once; the server's answer is fetched afterwards anyway. */
function useInboxMutation<T>(
  request: (input: T) => Promise<void>,
  change: (pages: Pages, input: T) => Pages,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: request,
    onMutate: async (input: T) => {
      await queryClient.cancelQueries({ queryKey: alertKeys.all });
      queryClient.setQueriesData<Pages>({ queryKey: alertKeys.all }, (pages) =>
        pages ? change(pages, input) : pages,
      );
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: alertKeys.all }),
        // The bell's unread count comes with the month.
        queryClient.invalidateQueries({ queryKey: overviewKeys.all }),
      ]);
    },
  });
}

const mapItems = (pages: Pages, map: (items: AlertItem[]) => AlertItem[]): Pages => ({
  ...pages,
  pages: pages.pages.map((page) => ({ ...page, items: map(page.items) })),
});

export function useMarkAlertsRead() {
  return useInboxMutation<readonly string[]>(
    async (ids) => {
      const { error, status } = await getSupabase().rpc('mark_alerts_read', { p_ids: [...ids] });
      if (error) throw toRequestError({ error, status });
    },
    (pages, ids) =>
      mapItems(pages, (items) =>
        items.map((item) => (ids.includes(item.id) ? { ...item, read: true } : item)),
      ),
  );
}

export function useDismissAlert() {
  return useInboxMutation<string>(
    async (id) => {
      const { error, status } = await getSupabase().rpc('dismiss_alert', { p_id: id });
      if (error) throw toRequestError({ error, status });
    },
    (pages, id) => mapItems(pages, (items) => items.filter((item) => item.id !== id)),
  );
}
