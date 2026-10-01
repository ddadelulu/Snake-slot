import type { Session } from '@supabase/supabase-js';

/**
 * Test double for the part of the Supabase client AuthProvider uses, so the real route tree can
 * be rendered without a server. `emit` plays an auth event as supabase-js would.
 */
export function createFakeAuthClient(initialSession: Session | null) {
  type Listener = (event: string, session: Session | null) => void;
  let listener: Listener | null = null;
  const client = {
    auth: {
      getSession: jest.fn(async () => ({ data: { session: initialSession }, error: null })),
      onAuthStateChange: jest.fn((callback: Listener) => {
        listener = callback;
        return { data: { subscription: { unsubscribe: jest.fn() } } };
      }),
    },
  };
  return {
    client,
    emit(event: string, session: Session | null) {
      listener?.(event, session);
    },
  };
}

export function fakeSession(email = 'anna@example.ch'): Session {
  return {
    access_token: 'access-token',
    refresh_token: 'refresh-token',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user: {
      id: '7a1d3c4e-0000-4000-8000-000000000001',
      email,
      aud: 'authenticated',
      app_metadata: {},
      user_metadata: {},
      created_at: '2026-10-01T12:00:00Z',
    },
  } as Session;
}
