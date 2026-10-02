import type { Session } from '@supabase/supabase-js';

import type { Tables } from '@budget/core';

import { createFakeAuthClient, fakeSession } from './appHarness';

/**
 * An in-memory stand-in for the Supabase client, covering exactly what the app calls: auth
 * (through createFakeAuthClient), `from('profiles')` select/update, and `rpc(...)`. Screens and
 * data hooks run unchanged against it, so route tests exercise the real React Query code paths.
 */

export function profileRow(overrides: Partial<Tables<'profiles'>> = {}): Tables<'profiles'> {
  return {
    id: fakeSession().user.id,
    display_name: null,
    language: 'en',
    timezone: 'Europe/Zurich',
    net_income_rappen: null,
    payday: null,
    irregular_income: false,
    weekly_work_minutes: null,
    savings_monthly_rappen: 0,
    savings_goal_name: null,
    savings_goal_rappen: null,
    savings_goal_date: null,
    leftover_policy: 'rollover',
    pain_level: 'normal',
    sound_enabled: true,
    payment_methods: [],
    onboarding_completed_at: null,
    created_at: '2026-10-01T12:00:00.000000+00:00',
    updated_at: '2026-10-01T12:00:00.000000+00:00',
    ...overrides,
  };
}

export type RpcHandler = (args: unknown) => { data: unknown; error: { message: string; code?: string } | null };

export type FakeSupabaseState = {
  profile: Tables<'profiles'>;
  rpc: Record<string, RpcHandler>;
};

export function createFakeSupabase(options: {
  session: Session | null;
  profile?: Partial<Tables<'profiles'>>;
  rpc?: Record<string, RpcHandler>;
}) {
  const auth = createFakeAuthClient(options.session);
  const state: FakeSupabaseState = {
    profile: profileRow(options.profile),
    rpc: options.rpc ?? {},
  };

  const ok = (data: unknown) => ({ data, error: null, status: 200 });

  const client = {
    auth: auth.client.auth,
    from: jest.fn((table: string) => {
      if (table !== 'profiles') throw new Error(`fake supabase: unexpected table ${table}`);
      return {
        select: () => ({
          eq: () => ({ single: async () => ok({ ...state.profile }) }),
        }),
        update: (patch: Partial<Tables<'profiles'>>) => ({
          eq: () => ({
            select: () => ({
              single: async () => {
                state.profile = { ...state.profile, ...patch, updated_at: new Date().toISOString() };
                return ok({ ...state.profile });
              },
            }),
          }),
        }),
      };
    }),
    rpc: jest.fn(async (name: string, args?: unknown) => {
      const handler = state.rpc[name];
      if (!handler) throw new Error(`fake supabase: unexpected rpc ${name}`);
      const { data, error } = handler(args);
      return { data, error, status: error ? 400 : 200 };
    }),
  };

  return { client, state, emit: auth.emit };
}
