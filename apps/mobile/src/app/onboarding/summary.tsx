import { formatChf, lastDayOf, localDateIn, periodContaining, type Rappen } from '@budget/core';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AlertBanner, AppText, Card, Divider } from '@/components';
import { useCompleteOnboarding } from '@/data/onboarding';
import { setAfterOnboarding } from '@/features/onboarding/afterOnboarding';
import {
  IncompleteDraftError,
  budgetsForStep,
  categoryId,
  monthPlan,
  toOnboardingPayload,
  wantsImportAfterSetup,
} from '@/features/onboarding/draft';
import { OnboardingScreen, stepPath } from '@/features/onboarding/OnboardingScreen';
import { useOnboarding } from '@/features/onboarding/OnboardingProvider';
import { useLanguage } from '@/i18n';
import { deviceTimeZone, formatDayMonth } from '@/i18n/format';
import { makeStyles } from '@/theme';

const useStyles = makeStyles((theme) => ({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  label: { flexShrink: 1 },
}));

function Row({
  label,
  amount,
  strong,
  testID,
}: {
  label: string;
  amount: string;
  strong?: boolean;
  testID?: string;
}) {
  const styles = useStyles();
  return (
    <View style={styles.row} accessible accessibilityLabel={`${label}, ${amount}`} testID={testID}>
      <AppText variant={strong ? 'bodyStrong' : 'body'} style={styles.label}>
        {label}
      </AppText>
      <AppText variant={strong ? 'bodyStrong' : 'body'} numeric>
        {amount}
      </AppText>
    </View>
  );
}

/** Spec section 3: the summary "Your month" before the person confirms. */
export default function SummaryStep() {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const { draft, clear } = useOnboarding();
  const complete = useCompleteOnboarding();
  const plan = monthPlan(draft);
  const budgets = budgetsForStep(draft);
  const timezone = deviceTimeZone();
  const chf = (amount: Rappen) => formatChf(amount, { language });
  const period =
    draft.payday !== null
      ? periodContaining(localDateIn(new Date(), timezone), draft.payday)
      : null;

  const confirm = () => {
    let payload;
    try {
      payload = toOnboardingPayload(draft, { language, timezone });
    } catch (error) {
      if (error instanceof IncompleteDraftError) {
        router.replace(stepPath(error.step));
        return;
      }
      throw error;
    }
    // Step 9: the navigator opens the import once it has switched to the tabs.
    setAfterOnboarding(wantsImportAfterSetup(draft) ? '/import?from=onboarding' : null);
    complete.mutate(payload, {
      onSuccess: () => {
        // The navigator switches to the tabs once the refreshed profile says onboarding is done.
        void clear();
      },
      onError: () => setAfterOnboarding(null),
    });
  };

  return (
    <OnboardingScreen
      step="summary"
      title={t('onboarding.summary.title')}
      message={t('onboarding.summary.message')}
      onContinue={confirm}
      continueLabel={t('onboarding.summary.confirm')}
      continueLoading={complete.isPending}
    >
      {period ? (
        <AppText tone="secondary" testID="onboarding-summary-period">
          {t('onboarding.summary.period', {
            start: formatDayMonth(period.startsOn, language),
            end: formatDayMonth(lastDayOf(period), language),
          })}
        </AppText>
      ) : null}
      {complete.isError ? (
        <AlertBanner
          tone="danger"
          message={t('onboarding.summary.failed')}
          testID="onboarding-summary-error"
        />
      ) : null}
      <Card>
        <Row
          label={t('onboarding.summary.income')}
          amount={chf(plan.incomeRappen)}
          testID="summary-income"
        />
        <Row
          label={t('onboarding.summary.fixedCosts')}
          amount={chf(-plan.fixedCostsRappen)}
          testID="summary-fixed"
        />
        <Row
          label={t('onboarding.summary.savings')}
          amount={chf(-plan.savingsRappen)}
          testID="summary-savings"
        />
        <Divider />
        <Row
          label={t('onboarding.summary.spendable')}
          amount={chf(plan.spendableRappen)}
          strong
          testID="summary-spendable"
        />
      </Card>
      <AppText variant="heading" accessibilityRole="header">
        {t('onboarding.summary.budgets')}
      </AppText>
      <Card>
        {draft.categories.map((choice) => {
          const id = categoryId(choice);
          const name = choice.kind === 'default' ? t(`categories.${choice.key}`) : choice.name;
          return (
            <Row
              key={id}
              label={name}
              amount={chf(budgets[id] ?? 0)}
              testID={`summary-budget-${id}`}
            />
          );
        })}
      </Card>
    </OnboardingScreen>
  );
}
