import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AlertBanner, AppText, Card, PrimaryButton, Screen, ScreenHeader } from '@/components';
import { fetchMyData, type MyDataExport } from '@/data/exportData';
import { useProfile } from '@/data/profile';
import { useAuth } from '@/features/auth/AuthProvider';
import { SharingUnavailableError, deliverFile, type Delivery } from '@/features/export/deliverFile';
import { buildExportFile, type ExportKind } from '@/features/export/exportFiles';
import { deviceTimeZone } from '@/i18n/format';
import { goBackOr } from '@/lib/navigation';
import { makeStyles } from '@/theme';

const useStyles = makeStyles((theme) => ({
  card: { gap: theme.spacing.md },
  text: { gap: theme.spacing.xs },
}));

type ExportError = 'load' | 'file' | 'sharing';

type Status =
  | { kind: 'idle' }
  | { kind: 'working'; export: ExportKind }
  | { kind: 'done'; file: string; delivery: Delivery }
  | { kind: 'error'; reason: ExportError };

/**
 * Settings → Export my data (US-3.5, D-034): the transactions as a CSV file that opens in Excel,
 * or everything stored about the person as JSON (revDSG art. 28, GDPR art. 20), which also names
 * the signed-in account (user id and email from the session). Each export reads
 * `export_my_data` once, then shares (phones) or downloads (web) the file.
 */
export default function ExportScreen() {
  const { t } = useTranslation();
  const styles = useStyles();
  const profile = useProfile();
  const { user } = useAuth();
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const working = status.kind === 'working';

  const run = async (kind: ExportKind) => {
    setStatus({ kind: 'working', export: kind });
    let data: MyDataExport;
    try {
      data = await fetchMyData();
    } catch {
      setStatus({ kind: 'error', reason: 'load' });
      return;
    }
    try {
      const file = buildExportFile(kind, data, {
        t,
        timeZone: profile.data?.timezone ?? deviceTimeZone(),
        account: user ? { userId: user.id, email: user.email ?? null } : null,
      });
      const delivery = await deliverFile(file);
      setStatus({ kind: 'done', file: file.name, delivery });
    } catch (error) {
      setStatus({
        kind: 'error',
        reason: error instanceof SharingUnavailableError ? 'sharing' : 'file',
      });
    }
  };

  const action = (kind: ExportKind) => ({
    onPress: () => void run(kind),
    loading: status.kind === 'working' && status.export === kind,
    disabled: working && !(status.kind === 'working' && status.export === kind),
  });

  return (
    <Screen scroll testID="export-screen">
      <ScreenHeader
        backLabel={t('dataExport.back')}
        onBack={() => goBackOr('/settings')}
        testID="export-header"
      />
      <AppText variant="title" accessibilityRole="header">
        {t('dataExport.title')}
      </AppText>
      <AppText tone="secondary">{t('dataExport.message')}</AppText>
      <AppText variant="bodyStrong" testID="export-privacy">
        {t('dataExport.privacy')}
      </AppText>

      {status.kind === 'working' ? (
        <AppText tone="secondary" accessibilityLiveRegion="polite" testID="export-working">
          {t('dataExport.working')}
        </AppText>
      ) : null}
      {status.kind === 'done' ? (
        <AlertBanner
          tone="info"
          message={t(status.delivery === 'shared' ? 'dataExport.shared' : 'dataExport.downloaded', {
            file: status.file,
          })}
          testID="export-done"
        />
      ) : null}
      {status.kind === 'error' ? (
        <AlertBanner
          tone="danger"
          message={t(`dataExport.errors.${status.reason}`)}
          testID="export-error"
        />
      ) : null}

      <Card style={styles.card}>
        <View style={styles.text}>
          <AppText variant="heading" accessibilityRole="header">
            {t('dataExport.csvTitle')}
          </AppText>
          <AppText tone="secondary">{t('dataExport.csvMessage')}</AppText>
        </View>
        <PrimaryButton
          label={t('dataExport.csvButton')}
          {...action('transactions')}
          testID="export-csv"
        />
      </Card>

      <Card style={styles.card}>
        <View style={styles.text}>
          <AppText variant="heading" accessibilityRole="header">
            {t('dataExport.jsonTitle')}
          </AppText>
          <AppText tone="secondary">{t('dataExport.jsonMessage')}</AppText>
        </View>
        <PrimaryButton
          label={t('dataExport.jsonButton')}
          variant="secondary"
          {...action('data')}
          testID="export-json"
        />
      </Card>
    </Screen>
  );
}
