import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AlertBanner, AppText, PrimaryButton, Screen, TextField, TextLink } from '@/components';
import { sendPasswordReset, type FieldErrors } from '@/features/auth/authApi';
import type { AuthErrorCode } from '@/features/auth/errors';

export default function ForgotPasswordScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(params.email ?? '');
  const [fields, setFields] = useState<FieldErrors>({});
  const [error, setError] = useState<AuthErrorCode | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    setFields({});
    const result = await sendPasswordReset(email);
    setBusy(false);
    if (result.ok) setSentTo(email.trim());
    else if (result.kind === 'field') setFields(result.fields);
    else setError(result.code);
  };

  return (
    <Screen title={t('auth.forgotPassword.title')} scroll testID="forgot-password-screen">
      <AppText tone="secondary">{t('auth.forgotPassword.message')}</AppText>
      {sentTo ? (
        <AlertBanner
          tone="info"
          message={t('auth.forgotPassword.sent', { email: sentTo })}
          testID="forgot-password-sent"
        />
      ) : null}
      {error ? <AlertBanner tone="danger" message={t(`auth.errors.${error}`)} /> : null}
      <TextField
        label={t('auth.email')}
        value={email}
        onChangeText={setEmail}
        error={fields.email ? t(`auth.validation.${fields.email}`) : undefined}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        returnKeyType="send"
        onSubmitEditing={() => void submit()}
        testID="forgot-password-email"
      />
      <PrimaryButton
        label={t('auth.forgotPassword.submit')}
        onPress={() => void submit()}
        loading={busy}
        testID="forgot-password-submit"
      />
      <TextLink
        label={t('auth.forgotPassword.backToSignIn')}
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/sign-in'))}
      />
    </Screen>
  );
}
