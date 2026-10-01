import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Text } from 'react-native';

import { AuthProvider, useAuth, type AuthClient } from './AuthProvider';

const mockGetSupabaseIfConfigured = jest.fn();
jest.mock('@/lib/supabase', () => ({
  getSupabaseIfConfigured: () => mockGetSupabaseIfConfigured(),
}));

type Listener = (event: AuthChangeEvent, session: Session | null) => void;

function session(userId: string): Session {
  return {
    access_token: `access-${userId}`,
    refresh_token: `refresh-${userId}`,
    expires_in: 3600,
    token_type: 'bearer',
    user: {
      id: userId,
      app_metadata: {},
      user_metadata: {},
      aud: 'authenticated',
      created_at: '2026-10-01T00:00:00Z',
    },
  };
}

/** A fake auth client whose getSession() resolves when the test says so. */
function fakeClient() {
  let listener: Listener | null = null;
  let resolveSession: (value: {
    data: { session: Session | null };
    error: null;
  }) => void = () => {};
  let rejectSession: (error: unknown) => void = () => {};
  const unsubscribe = jest.fn(() => {
    listener = null;
  });
  const auth = {
    getSession: jest.fn(
      () =>
        new Promise<{ data: { session: Session | null }; error: null }>((resolve, reject) => {
          resolveSession = resolve;
          rejectSession = reject;
        }),
    ),
    onAuthStateChange: jest.fn((callback: Listener) => {
      listener = callback;
      return { data: { subscription: { id: 'sub', callback, unsubscribe } } };
    }),
  };
  return {
    client: { auth } as unknown as AuthClient,
    auth,
    unsubscribe,
    resolveSession: (value: Session | null) =>
      resolveSession({ data: { session: value }, error: null }),
    rejectSession: (error: unknown) => rejectSession(error),
    emit: (event: AuthChangeEvent, value: Session | null) => {
      if (!listener) throw new Error('no listener');
      listener(event, value);
    },
    hasListener: () => listener !== null,
  };
}

function setup(getClient: () => AuthClient | null) {
  const queryClient = new QueryClient();
  const clear = jest.spyOn(queryClient, 'clear');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <AuthProvider getClient={getClient}>{children}</AuthProvider>
    </QueryClientProvider>
  );
  const hook = renderHook(() => useAuth(), { wrapper });
  return { ...hook, queryClient, clear };
}

