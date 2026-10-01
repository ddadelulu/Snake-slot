import { useTranslation } from 'react-i18next';

import { EmptyState, Screen } from '@/components';

export default function TransactionsScreen() {
  const { t } = useTranslation();
  return (
    <Screen
      title={t('tabs.transactions')}
      scroll
      edges={['top', 'left', 'right']}
      testID="transactions-screen"
    >
      <EmptyState title={t('transactions.emptyTitle')} message={t('transactions.emptyMessage')} />
    </Screen>
  );
}
