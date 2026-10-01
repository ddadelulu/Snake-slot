import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AlertBanner, AppText, PrimaryButton, Screen, TextLink } from '@/components';
import { resendSignUpConfirmation } from '@/features/auth/authApi';
import type { AuthErrorCode } from '@/features/auth/errors';

export default function CheckEmailScreen() {
  const { t } = useTranslation();
  const { email = '' } = useLocalSearchParams<{ email?: string }>();
  const [busy, setBusy] = useState(false);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState<AuthErrorCode | null>(null);

  const resend = async () => {
    setBusy(true);
    setError(null);
    const result = await resendSignUpConfirmation(email);
    setBusy(false);
    if (result.ok) setResent(true);
    else setError(result.kind === 'auth' ? result.code : 'unknown');
  };

  return (
    <Screen title={t('auth.checkEmail.title')} scroll testID="check-email-screen">
      <AppText>{t('auth.checkEmail.message', { email })}</AppText>
      {resent ? <AlertBanner tone="info" message={t('auth.checkEmail.resent')} /> : null}
      {error ? <AlertBanner tone="danger" message={t(`auth.errors.${error}`)} /> : null}
      {email ? (
        <PrimaryButton
          variant="secondary"
          label={t('auth.checkEmail.resend')}
          onPress={() => void resend()}
          loading={busy}
          testID="check-email-resend"
        />
      ) : null}
      <TextLink
        label={t('auth.checkEmail.backToSignIn')}
        onPress={() => router.replace('/sign-in')}
        testID="check-email-back"
      />
    </Screen>
  );
}
