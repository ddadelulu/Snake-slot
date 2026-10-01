import { APP_NAME } from '@budget/core';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View, type TextInput } from 'react-native';

import { AlertBanner, AppText, PrimaryButton, Screen, TextField, TextLink } from '@/components';
import {
  resendSignUpConfirmation,
  signInWithEmail,
  type FieldErrors,
} from '@/features/auth/authApi';
import type { AuthErrorCode } from '@/features/auth/errors';
import { NoticeBanner } from '@/features/auth/NoticeBanner';
import { ProviderButtons } from '@/features/auth/ProviderButtons';
import { makeStyles } from '@/theme';

const useStyles = makeStyles((theme) => ({
  brand: { gap: theme.spacing.xs, marginTop: theme.spacing.xl },
  form: { gap: theme.spacing.lg },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
}));

export default function SignInScreen() {
  const { t } = useTranslation();
  const styles = useStyles();
  const passwordRef = useRef<TextInput>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fields, setFields] = useState<FieldErrors>({});
  const [error, setError] = useState<AuthErrorCode | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    setFields({});
    const result = await signInWithEmail({ email, password });
    setBusy(false);
    if (result.ok) return; // the navigator moves to the tabs once the session arrives
    if (result.kind === 'field') setFields(result.fields);
    else setError(result.code);
  };

  const resendConfirmation = async () => {
    const result = await resendSignUpConfirmation(email);
    if (result.ok) router.push({ pathname: '/check-email', params: { email: email.trim() } });
    else if (result.kind === 'field') setFields(result.fields);
    else setError(result.code);
  };

  return (
    <Screen scroll testID="sign-in-screen">
      <View style={styles.brand}>
        <AppText variant="display">{APP_NAME}</AppText>
        <AppText tone="secondary">{t('auth.tagline')}</AppText>
      </View>
      <NoticeBanner />
      <AppText variant="title" accessibilityRole="header">
        {t('auth.signIn.title')}
      </AppText>
      <View style={styles.form}>
        {error ? (
          <AlertBanner tone="danger" message={t(`auth.errors.${error}`)} testID="sign-in-error" />
        ) : null}
        {error === 'email_not_confirmed' ? (
          <TextLink label={t('auth.checkEmail.resend')} onPress={() => void resendConfirmation()} />
        ) : null}
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
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          testID="sign-in-email"
        />
        <TextField
          ref={passwordRef}
          label={t('auth.password')}
          value={password}
          onChangeText={setPassword}
          error={fields.password ? t(`auth.validation.${fields.password}`) : undefined}
          secureTextEntry
          showLabel={t('common.show')}
          hideLabel={t('common.hide')}
          autoCapitalize="none"
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={() => void submit()}
          testID="sign-in-password"
        />
        <PrimaryButton
          label={t('auth.signIn.submit')}
          onPress={() => void submit()}
          loading={busy}
          testID="sign-in-submit"
        />
        <TextLink
          label={t('auth.signIn.forgotPassword')}
          onPress={() =>
            router.push({ pathname: '/forgot-password', params: { email: email.trim() } })
          }
          testID="sign-in-forgot"
        />
      </View>
      <ProviderButtons />
      <View style={styles.footer}>
        <AppText tone="secondary">{t('auth.signIn.noAccount')}</AppText>
        <TextLink
          label={t('auth.signIn.createAccount')}
          onPress={() => router.push('/sign-up')}
          testID="sign-in-create-account"
        />
      </View>
    </Screen>
  );
}
