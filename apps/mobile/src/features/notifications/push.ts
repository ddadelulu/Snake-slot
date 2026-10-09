import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import { pushTarget } from '@/features/alerts/target';
import { toRequestError } from '@/lib/requestError';
import { getSupabase } from '@/lib/supabase';

/**
 * Push notifications on this phone (M4-04): the operating system's permission, the Expo push
 * token the server sends to (`register_push_token`), and where tapping a notification leads.
 * The web build has no push: every function says so instead of failing.
 */

export const PUSH_SUPPORTED = Platform.OS === 'ios' || Platform.OS === 'android';

export type PushStatus = 'unsupported' | 'granted' | 'undetermined' | 'denied' | 'blocked';

export async function getPushStatus(): Promise<PushStatus> {
  if (!PUSH_SUPPORTED) return 'unsupported';
  const permission = await Notifications.getPermissionsAsync();
  if (permission.status === 'granted') return 'granted';
  if (permission.status === 'denied') return permission.canAskAgain ? 'denied' : 'blocked';
  return 'undetermined';
}

async function registerToken(): Promise<void> {
  const projectId =
    Constants.easConfig?.projectId ??
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
  const token = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  const { error, status } = await getSupabase().rpc('register_push_token', {
    p_token: token.data,
    p_platform: Platform.OS,
  });
  if (error) throw toRequestError({ error, status });
}

/**
 * Asks for the permission (only when the system still allows asking) and registers this phone.
 * Resolves to the status afterwards; rejects when the token could not be registered.
 */
export async function enablePush(): Promise<PushStatus> {
  const current = await getPushStatus();
  if (current === 'unsupported' || current === 'blocked') return current;
  let status = current;
  if (status !== 'granted') {
    const answer = await Notifications.requestPermissionsAsync();
    status =
      answer.status === 'granted' ? 'granted' : answer.canAskAgain ? 'denied' : 'blocked';
  }
  if (status === 'granted') await registerToken();
  return status;
}

/** Opens what a tapped notification is about, also when the tap started the app. */
export function usePushNavigation(enabled: boolean): void {
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !PUSH_SUPPORTED) return;
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
    const open = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const id = response.notification.request.identifier;
      if (handled.current === id) return;
      handled.current = id;
      const target = pushTarget(response.notification.request.content.data);
      if (target) router.push(target);
    };
    let active = true;
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (active) open(response);
      })
      .catch(() => undefined);
    const subscription = Notifications.addNotificationResponseReceivedListener(open);
    return () => {
      active = false;
      subscription.remove();
    };
  }, [enabled]);
}
