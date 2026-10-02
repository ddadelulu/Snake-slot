import {
  LEFTOVER_POLICIES,
  daysInMonth,
  formatLocalDate,
  localDateIn,
  parseLocalDate,
  type LeftoverPolicy,
} from '@budget/core';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppText, BottomSheet, Card, ChoiceList, SettingsRow, TextField } from '@/components';
import { validateSavings } from '@/features/onboarding/draft';
import { OnboardingScreen, goToNextStep } from '@/features/onboarding/OnboardingScreen';
import { useOnboarding } from '@/features/onboarding/OnboardingProvider';
import { useLanguage } from '@/i18n';
import { deviceTimeZone, formatMonthYear } from '@/i18n/format';
import { makeStyles } from '@/theme';

const useStyles = makeStyles((theme) => ({
  section: { gap: theme.spacing.md },
}));

const GOAL_MONTHS_AHEAD = 36;
const NO_DATE = 'none';

/** The last day of each of the next months, as goal deadlines ("by June"). */
function upcomingMonthEnds(count: number): string[] {
  const { year, month } = parseLocalDate(localDateIn(new Date(), deviceTimeZone()));
  return Array.from({ length: count }, (_, offset) => {
    const index = year * 12 + (month - 1) + offset;
    const y = Math.floor(index / 12);
    const m = (index % 12) + 1;
    return formatLocalDate({ year: y, month: m, day: daysInMonth(y, m) });
  });
}

export default function SavingsStep() {
  const { t } = useTranslation();
  const styles = useStyles();
  const { language } = useLanguage();
  const { draft, update } = useOnboarding();
  const [submitted, setSubmitted] = useState(false);
  const [pickingDate, setPickingDate] = useState(false);
  const { ok, errors } = validateSavings(draft);
  const months = useMemo(() => upcomingMonthEnds(GOAL_MONTHS_AHEAD), []);

  const policyOptions = LEFTOVER_POLICIES.map((value: LeftoverPolicy) => ({
    value,
    label: t(`onboarding.savings.leftover.${value}`),
    description: t(`onboarding.savings.leftover.${value}Hint`),
  }));

  return (
    <OnboardingScreen
      step="savings"
      title={t('onboarding.savings.title')}
      message={t('onboarding.savings.message')}
      onContinue={() => {
        setSubmitted(true);
        if (ok) goToNextStep('savings');
      }}
      onSkip={() => {
        update({ savingsMonthly: '', goalName: '', goalAmount: '', goalDate: null });
        goToNextStep('savings');
      }}
    >
      <TextField
        label={t('onboarding.savings.monthly')}
        value={draft.savingsMonthly}
        onChangeText={(savingsMonthly) => update({ savingsMonthly })}
        keyboardType="decimal-pad"
        inputMode="decimal"
        placeholder="CHF"
        error={submitted && errors.savingsMonthly ? t('onboarding.amountInvalid') : undefined}
        testID="onboarding-savings-monthly"
      />
      <View style={styles.section}>
        <AppText variant="heading" accessibilityRole="header">
          {t('onboarding.savings.goalTitle')}
        </AppText>
        <TextField
          label={t('onboarding.savings.goalName')}
          value={draft.goalName}
          onChangeText={(goalName) => update({ goalName })}
          placeholder={t('onboarding.savings.goalNamePlaceholder')}
          maxLength={80}
          testID="onboarding-goal-name"
        />
        <TextField
          label={t('onboarding.savings.goalAmount')}
          value={draft.goalAmount}
          onChangeText={(goalAmount) => update({ goalAmount })}
          keyboardType="decimal-pad"
          inputMode="decimal"
          placeholder="CHF"
          error={submitted && errors.goalAmount ? t('onboarding.amountInvalid') : undefined}
          testID="onboarding-goal-amount"
        />
        <Card padded={false}>
          <SettingsRow
            label={t('onboarding.savings.goalDate')}
            value={
              draft.goalDate
                ? formatMonthYear(draft.goalDate, language)
                : t('onboarding.savings.goalDateNone')
            }
            onPress={() => setPickingDate(true)}
            testID="onboarding-goal-date"
          />
        </Card>
        {submitted && errors.goal ? (
          <AppText variant="caption" tone="danger" accessibilityLiveRegion="polite">
            {t('onboarding.savings.goalIncomplete')}
          </AppText>
        ) : null}
      </View>
      <View style={styles.section}>
        <AppText variant="heading" accessibilityRole="header">
          {t('onboarding.savings.leftoverTitle')}
        </AppText>
        <ChoiceList<LeftoverPolicy>
          options={policyOptions}
          selected={draft.leftoverPolicy}
          onSelect={(leftoverPolicy) => update({ leftoverPolicy })}
          accessibilityLabel={t('onboarding.savings.leftoverTitle')}
          testID="onboarding-leftover"
        />
      </View>
      <BottomSheet
        visible={pickingDate}
        onClose={() => setPickingDate(false)}
        title={t('onboarding.savings.goalDate')}
        closeLabel={t('common.close')}
      >
        <ChoiceList<string>
          options={[
            { value: NO_DATE, label: t('onboarding.savings.goalDateNone') },
            ...months.map((value) => ({ value, label: formatMonthYear(value, language) })),
          ]}
          selected={draft.goalDate ?? NO_DATE}
          onSelect={(value) => {
            update({ goalDate: value === NO_DATE ? null : value });
            setPickingDate(false);
          }}
          accessibilityLabel={t('onboarding.savings.goalDate')}
          testID="onboarding-goal-months"
        />
      </BottomSheet>
    </OnboardingScreen>
  );
}
