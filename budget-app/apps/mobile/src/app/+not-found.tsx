import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { PrimaryButton, Screen } from '@/components';

export default function NotFoundScreen() {
  const { t } = useTranslation();
  return (
    <Screen title={t('notFound.title')} testID="not-found">
      <PrimaryButton label={t('notFound.home')} onPress={() => router.replace('/')} />
    </Screen>
  );
}
