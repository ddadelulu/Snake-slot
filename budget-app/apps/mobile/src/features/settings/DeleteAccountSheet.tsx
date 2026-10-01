import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AlertBanner, AppText, BottomSheet, PrimaryButton } from '@/components';
import { useAuthNotice } from '@/features/auth/AuthNotice';
import { deleteAccount } from '@/features/auth/authApi';
import type { AuthErrorCode } from '@/features/auth/errors';
import { makeStyles } from '@/theme';

const useStyles = makeStyles((theme) => ({
  body: { gap: theme.spacing.lg },
}));

/**
 * Confirms and performs account deletion (spec section 15: full deletion). On success the
 * session ends, the navigator returns to sign-in and a notice confirms the deletion there.
 */
export function DeleteAccountSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const styles = useStyles();
  const queryClient = useQueryClient();
  const { showNotice } = useAuthNotice();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AuthErrorCode | null>(null);

  const close = () => {
    if (busy) return;
    setError(null);
    onClose();
  };

  const confirm = async () => {
    setBusy(true);
    setError(null);
    const result = await deleteAccount(queryClient);
    setBusy(false);
    if (result.ok) {
      showNotice('account_deleted');
      onClose();
    } else {
      setError(result.code);
    }
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={close}
      title={t('settings.deleteSheet.title')}
      closeLabel={t('common.close')}
      testID="delete-account-sheet"
    >
      <View style={styles.body}>
        <AppText>{t('settings.deleteSheet.message')}</AppText>
        {error ? <AlertBanner tone="danger" message={t(`auth.errors.${error}`)} /> : null}
        <PrimaryButton
          variant="destructive"
          label={t('settings.deleteSheet.confirm')}
          onPress={() => void confirm()}
          loading={busy}
          testID="delete-account-confirm"
        />
        <PrimaryButton
          variant="secondary"
          label={t('settings.deleteSheet.cancel')}
          onPress={close}
          disabled={busy}
          testID="delete-account-cancel"
        />
      </View>
    </BottomSheet>
  );
}
