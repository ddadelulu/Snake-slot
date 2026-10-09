import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, View } from 'react-native';

import {
  AlertBanner,
  AppText,
  Card,
  Divider,
  EmptyState,
  Screen,
  ScreenHeader,
  TextLink,
} from '@/components';
import { useAlerts, useDismissAlert, useMarkAlertsRead, type AlertItem } from '@/data/alerts';
import { useProfile } from '@/data/profile';
import { alertTarget } from '@/features/alerts/target';
import { useLanguage } from '@/i18n';
import { formatShortDate } from '@/i18n/format';
import { goBackOr } from '@/lib/navigation';
import { makeStyles, useTheme } from '@/theme';

const useStyles = makeStyles((theme) => ({
  section: { gap: theme.spacing.sm },
  loading: { paddingVertical: theme.spacing.xxxl, alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  open: {
    flex: 1,
    minHeight: theme.sizes.rowHeight,
    paddingVertical: theme.spacing.md,
    paddingStart: theme.layout.cardPadding,
    paddingEnd: theme.spacing.xs,
    gap: theme.spacing.xxs,
  },
  pressed: { backgroundColor: theme.colors.surfaceMuted },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  dot: {
    width: theme.spacing.sm,
    height: theme.spacing.sm,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.accent,
  },
  dismiss: {
    minWidth: theme.sizes.minTouchTarget,
    minHeight: theme.sizes.minTouchTarget,
    marginTop: theme.spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radii.md,
  },
}));

/**
 * The alerts inbox (spec section 9): newest first, unread ones marked. Tapping one marks it read
 * and opens what it is about; × removes it from the inbox.
 */
export default function AlertsScreen() {
  const { t } = useTranslation();
  const styles = useStyles();
  const theme = useTheme();
  const alerts = useAlerts();
  const markRead = useMarkAlertsRead();
  const dismiss = useDismissAlert();
  const [failed, setFailed] = useState(false);

  const items = alerts.data?.pages.flatMap((page) => page.items) ?? [];
  const unreadIds = items.filter((item) => !item.read).map((item) => item.id);

  const run = (action: () => Promise<unknown>) => {
    setFailed(false);
    action().catch(() => setFailed(true));
  };

  const open = (alert: AlertItem) => {
    if (!alert.read) run(() => markRead.mutateAsync([alert.id]));
    router.push(alertTarget(alert));
  };

  return (
    <Screen scroll testID="alerts-screen">
      <ScreenHeader
        backLabel={t('alerts.back')}
        onBack={() => goBackOr('/')}
        right={
          unreadIds.length > 0 ? (
            <TextLink
              label={t('alerts.markAllRead')}
              onPress={() => run(() => markRead.mutateAsync(unreadIds))}
              testID="alerts-mark-all"
            />
          ) : undefined
        }
      />
      <AppText variant="title" accessibilityRole="header">
        {t('alerts.title')}
      </AppText>
      {failed ? (
        <AlertBanner tone="danger" message={t('alerts.actionError')} testID="alerts-error" />
      ) : null}

      {alerts.isPending ? (
        <View style={styles.loading}>
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      ) : alerts.isError ? (
        <EmptyState
          title={t('alerts.loadError')}
          message={t('transactions.loadErrorMessage')}
          actionLabel={t('transactions.retry')}
          onAction={() => void alerts.refetch()}
          testID="alerts-load-error"
        />
      ) : items.length === 0 ? (
        <EmptyState
          title={t('alerts.emptyTitle')}
          message={t('alerts.emptyMessage')}
          testID="alerts-empty"
        />
      ) : (
        <View style={styles.section}>
          <Card padded={false}>
            {items.map((alert, index) => (
              <View key={alert.id}>
                {index > 0 ? <Divider inset /> : null}
                <AlertRow
                  alert={alert}
                  onOpen={() => open(alert)}
                  onDismiss={() => run(() => dismiss.mutateAsync(alert.id))}
                  testID={`alerts-item-${index}`}
                />
              </View>
            ))}
          </Card>
          {alerts.hasNextPage ? (
            <TextLink
              label={t('alerts.loadMore')}
              onPress={() => void alerts.fetchNextPage()}
              testID="alerts-load-more"
            />
          ) : null}
        </View>
      )}

      <TextLink
        label={t('alerts.settings')}
        onPress={() => router.push('/notifications')}
        testID="alerts-settings"
      />
    </Screen>
  );
}

function AlertRow({
  alert,
  onOpen,
  onDismiss,
  testID,
}: {
  alert: AlertItem;
  onOpen: () => void;
  onDismiss: () => void;
  testID: string;
}) {
  const { t } = useTranslation();
  const styles = useStyles();
  const { language } = useLanguage();
  const { data: profile } = useProfile();
  const date = formatShortDate(alert.createdAt, language, profile?.timezone ?? 'Europe/Zurich');
  const spoken = [alert.read ? null : t('alerts.unread'), alert.title, alert.body, date]
    .filter(Boolean)
    .join('. ');

  return (
    <View style={styles.row}>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={spoken}
        accessibilityHint={t('alerts.openHint')}
        style={({ pressed }) => [styles.open, pressed && styles.pressed]}
        testID={testID}
      >
        <View style={styles.titleRow}>
          {alert.read ? null : <View style={styles.dot} testID={`${testID}-unread`} />}
          <AppText variant={alert.read ? 'body' : 'bodyStrong'}>{alert.title}</AppText>
        </View>
        <AppText tone="secondary">{alert.body}</AppText>
        <AppText variant="caption" tone="secondary">
          {date}
        </AppText>
      </Pressable>
      <Pressable
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel={`${t('alerts.dismiss')}: ${alert.title}`}
        style={({ pressed }) => [styles.dismiss, pressed && styles.pressed]}
        testID={`${testID}-dismiss`}
      >
        <AppText variant="heading" tone="secondary" importantForAccessibility="no">
          ×
        </AppText>
      </Pressable>
    </View>
  );
}
