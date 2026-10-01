import { useTranslation } from 'react-i18next';

import { EmptyState, Screen } from '@/components';

export default function AssistantScreen() {
  const { t } = useTranslation();
  return (
    <Screen
      title={t('tabs.assistant')}
      scroll
      edges={['top', 'left', 'right']}
      testID="assistant-screen"
    >
      <EmptyState title={t('assistant.emptyTitle')} message={t('assistant.emptyMessage')} />
    </Screen>
  );
}
