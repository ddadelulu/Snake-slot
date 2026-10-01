import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AlertBanner, AppText, PrimaryButton, Screen, TextField, TextLink } from '@/components';
import { useAuthNotice } from '@/features/auth/AuthNotice';
import { useAuth } from '@/features/auth/AuthProvider';
import { signOut, updatePassword, type FieldErrors } from '@/features/auth/authApi';
import type { AuthErrorCode } from '@/features/auth/errors';

/**
 * Reached only after a password reset link signed the person in. The rest of the app stays
 * closed until a new password is saved (or the person signs out).
 */
export default function ResetPasswordScreen() {
  const { t } = useTranslation();
  const { clearPasswordRecovery } = useAuth();
  const { showNotice } = useAuthNotice();
  const [password, setPassword] = useState('');
  const [fields, setFields] = useState<FieldErrors>({});
  const [error, setError] = useState<AuthErrorCode | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    setFields({});
    const result = await updatePassword(password);
    setBusy(false);
    if (result.ok) {
      showNotice('password_updated');
      clearPasswordRecovery();
    } else if (result.kind === 'field') {
      setFields(result.fields);
    } else {
      setError(result.code);
    }
  };

  return (
    <Screen title={t('auth.resetPassword.title')} scroll testID="reset-password-screen">
      <AppText tone="secondary">{t('auth.resetPassword.message')}</AppText>
      {error ? <AlertBanner tone="danger" message={t(`auth.errors.${error}`)} /> : null}
      <TextField
        label={t('auth.newPassword')}
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
        returnKeyType="done"
        onSubmitEditing={() => void submit()}
        testID="reset-password-input"
      />
      <PrimaryButton
        label={t('auth.resetPassword.submit')}
        onPress={() => void submit()}
        loading={busy}
        testID="reset-password-submit"
      />
      <TextLink label={t('auth.resetPassword.cancel')} onPress={() => void signOut()} />
    </Screen>
  );
}
