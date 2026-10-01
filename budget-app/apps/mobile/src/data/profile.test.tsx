import type { Profile, Tables } from '@budget/core';
import type { Session } from '@supabase/supabase-js';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { AuthProvider, type AuthClient } from '@/features/auth/AuthProvider';
import { shouldRetryQuery } from '@/lib/queryClient';
import { RequestError } from '@/lib/requestError';

import { profileKeys, toProfile, useProfile, useUpdateProfile } from './profile';

// --- A fake PostgREST query builder at the module boundary ------------------------------------

type Result = { data: unknown; error: { message: string; code: string } | null; status: number };

type Builder = {
  select: jest.Mock<Builder, [string]>;
  update: jest.Mock<Builder, [unknown]>;
  eq: jest.Mock<Builder, [string, string]>;
  single: () => Promise<Result>;
};

const mockSingle = jest.fn<Promise<Result>, []>();
const mockBuilder: Builder = {
  select: jest.fn((_columns: string) => mockBuilder),
  update: jest.fn((_patch: unknown) => mockBuilder),
  eq: jest.fn((_column: string, _value: string) => mockBuilder),
  single: () => mockSingle(),
};
const mockFrom = jest.fn((_table: string) => mockBuilder);

jest.mock('@/lib/supabase', () => ({
  getSupabase: () => ({ from: (table: string) => mockFrom(table) }),
  getSupabaseIfConfigured: () => null,
}));

// --- Fixtures ---------------------------------------------------------------------------------

const USER_ID = '6f1c0a52-9a51-4c0e-9d0f-0d6f3c2b1a10';

const ROW: Tables<'profiles'> = {
  id: USER_ID,
  display_name: 'Anna',
  language: 'de',
  timezone: 'Europe/Zurich',
  net_income_rappen: 650000,
  payday: 25,
  irregular_income: false,
  weekly_work_minutes: 2520,
  savings_monthly_rappen: 50000,
  savings_goal_name: null,
  savings_goal_rappen: null,
  savings_goal_date: null,
  leftover_policy: 'rollover',
  pain_level: 'normal',
  sound_enabled: true,
  payment_methods: ['card', 'twint'],
  onboarding_completed_at: null,
  created_at: '2026-10-01T10:00:00Z',
  updated_at: '2026-10-01T10:00:00Z',
};

const PROFILE = toProfile(ROW);

