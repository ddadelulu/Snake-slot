import type { AppStateStatus } from 'react-native';

type ChangeListener = (state: AppStateStatus) => void;

const mockCreateClient = jest.fn();
jest.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}));

const mockReadEnv = jest.fn();
jest.mock('./env', () => ({ readEnv: () => mockReadEnv() }));

const mockCreateURL = jest.fn(
  (path: string, options?: { queryParams?: Record<string, string> }) => {
    const query = options?.queryParams
      ? `?${new URLSearchParams(options.queryParams).toString()}`
      : '';
    return `batzen://${path}${query}`;
  },
);
jest.mock('expo-linking', () => ({
  createURL: (path: string, options?: { queryParams?: Record<string, string> }) =>
    mockCreateURL(path, options),
}));

const CONFIGURED = {
  ok: true,
  supabaseUrl: 'https://abc.supabase.co',
  supabaseKey: 'sb_publishable_test',
  appEnv: 'production',
} as const;

function fakeClient() {
  return {
    auth: {
      startAutoRefresh: jest.fn(async () => undefined),
      stopAutoRefresh: jest.fn(async () => undefined),
    },
  };
}

/**
 * Loads ./supabase from a fresh module registry (the client is a module singleton) with
 * Platform.OS set to `os` and AppState listeners captured.
 */
function load(os: 'ios' | 'android' | 'web') {
  jest.resetModules();
  let listeners: ChangeListener[] = [];
  // A fresh registry needs require(): dynamic import() would need Jest's experimental ESM mode.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactNative = require('react-native') as typeof import('react-native');
  Object.defineProperty(ReactNative.Platform, 'OS', {
    value: os,
    configurable: true,
    writable: true,
  });
  jest.spyOn(ReactNative.AppState, 'addEventListener').mockImplementation((_type, listener) => {
    listeners.push(listener as ChangeListener);
    return {
      remove: () => {
        listeners = listeners.filter((entry) => entry !== listener);
      },
    };
  });
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('./supabase') as typeof import('./supabase');
  return {
    mod,
    emit: (state: AppStateStatus) => listeners.forEach((listener) => listener(state)),
    listenerCount: () => listeners.length,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockReadEnv.mockReturnValue(CONFIGURED);
});

describe('getSupabase', () => {
  it('creates one PKCE client with secure, non-URL session handling', () => {
    const client = fakeClient();
    mockCreateClient.mockReturnValue(client);
    const { mod } = load('ios');

    const first = mod.getSupabase();
    const second = mod.getSupabase();

    expect(first).toBe(client);
    expect(second).toBe(first);
    expect(mockCreateClient).toHaveBeenCalledTimes(1);
    const [url, key, options] = mockCreateClient.mock.calls[0] as [
      string,
      string,
      { auth: Record<string, unknown> },
    ];
    expect(url).toBe('https://abc.supabase.co');
    expect(key).toBe('sb_publishable_test');
    expect(options.auth).toEqual({
      storage: expect.objectContaining({
        getItem: expect.any(Function),
        setItem: expect.any(Function),
        removeItem: expect.any(Function),
      }),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
    });
  });

  it('is lazy: nothing is created on import', () => {
    load('ios');
    expect(mockCreateClient).not.toHaveBeenCalled();
    expect(mockReadEnv).not.toHaveBeenCalled();
  });

  it('throws a clear error when the environment is not configured', () => {
    mockReadEnv.mockReturnValue({ ok: false, problems: ['EXPO_PUBLIC_SUPABASE_URL is not set.'] });
    const { mod } = load('ios');
    expect(() => mod.getSupabase()).toThrow(
      'Supabase is not configured: EXPO_PUBLIC_SUPABASE_URL is not set.',
    );
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it.each(['ios', 'android'] as const)(
    'refreshes tokens only while the app is in the foreground on %s',
    (os) => {
      const client = fakeClient();
      mockCreateClient.mockReturnValue(client);
      const { mod, emit, listenerCount } = load(os);
      mod.getSupabase();
      mod.getSupabase();
      expect(listenerCount()).toBe(1);

      emit('background');
      expect(client.auth.stopAutoRefresh).toHaveBeenCalledTimes(1);
      emit('inactive');
      expect(client.auth.stopAutoRefresh).toHaveBeenCalledTimes(2);
      emit('active');
      expect(client.auth.startAutoRefresh).toHaveBeenCalledTimes(1);
    },
  );

  it('leaves refresh scheduling to the browser on web', () => {
    mockCreateClient.mockReturnValue(fakeClient());
    const { mod, listenerCount } = load('web');
    mod.getSupabase();
    expect(listenerCount()).toBe(0);
  });
});

describe('getSupabaseIfConfigured', () => {
  it('returns null instead of throwing when not configured', () => {
    mockReadEnv.mockReturnValue({ ok: false, problems: ['x'] });
    const { mod } = load('ios');
    expect(mod.getSupabaseIfConfigured()).toBeNull();
  });

  it('returns the client when configured', () => {
    const client = fakeClient();
    mockCreateClient.mockReturnValue(client);
    const { mod } = load('ios');
    expect(mod.getSupabaseIfConfigured()).toBe(client);
  });
});

describe('authRedirectUrl', () => {
  it('points at auth/callback', () => {
    const { mod } = load('ios');
    expect(mod.authRedirectUrl()).toBe('batzen://auth/callback');
    expect(mockCreateURL).toHaveBeenCalledWith('auth/callback', undefined);
  });

  it('carries the screen to continue to', () => {
    const { mod } = load('ios');
    expect(mod.authRedirectUrl('reset-password')).toBe(
      'batzen://auth/callback?next=reset-password',
    );
  });
});
