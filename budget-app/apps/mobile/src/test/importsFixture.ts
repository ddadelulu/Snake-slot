import type { Tables } from '@budget/core';
import { renderRouter } from 'expo-router/testing-library';

import { getSupabase, getSupabaseIfConfigured } from '@/lib/supabase';

import { fakeSession } from './appHarness';
import { createFakeSupabase, type FakeRow, type RpcHandler } from './fakeSupabase';
import { OVERVIEW_JSON } from './overviewFixture';

/**
 * Data for the Milestone 3 route tests of statement import, data sources, rules and export, in
 * the snake_case shapes the database returns. SYNTHETIC: every merchant, file and amount is made
 * up. Test files that use `startImportsApp` mock `@/lib/supabase`, `@/lib/env` and
 * `expo-localization` like home.test.tsx does.
 */

export const USER_ID = fakeSession().user.id;

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
    id: 'c-clothes',
    default_key: 'clothes',
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
    id: 'f-health',
    kind: 'health_insurance',
    label: null,
    amount_rappen: 41235,
    merchant_hint: 'fictiva krankenkasse',
    active: true,
    created_at: '2026-09-25T08:00:00Z',
  },
  {
    id: 'f-phone',
    kind: 'phone_internet',
    label: 'Exempla Mobile',
    amount_rappen: 6500,
    merchant_hint: null,
    active: true,
    created_at: '2026-09-25T08:01:00Z',
  },
];

/** A TransactionItem as get_transaction returns it. */
export function transactionJson(overrides: Record<string, unknown> & { id: string }) {
  return {
    amount_rappen: -2340,
    booked_at: '2026-09-29T12:05:00+00:00',
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
    created_at: '2026-09-29T12:05:00+00:00',
    ...overrides,
  };
}

/** A data_sources row of an imported statement. */
export function importRow(overrides: Record<string, unknown> & { id: string }): FakeRow {
  const { settings, ...rest } = overrides;
  return {
    kind: 'statement_import',
    display_name: 'konto-september.csv',
    status: 'active',
    created_at: '2026-10-03T09:30:00+00:00',
    ...rest,
    settings: {
      file_name: 'konto-september.csv',
      format: 'csv',
      bank: 'postfinance',
      added: 12,
      merged: 1,
      ...(settings as Record<string, unknown> | undefined),
    },
  };
}

export const ok = (data: unknown) => ({ data, error: null });

/** A refusal as a database function raises it (22023 with the reason as message). */
export const refused = (reason: string) => ({
  data: null,
  error: { message: reason, code: '22023' },
});

/** A failure without a refusal reason: the screens show their general message. */
export const failed = () => ({ data: null, error: { message: 'Failed to fetch' } });

/** UTF-8 bytes of a synthetic statement. */
export function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/**
 * Starts the whole app at `url`, signed in and onboarded (payday 25, Zurich), with categories,
 * fixed costs, imports and rules as given plus the database functions.
 */
export function startImportsApp(options: {
  url: string;
  rpc?: Record<string, RpcHandler>;
  profile?: Partial<Tables<'profiles'>>;
  tables?: Record<string, FakeRow[]>;
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
      get_overview: () => ok(OVERVIEW_JSON),
      list_transactions: () => ok({ items: [], next_cursor: null }),
      ...options.rpc,
    },
    tables: {
      categories: CATEGORY_ROWS.map((row) => ({ ...row })),
      fixed_costs: FIXED_COST_ROWS.map((row) => ({ ...row })),
      data_sources: [],
      categorization_rules: [],
      ...options.tables,
    },
  });
  jest.mocked(getSupabaseIfConfigured).mockReturnValue(fake.client as never);
  jest.mocked(getSupabase).mockReturnValue(fake.client as never);
  const rendered = renderRouter('src/app', { initialUrl: options.url });
  return { ...fake, getPathname: () => rendered.getPathname() };
}

/** The arguments of every call to one database function, in order. */
export function rpcCalls(
  fake: Pick<ReturnType<typeof createFakeSupabase>, 'client'>,
  name: string,
): unknown[] {
  return fake.client.rpc.mock.calls.filter(([called]) => called === name).map(([, args]) => args);
}
