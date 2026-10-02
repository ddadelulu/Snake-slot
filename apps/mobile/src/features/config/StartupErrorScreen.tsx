import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { EmptyState, Screen, TextLink } from '@/components';
import { signOut } from '@/features/auth/authApi';

/**
 * Shown when the signed-in account could not be loaded at start (usually no connection), so the
 * app neither guesses whether onboarding is done nor shows an empty month.
 */
export function StartupErrorScreen({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();

  useEffect(() => {
    SplashScreen.hide();
  }, []);

  return (
    <Screen testID="startup-error">
      <EmptyState
        title={t('startup.title')}
        message={t('startup.message')}
        actionLabel={t('startup.retry')}
        onAction={onRetry}
      />
      <TextLink label={t('settings.signOut')} onPress={() => void signOut()} />
    </Screen>
  );
}
