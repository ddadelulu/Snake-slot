import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Platform, View } from 'react-native';

import { AlertBanner, AppText, PrimaryButton, Screen } from '@/components';
import { useAuth } from '@/features/auth/AuthProvider';
import { completeAuthFromUrl, type AuthNextRoute } from '@/features/auth/authApi';
import type { AuthErrorCode } from '@/features/auth/errors';
import { makeStyles, useTheme } from '@/theme';

type State =
  | { phase: 'working' }
  | { phase: 'done'; next: AuthNextRoute | undefined }
  | { phase: 'failed'; code: AuthErrorCode };

const useStyles = makeStyles((theme) => ({
  working: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.spacing.lg },
}));

/** The URL the app was opened with, rebuilt from the route params if the platform hides it. */
function callbackUrl(linkingUrl: string | null, params: Record<string, string | string[]>): string {
  if (linkingUrl && linkingUrl.includes('auth/callback')) return linkingUrl;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    query.set(key, Array.isArray(value) ? (value[0] ?? '') : value);
  }
  return `${Linking.createURL('auth/callback')}?${query.toString()}`;
}

/**
 * Where email links (sign-up confirmation, password reset) and OAuth redirects land. Exchanges the
 * one-time code for a session, then continues once the session is in place.
 */
export default function AuthCallbackScreen() {
  const { t } = useTranslation();
  const styles = useStyles();
  const theme = useTheme();
  const { status, isPasswordRecovery } = useAuth();
  const linkingUrl = Linking.useLinkingURL();
  const params = useLocalSearchParams<Record<string, string | string[]>>();
  const [state, setState] = useState<State>({ phase: 'working' });
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // On web, an OAuth popup lands here: hand the URL to the window that opened it and close.
    if (Platform.OS === 'web' && WebBrowser.maybeCompleteAuthSession().type === 'success') return;
    void completeAuthFromUrl(callbackUrl(linkingUrl, params)).then((result) => {
      setState(
        result.ok ? { phase: 'done', next: result.next } : { phase: 'failed', code: result.code },
      );
    });
  }, [linkingUrl, params]);

  useEffect(() => {
    if (state.phase !== 'done' || status !== 'signed_in') return;
    router.replace(state.next === 'reset-password' && isPasswordRecovery ? '/reset-password' : '/');
  }, [state, status, isPasswordRecovery]);

  if (state.phase === 'failed') {
    return (
      <Screen title={t('auth.callback.failedTitle')} scroll testID="auth-callback-failed">
        <AlertBanner tone="danger" message={t(`auth.errors.${state.code}`)} />
        <PrimaryButton
          label={t('auth.checkEmail.backToSignIn')}
          onPress={() => router.replace(status === 'signed_in' ? '/' : '/sign-in')}
        />
      </Screen>
    );
  }

  return (
    <Screen testID="auth-callback">
      <View style={styles.working}>
        <ActivityIndicator color={theme.colors.accent} />
        <AppText tone="secondary">{t('auth.callback.working')}</AppText>
      </View>
    </Screen>
  );
}
