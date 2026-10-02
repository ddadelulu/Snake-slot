import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppText, DayGrid, SwitchRow, TextField } from '@/components';
import { validateIncome } from '@/features/onboarding/draft';
import { OnboardingScreen, goToNextStep } from '@/features/onboarding/OnboardingScreen';
import { useOnboarding } from '@/features/onboarding/OnboardingProvider';
import { makeStyles } from '@/theme';

const useStyles = makeStyles((theme) => ({
  field: { gap: theme.spacing.sm },
}));

export default function IncomeStep() {
  const { t } = useTranslation();
  const styles = useStyles();
  const { draft, update } = useOnboarding();
  const [submitted, setSubmitted] = useState(false);
  const { ok, errors } = validateIncome(draft);
  type ErrorKey =
    | 'onboarding.income.incomeRequired'
    | 'onboarding.amountInvalid'
    | 'onboarding.income.hoursInvalid';
  const show = (code: string | undefined, key: ErrorKey) =>
    submitted && code ? t(key) : undefined;

  return (
    <OnboardingScreen
      step="income"
      title={t('onboarding.income.title')}
      message={t('onboarding.income.message')}
      onContinue={() => {
        setSubmitted(true);
        if (ok) goToNextStep('income');
      }}
    >
      <TextField
        label={t('onboarding.income.netIncome')}
        value={draft.netIncome}
        onChangeText={(netIncome) => update({ netIncome })}
        keyboardType="decimal-pad"
        inputMode="decimal"
        placeholder="CHF"
        error={show(
          errors.netIncome,
          errors.netIncome === 'income_required'
            ? 'onboarding.income.incomeRequired'
            : 'onboarding.amountInvalid',
        )}
        testID="onboarding-net-income"
      />
      <View style={styles.field}>
        <AppText variant="label">{t('onboarding.income.payday')}</AppText>
        <AppText variant="caption" tone="secondary">
          {t('onboarding.income.paydayHint')}
        </AppText>
        <DayGrid
          selected={draft.payday}
          onSelect={(payday) => update({ payday })}
          dayLabel={(day) => t('onboarding.income.paydayLabel', { day })}
          accessibilityLabel={t('onboarding.income.payday')}
          testID="onboarding-payday"
        />
        {submitted && errors.payday ? (
          <AppText variant="caption" tone="danger" accessibilityLiveRegion="polite">
            {t('onboarding.income.paydayRequired')}
          </AppText>
        ) : null}
      </View>
      <SwitchRow
        label={t('onboarding.income.irregular')}
        hint={t('onboarding.income.irregularHint')}
        value={draft.irregularIncome}
        onValueChange={(irregularIncome) => update({ irregularIncome })}
        testID="onboarding-irregular"
      />
      <TextField
        label={t('onboarding.income.hoursPerWeek')}
        value={draft.hoursPerWeek}
        onChangeText={(hoursPerWeek) => update({ hoursPerWeek })}
        keyboardType="decimal-pad"
        inputMode="decimal"
        hint={t('onboarding.income.hoursHint')}
        error={show(errors.hoursPerWeek, 'onboarding.income.hoursInvalid')}
        testID="onboarding-hours"
      />
    </OnboardingScreen>
  );
}
