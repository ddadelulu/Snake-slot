import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Linking, View } from 'react-native';

import {
  AlertBanner,
  AppText,
  Card,
  ChoiceChips,
  Divider,
  EmptyState,
  PrimaryButton,
  Screen,
  ScreenHeader,
  Stepper,
  SwitchRow,
} from '@/components';
import {
  ALERT_TOGGLES,
  REMINDER_TOGGLES,
  WEEKDAYS,
  clockText,
  useNotificationSettings,
  useUpdateNotificationSettings,
  type NotificationSettings,
  type Weekday,
} from '@/data/notificationSettings';
import { MAX_ALERTS_PER_DAY, QUIET_HOURS_STEP_MINUTES } from '@/features/onboarding/draft';
import { enablePush, getPushStatus, type PushStatus } from '@/features/notifications/push';
import { goBackOr } from '@/lib/navigation';
import { makeStyles, useTheme } from '@/theme';

const useStyles = makeStyles((theme) => ({
  section: { gap: theme.spacing.sm },
  loading: { paddingVertical: theme.spacing.xxxl, alignItems: 'center' },
  inset: { padding: theme.layout.cardPadding, gap: theme.spacing.md },
}));

const DAY_MINUTES = 24 * 60;
const shift = (minutes: number, by: number) =>
  (((minutes + by) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;

/**
 * Notification settings (spec section 9, M4-04, M4-09): this phone's permission, a switch per
 * alert type, the three reminders, quiet hours and the daily cap. Every change is saved at once.
 * Turning anything on asks for the system permission the first time (D-026).
 */
export default function NotificationSettingsScreen() {
  const { t } = useTranslation();
  const styles = useStyles();
  const theme = useTheme();
  const settings = useNotificationSettings();
  const update = useUpdateNotificationSettings();
  const [failed, setFailed] = useState(false);
  const [push, setPush] = useState<PushStatus | null>(null);
  const [pushFailed, setPushFailed] = useState(false);

  useEffect(() => {
    let active = true;
    getPushStatus()
      .then((status) => {
        if (active) setPush(status);
      })
      .catch(() => {
        if (active) setPush('undetermined');
      });
    return () => {
      active = false;
    };
  }, []);

  const turnOnPush = useCallback(async () => {
    setPushFailed(false);
    try {
      setPush(await enablePush());
    } catch {
      setPushFailed(true);
    }
  }, []);

  const save = (change: Partial<NotificationSettings>, turnsOn = false) => {
    setFailed(false);
    update.mutate(change, { onError: () => setFailed(true) });
    // The first switch turned on is when the permission is worth asking for.
    if (turnsOn && (push === 'undetermined' || push === 'denied')) void turnOnPush();
  };

  const header = (
    <>
      <ScreenHeader
        backLabel={t('notificationSettings.back')}
        onBack={() => goBackOr('/settings')}
      />
      <AppText variant="title" accessibilityRole="header">
        {t('notificationSettings.title')}
      </AppText>
    </>
  );

  if (settings.isPending || settings.isError) {
    return (
      <Screen scroll testID="notifications-screen">
        {header}
        {settings.isPending ? (
          <View style={styles.loading}>
            <ActivityIndicator color={theme.colors.accent} />
          </View>
        ) : (
          <EmptyState
            title={t('notificationSettings.loadError')}
            message={t('transactions.loadErrorMessage')}
            actionLabel={t('transactions.retry')}
            onAction={() => void settings.refetch()}
            testID="notifications-load-error"
          />
        )}
      </Screen>
    );
  }

  const s = settings.data;

  return (
    <Screen scroll testID="notifications-screen">
      {header}
      {failed ? (
        <AlertBanner
          tone="danger"
          message={t('notificationSettings.saveError')}
          testID="notifications-error"
        />
      ) : null}

      <View style={styles.section}>
        <AppText variant="heading" accessibilityRole="header">
          {t('notificationSettings.deviceTitle')}
        </AppText>
        <Card style={styles.inset}>
          <AppText testID="notifications-device-status">
            {push === 'unsupported'
              ? t('notificationSettings.deviceWeb')
              : push === 'granted'
                ? t('notificationSettings.deviceOn')
                : push === 'blocked'
                  ? t('notificationSettings.deviceBlocked')
                  : t('notificationSettings.deviceOff')}
          </AppText>
          {pushFailed ? (
            <AlertBanner
              tone="danger"
              message={t('notificationSettings.registerError')}
              testID="notifications-register-error"
            />
          ) : null}
          {push === 'undetermined' || push === 'denied' ? (
            <PrimaryButton
              label={t('notificationSettings.allow')}
              onPress={() => void turnOnPush()}
              testID="notifications-allow"
            />
          ) : push === 'blocked' ? (
            <PrimaryButton
              variant="secondary"
              label={t('notificationSettings.openSettings')}
              onPress={() => void Linking.openSettings()}
              testID="notifications-open-settings"
            />
          ) : null}
        </Card>
      </View>

      <View style={styles.section}>
        <AppText variant="heading" accessibilityRole="header">
          {t('notificationSettings.alertsTitle')}
        </AppText>
        <Card padded={false}>
          {ALERT_TOGGLES.map((type, index) => (
            <View key={type}>
              {index > 0 ? <Divider inset /> : null}
              <SwitchRow
                label={t(`onboarding.notifications.types.${type}`)}
                value={s[type]}
                onValueChange={(value) => save({ [type]: value }, value)}
                testID={`notifications-${type}`}
              />
            </View>
          ))}
        </Card>
      </View>

      <View style={styles.section}>
        <AppText variant="heading" accessibilityRole="header">
          {t('notificationSettings.remindersTitle')}
        </AppText>
        <Card padded={false}>
          {REMINDER_TOGGLES.map((type, index) => (
            <View key={type}>
              {index > 0 ? <Divider inset /> : null}
              <SwitchRow
                label={t(`notificationSettings.reminders.${type}`)}
                value={s[type]}
                onValueChange={(value) => save({ [type]: value }, value)}
                testID={`notifications-${type}`}
              />
              {type === 'weekly_review' && s.weekly_review ? (
                <View style={styles.inset}>
                  <AppText variant="label">{t('notificationSettings.weeklyDay')}</AppText>
                  <ChoiceChips<`${Weekday}`>
                    options={WEEKDAYS.map((day) => ({
                      value: `${day}`,
                      label: t(`notificationSettings.weekdays.${day}`),
                      testID: `notifications-weekly-day-${day}`,
                    }))}
                    selected={`${s.weeklyReviewDay}`}
                    onSelect={(day) => save({ weeklyReviewDay: Number(day) as Weekday })}
                    accessibilityLabel={t('notificationSettings.weeklyDay')}
                    testID="notifications-weekly-day"
                  />
                  <Stepper
                    label={t('notificationSettings.weeklyTime')}
                    valueText={clockText(s.weeklyReviewMinutes)}
                    onDecrement={() =>
                      save({
                        weeklyReviewMinutes: shift(
                          s.weeklyReviewMinutes,
                          -QUIET_HOURS_STEP_MINUTES,
                        ),
                      })
                    }
                    onIncrement={() =>
                      save({
                        weeklyReviewMinutes: shift(s.weeklyReviewMinutes, QUIET_HOURS_STEP_MINUTES),
                      })
                    }
                    decrementLabel={`${t('notificationSettings.weeklyTime')}: ${t('onboarding.notifications.earlier')}`}
                    incrementLabel={`${t('notificationSettings.weeklyTime')}: ${t('onboarding.notifications.later')}`}
                    testID="notifications-weekly-time"
                  />
                </View>
              ) : null}
            </View>
          ))}
        </Card>
      </View>

      <View style={styles.section}>
        <AppText variant="heading" accessibilityRole="header">
          {t('notificationSettings.limitsTitle')}
        </AppText>
        <SwitchRow
          label={t('onboarding.notifications.quietHours')}
          hint={
            s.quietHoursEnabled
              ? t('onboarding.notifications.quietHoursHint', {
                  start: clockText(s.quietStartMinutes),
                  end: clockText(s.quietEndMinutes),
                })
              : undefined
          }
          value={s.quietHoursEnabled}
          onValueChange={(quietHoursEnabled) => save({ quietHoursEnabled })}
          testID="notifications-quiet-hours"
        />
        {s.quietHoursEnabled ? (
          <>
            <Stepper
              label={t('onboarding.notifications.quietStart')}
              valueText={clockText(s.quietStartMinutes)}
              onDecrement={() =>
                save({ quietStartMinutes: shift(s.quietStartMinutes, -QUIET_HOURS_STEP_MINUTES) })
              }
              onIncrement={() =>
                save({ quietStartMinutes: shift(s.quietStartMinutes, QUIET_HOURS_STEP_MINUTES) })
              }
              decrementLabel={`${t('onboarding.notifications.quietStart')}: ${t('onboarding.notifications.earlier')}`}
              incrementLabel={`${t('onboarding.notifications.quietStart')}: ${t('onboarding.notifications.later')}`}
              testID="notifications-quiet-start"
            />
            <Stepper
              label={t('onboarding.notifications.quietEnd')}
              valueText={clockText(s.quietEndMinutes)}
              onDecrement={() =>
                save({ quietEndMinutes: shift(s.quietEndMinutes, -QUIET_HOURS_STEP_MINUTES) })
              }
              onIncrement={() =>
                save({ quietEndMinutes: shift(s.quietEndMinutes, QUIET_HOURS_STEP_MINUTES) })
              }
              decrementLabel={`${t('onboarding.notifications.quietEnd')}: ${t('onboarding.notifications.earlier')}`}
              incrementLabel={`${t('onboarding.notifications.quietEnd')}: ${t('onboarding.notifications.later')}`}
              testID="notifications-quiet-end"
            />
          </>
        ) : null}
        <Stepper
          label={t('onboarding.notifications.alertsPerDay')}
          valueText={String(s.maxPerDay)}
          onDecrement={() => save({ maxPerDay: Math.max(MAX_ALERTS_PER_DAY.min, s.maxPerDay - 1) })}
          onIncrement={() => save({ maxPerDay: Math.min(MAX_ALERTS_PER_DAY.max, s.maxPerDay + 1) })}
          canDecrement={s.maxPerDay > MAX_ALERTS_PER_DAY.min}
          canIncrement={s.maxPerDay < MAX_ALERTS_PER_DAY.max}
          decrementLabel={t('onboarding.notifications.fewer')}
          incrementLabel={t('onboarding.notifications.more')}
          testID="notifications-max-per-day"
        />
      </View>
    </Screen>
  );
}
