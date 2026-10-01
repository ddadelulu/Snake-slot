import { useTranslation } from 'react-i18next';

import { AlertBanner } from '@/components';

import { useAuthNotice, type AuthNotice } from './AuthNotice';

const MESSAGE_KEY = {
  account_deleted: 'auth.notices.accountDeleted',
  password_updated: 'auth.notices.passwordUpdated',
} as const satisfies Record<AuthNotice, string>;

/** Shows the pending auth notice, if any, until the person dismisses it. */
export function NoticeBanner() {
  const { t } = useTranslation();
  const { notice, clearNotice } = useAuthNotice();
  if (!notice) return null;
  return (
    <AlertBanner
      tone="info"
      message={t(MESSAGE_KEY[notice])}
      onDismiss={clearNotice}
      dismissLabel={t('common.dismiss')}
      testID="auth-notice"
    />
  );
}
