import { LEFTOVER_POLICIES, parseChf, type LeftoverPolicy, type Profile } from '@budget/core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';

import {
  AlertBanner,
  AmountInput,
  AppText,
  ChoiceList,
  DayGrid,
  EmptyState,
  PrimaryButton,
  Screen,
  ScreenHeader,
  SwitchRow,
  TextField,
} from '@/components';
import { useProfile, useUpdateProfile } from '@/data/profile';
import { optionalAmount, parseWeeklyMinutes } from '@/features/onboarding/draft';
import { rappenToInput } from '@/features/transactions/amount';
import { goBackOr } from '@/lib/navigation';
import { makeStyles, useTheme } from '@/theme';

const useStyles = makeStyles((theme) => ({
  field: { gap: theme.spacing.sm },
  loading: { paddingVertical: theme.spacing.xxxl, alignItems: 'center' },
}));

type Form = {
  netIncome: string;
  payday: number | null;
  irregular: boolean;
  hours: string;
  savings: string;
  leftover: LeftoverPolicy;
};

function hoursText(minutes: number | null): string {
  if (minutes === null) return '';
  return String(Math.round((minutes / 60) * 100) / 100);
}

function toForm(profile: Profile): Form {
  return {
    netIncome: profile.net_income_rappen === null ? '' : rappenToInput(profile.net_income_rappen),
    payday: profile.payday,
    irregular: profile.irregular_income,
    hours: hoursText(profile.weekly_work_minutes),
    savings:
      profile.savings_monthly_rappen === 0 ? '' : rappenToInput(profile.savings_monthly_rappen),
    leftover: profile.leftover_policy,
  };
}

/**
 * Income and month (M4-07): net income, payday, irregular income, hours per week, monthly saving
 * and what happens to money left over. Saved on the profile; the month already running keeps its
 * numbers and the new ones apply from the next payday (docs/API.md "Editors").
 */
export default function ProfileEditorScreen() {
  const { t } = useTranslation();
  const styles = useStyles();
  const theme = useTheme();
  const profile = useProfile();

  return (
    <Screen scroll testID="profile-screen">
      <ScreenHeader backLabel={t('editors.back')} onBack={() => goBackOr('/settings')} />
      <AppText variant="title" accessibilityRole="header">
        {t('editors.profile.title')}
      </AppText>
      {profile.isPending ? (
        <View style={styles.loading}>
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      ) : profile.isError ? (
        <EmptyState
          title={t('editors.loadError')}
          message={t('transactions.loadErrorMessage')}
          actionLabel={t('transactions.retry')}
          onAction={() => void profile.refetch()}
        />
      ) : (
        <ProfileForm initial={toForm(profile.data)} />
      )}
    </Screen>
  );
}

function ProfileForm({ initial }: { initial: Form }) {
  const { t } = useTranslation();
  const styles = useStyles();
  const updateProfile = useUpdateProfile();
  const [form, setForm] = useState(initial);
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<'saved' | 'failed' | null>(null);

  const income = parseChf(form.netIncome.trim());
  const incomeError =
    form.netIncome.trim() === ''
      ? t('onboarding.income.incomeRequired')
      : income === null || income <= 0
        ? t('onboarding.amountInvalid')
        : null;
  const minutes = form.hours.trim() === '' ? null : parseWeeklyMinutes(form.hours);
  const hoursError =
    form.hours.trim() !== '' && minutes === null ? t('onboarding.income.hoursInvalid') : null;
  const savings = optionalAmount(form.savings);
  const savingsError = savings.ok ? null : t('onboarding.amountInvalid');
  const paydayError = form.payday === null ? t('onboarding.income.paydayRequired') : null;

  const change = (patch: Partial<Form>) => {
    setResult(null);
    setForm((current) => ({ ...current, ...patch }));
  };

  const save = async () => {
    setSubmitted(true);
    if (incomeError || hoursError || savingsError || paydayError || income === null) return;
    if (!savings.ok || form.payday === null) return;
    try {
      await updateProfile.mutateAsync({
        net_income_rappen: income,
        payday: form.payday,
        irregular_income: form.irregular,
        weekly_work_minutes: minutes,
        savings_monthly_rappen: savings.value,
        leftover_policy: form.leftover,
      });
      setResult('saved');
    } catch {
      setResult('failed');
    }
  };

  const show = (error: string | null) => (submitted && error ? error : undefined);

  return (
    <>
      <AlertBanner tone="info" message={t('editors.nextMonth')} testID="profile-next-month" />
      <AmountInput
        label={t('onboarding.income.netIncome')}
        currency="CHF"
        value={form.netIncome}
        onChangeText={(netIncome) => change({ netIncome })}
        error={show(incomeError)}
        testID="profile-net-income"
      />
      <View style={styles.field}>
        <AppText variant="label">{t('onboarding.income.payday')}</AppText>
        <AppText variant="caption" tone="secondary">
          {t('onboarding.income.paydayHint')}
        </AppText>
        <DayGrid
          selected={form.payday}
          onSelect={(payday) => change({ payday })}
          dayLabel={(day) => t('onboarding.income.paydayLabel', { day })}
          accessibilityLabel={t('onboarding.income.payday')}
          testID="profile-payday"
        />
        {show(paydayError) ? (
          <AppText variant="caption" tone="danger" accessibilityLiveRegion="polite">
            {paydayError}
          </AppText>
        ) : null}
      </View>
      <SwitchRow
        label={t('onboarding.income.irregular')}
        hint={t('onboarding.income.irregularHint')}
        value={form.irregular}
        onValueChange={(irregular) => change({ irregular })}
        testID="profile-irregular"
      />
      <TextField
        label={t('onboarding.income.hoursPerWeek')}
        value={form.hours}
        onChangeText={(hours) => change({ hours })}
        keyboardType="decimal-pad"
        inputMode="decimal"
        hint={t('onboarding.income.hoursHint')}
        error={show(hoursError)}
        testID="profile-hours"
      />
      <AmountInput
        label={t('editors.profile.savings')}
        currency="CHF"
        value={form.savings}
        onChangeText={(savingsText) => change({ savings: savingsText })}
        error={show(savingsError)}
        testID="profile-savings"
      />
      <View style={styles.field}>
        <AppText variant="label">{t('onboarding.savings.leftoverTitle')}</AppText>
        <ChoiceList<LeftoverPolicy>
          options={LEFTOVER_POLICIES.map((value) => ({
            value,
            label: t(`onboarding.savings.leftover.${value}`),
            description: t(`onboarding.savings.leftover.${value}Hint`),
          }))}
          selected={form.leftover}
          onSelect={(leftover) => change({ leftover })}
          accessibilityLabel={t('onboarding.savings.leftoverTitle')}
          testID="profile-leftover"
        />
      </View>
      {result === 'failed' ? (
        <AlertBanner tone="danger" message={t('editors.saveError')} testID="profile-error" />
      ) : result === 'saved' ? (
        <AlertBanner tone="info" message={t('editors.saved')} testID="profile-saved" />
      ) : null}
      <PrimaryButton
        label={t('editors.save')}
        onPress={() => void save()}
        loading={updateProfile.isPending}
        testID="profile-save"
      />
    </>
  );
}
