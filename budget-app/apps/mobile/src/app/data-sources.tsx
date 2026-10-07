import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, View } from 'react-native';

import {
  AlertBanner,
  AppText,
  BottomSheet,
  Card,
  EmptyState,
  PrimaryButton,
  Screen,
  ScreenHeader,
} from '@/components';
import { useImports, useRemoveImport, type StatementImport } from '@/data/imports';
import { useProfile } from '@/data/profile';
import { formatInstantDate } from '@/features/imports/format';
import { sourceKey } from '@/features/imports/model';
import { useLanguage } from '@/i18n';
import { deviceTimeZone } from '@/i18n/format';
import { goBackOr } from '@/lib/navigation';
import { RequestError } from '@/lib/requestError';
import { makeStyles, useTheme } from '@/theme';

const useStyles = makeStyles((theme) => ({
  section: { gap: theme.spacing.md },
  card: { gap: theme.spacing.xs },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.md },
  cardText: { flex: 1, gap: theme.spacing.xxs },
  remove: {
    minHeight: theme.sizes.minTouchTarget,
    minWidth: theme.sizes.minTouchTarget,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  pressed: { opacity: theme.opacity.pressed },
  loading: { paddingVertical: theme.spacing.xl, alignItems: 'center' },
  sheet: { gap: theme.spacing.md },
}));

type Removed = { name: string; count: number };

/**
 * Settings → Data sources (US-3.2): the statement files imported so far, each with its counts
 * and a way to undo it, and the way to import another one. Purchases typed in with "+" need no
 * source. Only the sources that exist today are shown.
 */
export default function DataSourcesScreen() {
  const { t } = useTranslation();
  const styles = useStyles();
  const theme = useTheme();
  const { language } = useLanguage();
  const profile = useProfile();
  const timeZone = profile.data?.timezone ?? deviceTimeZone();
  const imports = useImports();
  const remove = useRemoveImport();
  // What the sheet is about; kept while the sheet slides out so its text stays complete.
  const [target, setTarget] = useState<StatementImport | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [removed, setRemoved] = useState<Removed | null>(null);

  const source = (item: StatementImport) => t(sourceKey(item.bank, item.format));

  const openSheet = (item: StatementImport) => {
    remove.reset();
    setSheetOpen(true);
    setTarget(item);
  };

  const confirmRemove = () => {
    if (!target) return;
    const item = target;
    remove.mutate(item.id, {
      onSuccess: (count) => {
        setSheetOpen(false);
        setRemoved({ name: item.fileName, count });
      },
    });
  };

  const removeFailed =
    remove.error instanceof RequestError && remove.error.reason === 'import_not_found'
      ? t('dataSources.sheet.notFound')
      : t('dataSources.sheet.failed');

  return (
    <Screen scroll testID="data-sources-screen">
      <ScreenHeader
        backLabel={t('dataSources.back')}
        onBack={() => goBackOr('/settings')}
        testID="data-sources-header"
      />
      <AppText variant="title" accessibilityRole="header">
        {t('dataSources.title')}
      </AppText>
      {removed ? (
        <AlertBanner
          tone="info"
          message={t('dataSources.removedNotice', { count: removed.count, name: removed.name })}
          onDismiss={() => setRemoved(null)}
          dismissLabel={t('common.dismiss')}
          testID="data-sources-removed"
        />
      ) : null}

      <View style={styles.section}>
        <AppText variant="heading" accessibilityRole="header">
          {t('dataSources.importsTitle')}
        </AppText>
        <AppText tone="secondary">{t('dataSources.importsMessage')}</AppText>
        <PrimaryButton
          label={t('dataSources.importButton')}
          onPress={() => router.push('/import')}
          testID="data-sources-new-import"
        />
        {imports.isPending ? (
          <View
            style={styles.loading}
            accessible
            accessibilityLabel={t('dataSources.loading')}
            testID="data-sources-loading"
          >
            <ActivityIndicator color={theme.colors.accent} />
          </View>
        ) : imports.isError ? (
          <AlertBanner
            tone="danger"
            message={t('dataSources.loadError')}
            actionLabel={t('common.retry')}
            onAction={() => void imports.refetch()}
            testID="data-sources-error"
          />
        ) : imports.data.length === 0 ? (
          <EmptyState
            title={t('dataSources.emptyTitle')}
            message={t('dataSources.emptyMessage')}
            testID="data-sources-empty"
          />
        ) : (
          imports.data.map((item) => (
            <Card key={item.id} style={styles.card} testID={`data-sources-import-${item.id}`}>
              <View style={styles.cardTop}>
                <View style={styles.cardText}>
                  <AppText variant="bodyStrong" numberOfLines={2}>
                    {item.fileName}
                  </AppText>
                  <AppText variant="caption" tone="secondary">
                    {`${source(item)} · ${t('dataSources.importedOn', {
                      date: formatInstantDate(item.importedAt, language, timeZone),
                    })}`}
                  </AppText>
                </View>
                {item.removed ? null : (
                  <Pressable
                    onPress={() => openSheet(item)}
                    accessibilityRole="button"
                    accessibilityLabel={t('dataSources.removeLabel', { name: item.fileName })}
                    style={({ pressed }) => [styles.remove, pressed && styles.pressed]}
                    testID={`data-sources-remove-${item.id}`}
                  >
                    <AppText variant="bodyStrong" tone="danger">
                      {t('dataSources.remove')}
                    </AppText>
                  </Pressable>
                )}
              </View>
              <AppText testID={`data-sources-import-${item.id}-state`}>
                {item.removed
                  ? t('dataSources.removed')
                  : t('dataSources.counts', { added: item.added, merged: item.merged })}
              </AppText>
            </Card>
          ))
        )}
      </View>

      <AppText tone="secondary" testID="data-sources-by-hand">
        {t('dataSources.byHand')}
      </AppText>

      <BottomSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={t('dataSources.sheet.title')}
        closeLabel={t('common.close')}
        testID="data-sources-remove-sheet"
      >
        <View style={styles.sheet}>
          <AppText>{t('dataSources.sheet.message', { name: target?.fileName ?? '' })}</AppText>
          {remove.isError ? (
            <AlertBanner tone="danger" message={removeFailed} testID="data-sources-remove-error" />
          ) : null}
          <PrimaryButton
            label={t('dataSources.sheet.confirm')}
            onPress={confirmRemove}
            variant="destructive"
            loading={remove.isPending}
            testID="data-sources-remove-confirm"
          />
          <PrimaryButton
            label={t('dataSources.sheet.cancel')}
            onPress={() => setSheetOpen(false)}
            variant="secondary"
            testID="data-sources-remove-cancel"
          />
        </View>
      </BottomSheet>
    </Screen>
  );
}
