import { focusManager, QueryClient } from '@tanstack/react-query';
import { AppState, Platform, type AppStateStatus } from 'react-native';

import { isClientError } from './requestError';

export const QUERY_STALE_TIME_MS = 30_000;
export const QUERY_GC_TIME_MS = 5 * 60_000;
export const QUERY_MAX_RETRIES = 2;

/**
 * Retry a failed query up to twice, but not when the server answered with a 4xx: that answer will
 * not change (bad request, not found, row-level security), and retrying only delays the error.
 */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (isClientError(error)) return false;
  return failureCount < QUERY_MAX_RETRIES;
}

/**
 * A QueryClient with mobile defaults: data counts as fresh for 30 s, unused data is kept for five
 * minutes, failed queries retry twice (except 4xx), and mutations never retry on their own (a
 * repeated write must be the user's decision).
 */
export function createQueryClient(): QueryClient {
  if (Platform.OS !== 'web') connectAppStateToFocus();
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: QUERY_STALE_TIME_MS,
        gcTime: QUERY_GC_TIME_MS,
        retry: shouldRetryQuery,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

let focusConnected = false;

/**
 * React Query refetches stale data when the app "regains focus". On native there is no window
 * focus event, so the foreground/background state of the app stands in for it.
 */
function connectAppStateToFocus(): void {
  if (focusConnected) return;
  focusConnected = true;
  focusManager.setEventListener((setFocused) => {
    const subscription = AppState.addEventListener('change', (state: AppStateStatus) => {
      setFocused(state === 'active');
    });
    return () => subscription.remove();
  });
}
