import { useQueryClient } from '@tanstack/react-query';
import { router, usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { hasPendingMoments } from '@/data/moments';
import { useAuth } from '@/features/auth/AuthProvider';
import { usePushNavigation } from '@/features/notifications/push';

/** Screens the moment never interrupts: itself, and quick add (which opens it when done). */
const QUIET_PATHS = ['/moment', '/add'];

/**
 * Mounted while a set-up person is signed in: when the app opens or comes back to the
 * foreground and purchases wait for their payment moment, it opens /moment (spec section 8).
 * Also opens whatever a tapped push notification is about.
 */
export function MomentWatcher() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const path = useRef(pathname);
  const userId = user?.id ?? null;

  useEffect(() => {
    path.current = pathname;
  }, [pathname]);

  usePushNavigation(userId !== null);

  useEffect(() => {
    if (!userId) return;
    const quiet = () => QUIET_PATHS.some((quietPath) => path.current.startsWith(quietPath));
    const check = async () => {
      if (quiet()) return;
      const waiting = await hasPendingMoments(queryClient, userId);
      if (waiting && !quiet()) router.push('/moment');
    };
    void check();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void check();
    });
    return () => subscription.remove();
  }, [queryClient, userId]);

  return null;
}