describe('AuthProvider', () => {
  it('starts loading and becomes signed out without a stored session', async () => {
    const fake = fakeClient();
    const { result } = setup(() => fake.client);
    expect(result.current.status).toBe('loading');
    expect(result.current.session).toBeNull();

    await act(async () => fake.resolveSession(null));
    expect(result.current).toMatchObject({ status: 'signed_out', session: null, user: null });
  });

  it('restores a stored session', async () => {
    const fake = fakeClient();
    const { result } = setup(() => fake.client);
    const stored = session('user-1');

    await act(async () => fake.resolveSession(stored));
    expect(result.current.status).toBe('signed_in');
    expect(result.current.session).toBe(stored);
    expect(result.current.user?.id).toBe('user-1');
  });

  it('follows sign-in, refresh and sign-out events and empties the cache on sign-out', async () => {
    const fake = fakeClient();
    const { result, clear } = setup(() => fake.client);
    await act(async () => fake.resolveSession(null));

    const signedIn = session('user-1');
    act(() => fake.emit('SIGNED_IN', signedIn));
    expect(result.current.status).toBe('signed_in');
    expect(result.current.user?.id).toBe('user-1');
    expect(clear).not.toHaveBeenCalled();

    const refreshed = { ...signedIn, access_token: 'access-2' };
    act(() => fake.emit('TOKEN_REFRESHED', refreshed));
    expect(result.current.session).toBe(refreshed);
    expect(clear).not.toHaveBeenCalled();

    act(() => fake.emit('SIGNED_OUT', null));
    expect(result.current).toMatchObject({ status: 'signed_out', session: null, user: null });
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it('empties the cache when a different user signs in', async () => {
    const fake = fakeClient();
    const { result, clear } = setup(() => fake.client);
    await act(async () => fake.resolveSession(session('user-1')));

    act(() => fake.emit('SIGNED_IN', session('user-1')));
    expect(clear).not.toHaveBeenCalled();
    act(() => fake.emit('SIGNED_IN', session('user-2')));
    expect(clear).toHaveBeenCalledTimes(1);
    expect(result.current.user?.id).toBe('user-2');
  });

  it('flags password recovery until the screen clears it', async () => {
    const fake = fakeClient();
    const { result } = setup(() => fake.client);
    await act(async () => fake.resolveSession(null));
    expect(result.current.isPasswordRecovery).toBe(false);

    act(() => fake.emit('PASSWORD_RECOVERY', session('user-1')));
    expect(result.current.isPasswordRecovery).toBe(true);
    expect(result.current.status).toBe('signed_in');

    act(() => fake.emit('USER_UPDATED', session('user-1')));
    expect(result.current.isPasswordRecovery).toBe(true);

    act(() => result.current.clearPasswordRecovery());
    expect(result.current.isPasswordRecovery).toBe(false);
  });

  it('drops the recovery flag on sign-out', async () => {
    const fake = fakeClient();
    const { result } = setup(() => fake.client);
    act(() => fake.emit('PASSWORD_RECOVERY', session('user-1')));
    expect(result.current.isPasswordRecovery).toBe(true);
    act(() => fake.emit('SIGNED_OUT', null));
    expect(result.current.isPasswordRecovery).toBe(false);
  });

  it('does not let a late initial read overwrite a newer event', async () => {
    const fake = fakeClient();
    const { result } = setup(() => fake.client);
    act(() => fake.emit('SIGNED_IN', session('user-1')));
    await act(async () => fake.resolveSession(null));
    expect(result.current.status).toBe('signed_in');
  });

  it('treats a failed initial read as signed out', async () => {
    const fake = fakeClient();
    const { result } = setup(() => fake.client);
    await act(async () => fake.rejectSession(new Error('keychain unavailable')));
    expect(result.current.status).toBe('signed_out');
  });

  it('unsubscribes on unmount and ignores events after it', async () => {
    const fake = fakeClient();
    const { unmount } = setup(() => fake.client);
    expect(fake.auth.onAuthStateChange).toHaveBeenCalledTimes(1);
    expect(fake.hasListener()).toBe(true);

    unmount();
    expect(fake.unsubscribe).toHaveBeenCalledTimes(1);
    // A getSession() result arriving after unmount must not update state (no act() warning).
    await act(async () => fake.resolveSession(session('user-1')));
  });

  it('subscribes once across re-renders', async () => {
    const fake = fakeClient();
    const getClient = jest.fn(() => fake.client);
    const { rerender } = setup(getClient);
    rerender({});
    rerender({});
    expect(getClient).toHaveBeenCalledTimes(1);
    expect(fake.auth.onAuthStateChange).toHaveBeenCalledTimes(1);
  });

  it('reports signed out without a client instead of throwing', () => {
    const { result } = setup(() => null);
    expect(result.current).toMatchObject({ status: 'signed_out', session: null, user: null });
  });

  it('reports signed out when getting the client throws', () => {
    const { result } = setup(() => {
      throw new Error('Supabase is not configured');
    });
    expect(result.current.status).toBe('signed_out');
  });

  it('uses the app client by default', async () => {
    const fake = fakeClient();
    mockGetSupabaseIfConfigured.mockReturnValue(fake.client);
    const queryClient = new QueryClient();
    function Status() {
      return <Text>{useAuth().status}</Text>;
    }
    render(
      <AuthProvider queryClient={queryClient}>
        <Status />
      </AuthProvider>,
    );
    expect(screen.getByText('loading')).toBeOnTheScreen();
    await act(async () => fake.resolveSession(session('user-1')));
    await waitFor(() => expect(screen.getByText('signed_in')).toBeOnTheScreen());
    expect(mockGetSupabaseIfConfigured).toHaveBeenCalledTimes(1);
  });
});

describe('useAuth', () => {
  it('requires the provider', () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderHook(() => useAuth())).toThrow(
      'useAuth must be used inside <AuthProvider>.',
    );
  });
});
