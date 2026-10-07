import type { Tables } from '@budget/core';
import { renderRouter } from 'expo-router/testing-library';

import { getSupabase, getSupabaseIfConfigured } from '@/lib/supabase';

import { fakeSession } from './appHarness';
import { createFakeSupabase, type FakeRow, type RpcHandler } from './fakeSupabase';
import { OVERVIEW_JSON } from './overviewFixture';

/**
 * Data for the Milestone 3 route tests (quick add, Transactions tab, detail, review), in the
 * snake_case shapes the database functions and tables return. Test files that use `startApp`
 * mock `@/lib/supabase`, `@/lib/env` and `expo-localization` like home.test.tsx does.
 */

export const CATEGORY_ROWS: FakeRow[] = [
  {
    id: 'c-groceries',
    default_key: 'groceries',
    name: null,
    icon: null,
    sort_order: 0,
    archived_at: null,
    created_at: '2026-09-25T08:00:00Z',
  },
  {
    id: 'c-eating-out',
    default_key: 'eating_out',
    name: null,
    icon: null,
    sort_order: 1,
    archived_at: null,
    created_at: '2026-09-25T08:00:00Z',
  },
  {
    id: 'c-dog',
    default_key: null,
    name: 'Dog',
    icon: null,
    sort_order: 2,
    archived_at: null,
    created_at: '2026-09-25T08:00:00Z',
  },
  {
    id: 'c-old',
    default_key: null,
    name: 'Old hobby',
    icon: null,
    sort_order: 3,
    archived_at: '2026-09-30T08:00:00Z',
    created_at: '2026-09-25T08:00:00Z',
  },
];

export const FIXED_COST_ROWS: FakeRow[] = [
  {
    id: 'f-rent',
    kind: 'rent',
    label: null,
    amount_rappen: 185000,
    merchant_hint: null,
    active: true,
    created_at: '2026-09-25T08:00:00Z',
  },
  {
    id: 'f-phone',
    kind: 'phone_internet',
    label: 'Swisscom',
    amount_rappen: 6500,
    merchant_hint: 'swisscom',
    active: true,
    created_at: '2026-09-25T08:01:00Z',
  },
  {
    id: 'f-gym',
    kind: 'other',
    label: 'Old gym',
    amount_rappen: 9000,
    merchant_hint: null,
    active: false,
    created_at: '2026-09-25T08:02:00Z',
  },
];

export type TransactionJson = Record<string, unknown> & { id: string };

/** One TransactionItem as list_transactions / get_transaction return it. */
export function transactionJson(
  overrides: Partial<TransactionJson> & { id: string },
): TransactionJson {
  return {
    amount_rappen: -8400,
    booked_at: '2026-10-02T12:05:00+00:00',
    merchant: null,
    raw_text: null,
    note: null,
    mcc: null,
    source: 'manual',
    data_source_id: null,
    data_source_name: null,
    category_id: null,
    categorized_by: 'none',
    category_confidence: null,
    fixed_cost_id: null,
    original_amount_minor: null,
    original_currency: null,
    items: null,
    splits: [],
    merged_sources: [],
    needs_review: false,
    deleted_at: null,
    created_at: '2026-10-02T12:05:00+00:00',
    ...overrides,
  };
}

export function page(
  items: TransactionJson[],
  nextCursor: { booked_at: string; id: string } | null = null,
) {
  return { items, next_cursor: nextCursor };
}

export const ok = (data: unknown) => ({ data, error: null });

/** A refusal as a database function raises it (22023 with the reason as message). */
export const refused = (reason: string) => ({
  data: null,
  error: { message: reason, code: '22023' },
});

/**
 * Starts the whole app at `url`, signed in and onboarded (payday 25, Zurich), with the overview,
 * categories and fixed costs above plus the given database functions.
 */
export function startApp(options: {
  url: string;
  rpc?: Record<string, RpcHandler>;
  profile?: Partial<Tables<'profiles'>>;
  tables?: Record<string, FakeRow[]>;
  overview?: unknown;
}) {
  const fake = createFakeSupabase({
    session: fakeSession(),
    profile: {
      onboarding_completed_at: '2026-09-25T08:00:00.000000+00:00',
      language: 'en',
      payday: 25,
      timezone: 'Europe/Zurich',
      ...options.profile,
    },
    rpc: {
      get_overview: () => ok(options.overview ?? OVERVIEW_JSON),
      ...options.rpc,
    },
    tables: {
      categories: CATEGORY_ROWS.map((row) => ({ ...row })),
      fixed_costs: FIXED_COST_ROWS.map((row) => ({ ...row })),
      ...options.tables,
    },
  });
  jest.mocked(getSupabaseIfConfigured).mockReturnValue(fake.client as never);
  jest.mocked(getSupabase).mockReturnValue(fake.client as never);
  renderRouter('src/app', { initialUrl: options.url });
  return fake;
}

/** The arguments of every call to one database function, in order. */
export function rpcCalls(fake: ReturnType<typeof createFakeSupabase>, name: string): unknown[] {
  return fake.client.rpc.mock.calls.filter(([called]) => called === name).map(([, args]) => args);
}
