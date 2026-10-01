import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View, type TextInput } from 'react-native';

import { AlertBanner, AppText, PrimaryButton, Screen, TextField, TextLink } from '@/components';
import { signUpWithEmail, type FieldErrors } from '@/features/auth/authApi';
import type { AuthErrorCode } from '@/features/auth/errors';
import { ProviderButtons } from '@/features/auth/ProviderButtons';
import { useLanguage } from '@/i18n';
import { makeStyles } from '@/theme';

const useStyles = makeStyles((theme) => ({
  header: { gap: theme.spacing.sm, marginTop: theme.spacing.xl },
  form: { gap: theme.spacing.lg },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
}));

export default function SignUpScreen() {
  const { t } = useTranslation();
  const { language } = useLanguage();
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
    const result = await signUpWithEmail({ email, password, language });
    setBusy(false);
    if (result.ok) {
      // 'signed_in': the navigator moves on by itself once the session arrives.
      if (result.status === 'confirm_email') {
        router.replace({ pathname: '/check-email', params: { email: email.trim() } });
      }
      return;
    }
    if (result.kind === 'field') setFields(result.fields);
    else setError(result.code);
  };

  return (
    <Screen scroll testID="sign-up-screen">
      <View style={styles.header}>
        <AppText variant="title" accessibilityRole="header">
          {t('auth.signUp.title')}
        </AppText>
        <AppText tone="secondary">{t('auth.signUp.subtitle')}</AppText>
      </View>
      <View style={styles.form}>
        {error ? (
          <AlertBanner tone="danger" message={t(`auth.errors.${error}`)} testID="sign-up-error" />
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
          testID="sign-up-email"
        />
        <TextField
          ref={passwordRef}
          label={t('auth.password')}
          value={password}
          onChangeText={setPassword}
          hint={t('auth.passwordHint')}
          error={fields.password ? t(`auth.validation.${fields.password}`) : undefined}
          secureTextEntry
          showLabel={t('common.show')}
          hideLabel={t('common.hide')}
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={() => void submit()}
          testID="sign-up-password"
        />
        <PrimaryButton
          label={t('auth.signUp.submit')}
          onPress={() => void submit()}
          loading={busy}
          testID="sign-up-submit"
        />
      </View>
      <ProviderButtons />
      <View style={styles.footer}>
        <AppText tone="secondary">{t('auth.signUp.haveAccount')}</AppText>
        <TextLink
          label={t('auth.signUp.signIn')}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/sign-in'))}
          testID="sign-up-sign-in"
        />
      </View>
    </Screen>
  );
}
