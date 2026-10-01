import { useQuery } from '@tanstack/react-query';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AlertBanner, AppText, PrimaryButton } from '@/components';
import { makeStyles, useTheme } from '@/theme';

import {
  fetchAuthSettings,
  isAppleNativeAvailable,
  signInWithApple,
  signInWithOAuthProvider,
  type ProviderSignInResult,
} from './authApi';
import type { AuthErrorCode } from './errors';

export const authSettingsKey = ['auth-settings'] as const;

const useStyles = makeStyles((theme) => ({
  container: { gap: theme.spacing.md },
  divider: { alignItems: 'center' },
  appleButton: { height: theme.sizes.buttonHeight, width: '100%' },
}));

/**
 * "Continue with Google / Apple", showing only the providers the Supabase project has enabled.
 * Apple uses the native sheet on iOS (with Apple's own button, as its guidelines require) and
 * the browser flow on Android and web.
 */
export function ProviderButtons() {
  const { t } = useTranslation();
  const styles = useStyles();
  const theme = useTheme();
  const [busy, setBusy] = useState<'google' | 'apple' | null>(null);
  const [error, setError] = useState<AuthErrorCode | null>(null);

  const settings = useQuery({ queryKey: authSettingsKey, queryFn: fetchAuthSettings });
  const appleNative = useQuery({ queryKey: ['apple-native'], queryFn: isAppleNativeAvailable });

  const google = settings.data?.google === true;
  const apple = settings.data?.apple === true;
  if (!google && !apple) return null;

  const run = async (provider: 'google' | 'apple', action: () => Promise<ProviderSignInResult>) => {
    setBusy(provider);
    setError(null);
    const result = await action();
    setBusy(null);
    if (!result.ok && result.kind === 'auth') setError(result.code);
  };

  return (
    <View style={styles.container} testID="provider-buttons">
      <View style={styles.divider}>
        <AppText tone="secondary">{t('common.or')}</AppText>
      </View>
      {error ? <AlertBanner tone="danger" message={t(`auth.errors.${error}`)} /> : null}
      {google ? (
        <PrimaryButton
          variant="secondary"
          label={t('auth.providers.google')}
          loading={busy === 'google'}
          disabled={busy !== null}
          onPress={() => void run('google', () => signInWithOAuthProvider('google'))}
          testID="sign-in-google"
        />
      ) : null}
      {apple && appleNative.data === true ? (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={
            theme.scheme === 'dark'
              ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
              : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
          }
          cornerRadius={theme.radii.md}
          style={styles.appleButton}
          onPress={() => void run('apple', signInWithApple)}
        />
      ) : null}
      {apple && appleNative.data === false ? (
        <PrimaryButton
          variant="secondary"
          label={t('auth.providers.apple')}
          loading={busy === 'apple'}
          disabled={busy !== null}
          onPress={() => void run('apple', signInWithApple)}
          testID="sign-in-apple"
        />
      ) : null}
    </View>
  );
}
