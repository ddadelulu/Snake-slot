import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { AlertBanner, AppText, Screen } from '@/components';

/**
 * Shown instead of the app when the build has no (or an unsafe) Supabase configuration, so a
 * misconfigured build fails loudly and explains itself rather than crashing.
 */
export function ConfigErrorScreen({ problems }: { problems: readonly string[] }) {
  const { t } = useTranslation();

  useEffect(() => {
    SplashScreen.hide();
  }, []);

  return (
    <Screen title={t('config.title')} scroll testID="config-error">
      <AppText tone="secondary">{t('config.message')}</AppText>
      {problems.map((problem) => (
        <AlertBanner key={problem} tone="danger" message={problem} />
      ))}
    </Screen>
  );
}