function ok(data: unknown): Result {
  return { data, error: null, status: 200 };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function authClient(userId: string | null): AuthClient {
  const session = userId
    ? ({
        access_token: 'a',
        refresh_token: 'r',
        expires_in: 3600,
        token_type: 'bearer',
        user: {
          id: userId,
          app_metadata: {},
          user_metadata: {},
          aud: 'authenticated',
          created_at: '',
        },
      } as Session)
    : null;
  return {
    auth: {
      getSession: async () => ({ data: { session }, error: null }),
      onAuthStateChange: () => ({
        data: { subscription: { id: 's', callback: () => {}, unsubscribe: () => {} } },
      }),
    },
  } as unknown as AuthClient;
}

function testQueryClient() {
  return new QueryClient({
    // gcTime Infinity: no garbage-collection timers left running after the tests.
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
}

function wrapperFor(queryClient: QueryClient, userId: string | null) {
  const client = authClient(userId);
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <AuthProvider getClient={() => client}>{children}</AuthProvider>
      </QueryClientProvider>
    );
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSingle.mockReset();
});

// --- toProfile --------------------------------------------------------------------------------

describe('toProfile', () => {
  it('keeps known values', () => {
    expect(PROFILE).toEqual(ROW);
  });

  it('falls back to the database defaults for values this version does not know', () => {
    expect(
      toProfile({
        ...ROW,
        language: 'fr',
        pain_level: 'extreme',
        leftover_policy: 'invest',
        payment_methods: ['card', 'crypto', 'cash'],
      }),
    ).toEqual({
      ...ROW,
      language: 'de',
      pain_level: 'normal',
      leftover_policy: 'rollover',
      payment_methods: ['card', 'cash'],
    });
  });
});

describe('profileKeys', () => {
  it('scopes the profile per user', () => {
    expect(profileKeys.detail(USER_ID)).toEqual(['profile', USER_ID]);
    expect(profileKeys.detail(USER_ID).slice(0, 1)).toEqual(profileKeys.all);
  });
});

// --- useProfile -------------------------------------------------------------------------------

describe('useProfile', () => {
  it("loads the signed-in user's own row", async () => {
    mockSingle.mockResolvedValue(ok(ROW));
    const queryClient = testQueryClient();
    const { result } = renderHook(() => useProfile(), {
      wrapper: wrapperFor(queryClient, USER_ID),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(PROFILE);
    expect(mockFrom).toHaveBeenCalledWith('profiles');
    expect(mockBuilder.select).toHaveBeenCalledWith('*');
    expect(mockBuilder.eq).toHaveBeenCalledWith('id', USER_ID);
    expect(queryClient.getQueryData(profileKeys.detail(USER_ID))).toEqual(PROFILE);
  });

  it('stays idle while nobody is signed in', async () => {
    const queryClient = testQueryClient();
    const { result } = renderHook(() => useProfile(), { wrapper: wrapperFor(queryClient, null) });
    await act(async () => undefined);
    expect(result.current.fetchStatus).toBe('idle');
    expect(result.current.data).toBeUndefined();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('fails with a RequestError and does not retry a 4xx answer', async () => {
    mockSingle.mockResolvedValue({
      data: null,
      error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' },
      status: 406,
    });
    const queryClient = testQueryClient();
    queryClient.setDefaultOptions({
      queries: {
        ...queryClient.getDefaultOptions().queries,
        retry: shouldRetryQuery,
        retryDelay: 0,
      },
    });
    const { result } = renderHook(() => useProfile(), {
      wrapper: wrapperFor(queryClient, USER_ID),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(RequestError);
    expect(result.current.error).toMatchObject({ status: 406, code: 'PGRST116' });
    expect(mockSingle).toHaveBeenCalledTimes(1);
  });
});

// --- useUpdateProfile -------------------------------------------------------------------------

describe('useUpdateProfile', () => {
  async function renderSignedIn(queryClient: QueryClient) {
    queryClient.setQueryData(profileKeys.detail(USER_ID), PROFILE);
    const hook = renderHook(() => useUpdateProfile(), {
      wrapper: wrapperFor(queryClient, USER_ID),
    });
    // Let AuthProvider read the session.
    await act(async () => undefined);
    return hook;
  }

  it('shows the change at once and then keeps what the server stored', async () => {
    const queryClient = testQueryClient();
    const { result } = await renderSignedIn(queryClient);
    const server = deferred<Result>();
    mockSingle.mockReturnValueOnce(server.promise);

    act(() => {
      result.current.mutate({ pain_level: 'brutal', display_name: undefined });
    });

    await waitFor(() =>
      expect(queryClient.getQueryData<Profile>(profileKeys.detail(USER_ID))?.pain_level).toBe(
        'brutal',
      ),
    );
    // Keys set to undefined neither blank the cached value nor reach the server.
    expect(queryClient.getQueryData<Profile>(profileKeys.detail(USER_ID))?.display_name).toBe(
      'Anna',
    );
    expect(mockFrom).toHaveBeenCalledWith('profiles');
    expect(mockBuilder.update).toHaveBeenCalledWith({ pain_level: 'brutal' });
    expect(mockBuilder.eq).toHaveBeenCalledWith('id', USER_ID);
    expect(mockBuilder.select).toHaveBeenCalledWith('*');

    const stored = { ...ROW, pain_level: 'brutal', updated_at: '2026-10-01T11:00:00Z' };
    await act(async () => server.resolve(ok(stored)));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(toProfile(stored));
    expect(queryClient.getQueryData(profileKeys.detail(USER_ID))).toEqual(toProfile(stored));
  });

  it('rolls back and refetches when the server rejects the change', async () => {
    const queryClient = testQueryClient();
    const { result } = await renderSignedIn(queryClient);
    const server = deferred<Result>();
    mockSingle.mockReturnValueOnce(server.promise).mockResolvedValue(ok(ROW));
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

    act(() => {
      result.current.mutate({ payday: 31, sound_enabled: false });
    });
    await waitFor(() =>
      expect(queryClient.getQueryData<Profile>(profileKeys.detail(USER_ID))).toMatchObject({
        payday: 31,
        sound_enabled: false,
      }),
    );

    await act(async () =>
      server.resolve({
        data: null,
        error: { message: 'new row violates check constraint', code: '23514' },
        status: 400,
      }),
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(RequestError);
    expect(result.current.error).toMatchObject({ status: 400, code: '23514' });
    expect(queryClient.getQueryData(profileKeys.detail(USER_ID))).toEqual(PROFILE);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: profileKeys.detail(USER_ID) });
  });

  it('rolls back after a network failure too', async () => {
    const queryClient = testQueryClient();
    const { result } = await renderSignedIn(queryClient);
    mockSingle.mockResolvedValueOnce({
      data: null,
      error: { message: 'TypeError: Network request failed', code: '' },
      status: 0,
    });

    act(() => {
      result.current.mutate({ language: 'en' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({ status: 0, isNetworkError: true });
    expect(queryClient.getQueryData<Profile>(profileKeys.detail(USER_ID))?.language).toBe('de');
  });

  it('updates even when no profile is cached yet', async () => {
    const queryClient = testQueryClient();
    const hook = renderHook(() => useUpdateProfile(), {
      wrapper: wrapperFor(queryClient, USER_ID),
    });
    await act(async () => undefined);
    mockSingle.mockResolvedValueOnce(ok({ ...ROW, display_name: 'Anna M.' }));

    act(() => {
      hook.result.current.mutate({ display_name: 'Anna M.' });
    });
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData<Profile>(profileKeys.detail(USER_ID))?.display_name).toBe(
      'Anna M.',
    );
  });

  it('refuses to update while nobody is signed in', async () => {
    const queryClient = testQueryClient();
    const { result } = renderHook(() => useUpdateProfile(), {
      wrapper: wrapperFor(queryClient, null),
    });
    await act(async () => undefined);

    act(() => {
      result.current.mutate({ pain_level: 'mild' });
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({ status: 401, code: 'not_signed_in' });
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
