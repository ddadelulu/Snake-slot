import { useTranslation } from 'react-i18next';

import { EmptyState, Screen } from '@/components';

export default function InsightsScreen() {
  const { t } = useTranslation();
  return (
    <Screen
      title={t('tabs.insights')}
      scroll
      edges={['top', 'left', 'right']}
      testID="insights-screen"
    >
      <EmptyState title={t('insights.emptyTitle')} message={t('insights.emptyMessage')} />
    </Screen>
  );
}
