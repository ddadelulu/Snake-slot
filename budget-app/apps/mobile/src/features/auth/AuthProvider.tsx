import type { Session, SupabaseClient, User } from '@supabase/supabase-js';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { getSupabaseIfConfigured } from '@/lib/supabase';

export type AuthStatus = 'loading' | 'signed_out' | 'signed_in';

export type AuthContextValue = {
  status: AuthStatus;
  session: Session | null;
  user: User | null;
  /**
   * True after a password reset link signed the user in (PASSWORD_RECOVERY), until the new
   * password is saved and the screen calls clearPasswordRecovery(). While it is true the app
   * should keep the user on the new-password screen.
   */
  isPasswordRecovery: boolean;
  clearPasswordRecovery: () => void;
};

/** The part of the Supabase client the provider uses; a test can pass a fake. */
export type AuthClient = Pick<SupabaseClient, 'auth'>;

const AuthContext = createContext<AuthContextValue | null>(null);

export type AuthProviderProps = {
  children: ReactNode;
  /**
   * Returns the Supabase client, or null when the app is not configured (the root layout then
   * shows its configuration screen and the provider reports 'signed_out'). Called once, on mount.
   * Defaults to the app's client.
   */
  getClient?: () => AuthClient | null;
  /** Defaults to the QueryClient from the surrounding QueryClientProvider. */
  queryClient?: QueryClient;
};

type State = { status: AuthStatus; session: Session | null };

const LOADING: State = { status: 'loading', session: null };

function stateFor(session: Session | null): State {
  return session ? { status: 'signed_in', session } : { status: 'signed_out', session: null };
}

/**
 * Keeps the auth state for the whole app. Reads the stored session on mount, then follows
 * supabase-js auth events. Empties the React Query cache when the user signs out or a different
 * user signs in, so no data from one account is ever shown to another.
 */
export function AuthProvider({
  children,
  getClient = getSupabaseIfConfigured,
  queryClient: queryClientProp,
}: AuthProviderProps) {
  const queryClient = useQueryClient(queryClientProp);
  const [client] = useState(() => {
    try {
      return getClient();
    } catch {
      return null;
    }
  });
  const [state, setState] = useState<State>(client ? LOADING : stateFor(null));
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const userIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!client) return;
    let active = true;
    // Events are always at least as fresh as the initial read; once one arrives, a late
    // getSession() result must not overwrite it.
    let receivedEvent = false;

    const apply = (session: Session | null) => {
      const userId = session?.user.id ?? null;
      if (userIdRef.current !== null && userId !== null && userId !== userIdRef.current) {
        queryClient.clear();
      }
      userIdRef.current = userId;
      setState(stateFor(session));
    };

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      receivedEvent = true;
      if (event === 'SIGNED_OUT') {
        queryClient.clear();
        setIsPasswordRecovery(false);
      } else if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true);
      }
      apply(session);
    });

    client.auth
      .getSession()
      .then(({ data }) => {
        if (active && !receivedEvent) apply(data.session);
      })
      .catch(() => {
        if (active && !receivedEvent) apply(null);
      });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [client, queryClient]);

  const clearPasswordRecovery = useCallback(() => setIsPasswordRecovery(false), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status: state.status,
      session: state.session,
      user: state.session?.user ?? null,
      isPasswordRecovery,
      clearPasswordRecovery,
    }),
    [state, isPasswordRecovery, clearPasswordRecovery],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** The current auth state. Must be used inside <AuthProvider>. */
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>.');
  return value;
}
