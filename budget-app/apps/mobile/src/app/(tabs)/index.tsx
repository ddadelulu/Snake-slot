import { useTranslation } from 'react-i18next';

import { EmptyState, Screen } from '@/components';
import { NoticeBanner } from '@/features/auth/NoticeBanner';

export default function HomeScreen() {
  const { t } = useTranslation();
  return (
    <Screen title={t('tabs.home')} scroll edges={['top', 'left', 'right']} testID="home-screen">
      <NoticeBanner />
      <EmptyState title={t('home.emptyTitle')} message={t('home.emptyMessage')} />
    </Screen>
  );
}
