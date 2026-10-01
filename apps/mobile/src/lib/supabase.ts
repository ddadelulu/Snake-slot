import 'react-native-url-polyfill/auto';

import type { Database } from '@budget/core';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { AppState, Platform, type AppStateStatus } from 'react-native';

import { readEnv } from './env';
import { secureStorage } from './secureStorage';

export type AppSupabaseClient = SupabaseClient<Database>;

let client: AppSupabaseClient | null = null;

/**
 * The app's single Supabase client, created on first use. Throws when the environment is not
 * configured; the root layout checks readEnv() first and shows a configuration screen instead,
 * so in a running app this only throws on a programming error.
 */
export function getSupabase(): AppSupabaseClient {
  if (client) return client;
  const env = readEnv();
  if (!env.ok) {
    throw new Error(`Supabase is not configured: ${env.problems.join(' ')}`);
  }
  client = createClient<Database>(env.supabaseUrl, env.supabaseKey, {
    auth: {
      storage: secureStorage,
      autoRefreshToken: true,
      persistSession: true,
      // Deep links are handled explicitly by completeAuthFromUrl (features/auth/authApi).
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
  });
  if (Platform.OS !== 'web') pauseTokenRefreshInBackground(client);
  return client;
}

/** The client, or null when the environment is not configured. Never throws. */
export function getSupabaseIfConfigured(): AppSupabaseClient | null {
  return readEnv().ok ? getSupabase() : null;
}

/**
 * On native, supabase-js cannot tell whether the app is in the foreground. Refresh tokens only
 * while it is, as the supabase-js docs prescribe for React Native. (The browser build handles
 * this itself through the visibilitychange event.)
 */
function pauseTokenRefreshInBackground(supabase: AppSupabaseClient): void {
  AppState.addEventListener('change', (state: AppStateStatus) => {
    if (state === 'active') void supabase.auth.startAutoRefresh();
    else void supabase.auth.stopAutoRefresh();
  });
}

/**
 * Where Supabase sends the user back to after OAuth or an email link: `batzen://auth/callback`
 * in builds (an exp:// URL in Expo Go, the dev server origin on web). `next` is added as a query
 * parameter for the app to route on after the code exchange, e.g. `next=reset-password`.
 * Every variant must be on the Supabase project's redirect allow-list (`batzen://auth/callback**`).
 */
export function authRedirectUrl(next?: string): string {
  return Linking.createURL('auth/callback', next ? { queryParams: { next } } : undefined);
}
