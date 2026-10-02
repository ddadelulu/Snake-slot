import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Card, Divider, Stepper, SwitchRow } from '@/components';
import {
  DEFAULT_NOTIFICATIONS,
  MAX_ALERTS_PER_DAY,
  NOTIFICATION_TYPES,
  QUIET_HOURS_STEP_MINUTES,
  formatClockTime,
  type NotificationChoices,
} from '@/features/onboarding/draft';
import { OnboardingScreen, goToNextStep } from '@/features/onboarding/OnboardingScreen';
import { useOnboarding } from '@/features/onboarding/OnboardingProvider';
import { makeStyles } from '@/theme';

const useStyles = makeStyles((theme) => ({
  section: { gap: theme.spacing.md },
}));

const DAY_MINUTES = 24 * 60;
const shift = (minutes: number, by: number) =>
  (((minutes + by) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;

export default function NotificationsStep() {
  const { t } = useTranslation();
  const styles = useStyles();
  const { draft, update } = useOnboarding();
  const n = draft.notifications;
  const set = (change: Partial<NotificationChoices>) =>
    update((current) => ({ notifications: { ...current.notifications, ...change } }));

  return (
    <OnboardingScreen
      step="notifications"
      title={t('onboarding.notifications.title')}
      message={t('onboarding.notifications.message')}
      onContinue={() => goToNextStep('notifications')}
      onSkip={() => {
        update({ notifications: { ...DEFAULT_NOTIFICATIONS } });
        goToNextStep('notifications');
      }}
    >
      <Card padded={false}>
        {NOTIFICATION_TYPES.map((type, index) => (
          <View key={type}>
            {index > 0 ? <Divider inset /> : null}
            <SwitchRow
              label={t(`onboarding.notifications.types.${type}`)}
              value={n[type]}
              onValueChange={(value) => set({ [type]: value })}
              testID={`onboarding-notify-${type}`}
            />
          </View>
        ))}
      </Card>
      <View style={styles.section}>
        <SwitchRow
          label={t('onboarding.notifications.quietHours')}
          hint={
            n.quietHoursEnabled
              ? t('onboarding.notifications.quietHoursHint', {
                  start: formatClockTime(n.quietStartMinutes),
                  end: formatClockTime(n.quietEndMinutes),
                })
              : undefined
          }
          value={n.quietHoursEnabled}
          onValueChange={(quietHoursEnabled) => set({ quietHoursEnabled })}
          testID="onboarding-quiet-hours"
        />
        {n.quietHoursEnabled ? (
          <>
            <Stepper
              label={t('onboarding.notifications.quietStart')}
              valueText={formatClockTime(n.quietStartMinutes)}
              onDecrement={() =>
                set({ quietStartMinutes: shift(n.quietStartMinutes, -QUIET_HOURS_STEP_MINUTES) })
              }
              onIncrement={() =>
                set({ quietStartMinutes: shift(n.quietStartMinutes, QUIET_HOURS_STEP_MINUTES) })
              }
              decrementLabel={`${t('onboarding.notifications.quietStart')}: ${t('onboarding.notifications.earlier')}`}
              incrementLabel={`${t('onboarding.notifications.quietStart')}: ${t('onboarding.notifications.later')}`}
              testID="onboarding-quiet-start"
            />
            <Stepper
              label={t('onboarding.notifications.quietEnd')}
              valueText={formatClockTime(n.quietEndMinutes)}
              onDecrement={() =>
                set({ quietEndMinutes: shift(n.quietEndMinutes, -QUIET_HOURS_STEP_MINUTES) })
              }
              onIncrement={() =>
                set({ quietEndMinutes: shift(n.quietEndMinutes, QUIET_HOURS_STEP_MINUTES) })
              }
              decrementLabel={`${t('onboarding.notifications.quietEnd')}: ${t('onboarding.notifications.earlier')}`}
              incrementLabel={`${t('onboarding.notifications.quietEnd')}: ${t('onboarding.notifications.later')}`}
              testID="onboarding-quiet-end"
            />
          </>
        ) : null}
        <Stepper
          label={t('onboarding.notifications.alertsPerDay')}
          valueText={String(n.maxPerDay)}
          onDecrement={() => set({ maxPerDay: Math.max(MAX_ALERTS_PER_DAY.min, n.maxPerDay - 1) })}
          onIncrement={() => set({ maxPerDay: Math.min(MAX_ALERTS_PER_DAY.max, n.maxPerDay + 1) })}
          canDecrement={n.maxPerDay > MAX_ALERTS_PER_DAY.min}
          canIncrement={n.maxPerDay < MAX_ALERTS_PER_DAY.max}
          decrementLabel={t('onboarding.notifications.fewer')}
          incrementLabel={t('onboarding.notifications.more')}
          testID="onboarding-max-per-day"
        />
      </View>
    </OnboardingScreen>
  );
}
