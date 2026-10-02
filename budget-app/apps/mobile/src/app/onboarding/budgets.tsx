import { DEFAULT_SUGGESTION_STEP_RAPPEN, floorDiv, formatChf, type Rappen } from '@budget/core';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AlertBanner, AmountSlider, AppText, Card, TextLink } from '@/components';
import { allocation, budgetsForStep, categoryId, monthPlan } from '@/features/onboarding/draft';
import { OnboardingScreen, goToNextStep } from '@/features/onboarding/OnboardingScreen';
import { useOnboarding } from '@/features/onboarding/OnboardingProvider';
import { useLanguage } from '@/i18n';
import { makeStyles } from '@/theme';

const useStyles = makeStyles((theme) => ({
  totals: { gap: theme.spacing.xs },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.md },
  sliders: { gap: theme.spacing.xl },
}));

const STEP = DEFAULT_SUGGESTION_STEP_RAPPEN;

/** Slider range: up to what there is to spend (at least one step), never below the current value. */
function sliderMax(spendable: Rappen, current: Rappen): Rappen {
  const roundedUp = floorDiv(Math.max(spendable, 0) + STEP - 1, STEP) * STEP;
  return Math.max(roundedUp, current, STEP);
}

export default function BudgetsStep() {
  const { t } = useTranslation();
  const styles = useStyles();
  const { language } = useLanguage();
  const { draft, update } = useOnboarding();
  const plan = monthPlan(draft);
  const budgets = budgetsForStep(draft);
  const check = allocation(draft);
  const chf = (amount: Rappen) => formatChf(amount, { language });

  return (
    <OnboardingScreen
      step="budgets"
      title={t('onboarding.budgets.title')}
      message={t('onboarding.budgets.message')}
      onContinue={() => goToNextStep('budgets')}
    >
      <Card>
        <View style={styles.totals}>
          <View style={styles.row}>
            <AppText>{t('onboarding.budgets.spendable')}</AppText>
            <AppText variant="bodyStrong" numeric testID="onboarding-spendable">
              {chf(plan.spendableRappen)}
            </AppText>
          </View>
          <View style={styles.row}>
            <AppText>{t('onboarding.budgets.allocated')}</AppText>
            <AppText variant="bodyStrong" numeric testID="onboarding-allocated">
              {chf(check.allocatedRappen)}
            </AppText>
          </View>
        </View>
      </Card>
      {plan.spendableRappen < 0 ? (
        <AlertBanner
          tone="danger"
          message={t('onboarding.budgets.negative', { amount: chf(-plan.spendableRappen) })}
          testID="onboarding-budgets-negative"
        />
      ) : check.status === 'over' ? (
        <AlertBanner
          tone="warning"
          message={t('onboarding.budgets.over', { amount: chf(-check.unallocatedRappen) })}
          testID="onboarding-budgets-over"
        />
      ) : check.status === 'under' ? (
        <AppText tone="secondary" testID="onboarding-budgets-unallocated">
          {t('onboarding.budgets.unallocated', { amount: chf(check.unallocatedRappen) })}
        </AppText>
      ) : null}
      <View style={styles.sliders}>
        {draft.categories.map((choice) => {
          const id = categoryId(choice);
          const name = choice.kind === 'default' ? t(`categories.${choice.key}`) : choice.name;
          const value = budgets[id] ?? 0;
          return (
            <AmountSlider
              key={id}
              label={name}
              valueRappen={value}
              maxRappen={sliderMax(plan.spendableRappen, value)}
              stepRappen={STEP}
              language={language}
              onChange={(amount) =>
                update((current) => ({
                  budgets: { ...budgetsForStep(current), [id]: amount },
                  budgetsAdjusted: true,
                }))
              }
              accessibilityLabel={t('onboarding.budgets.sliderLabel', { name })}
              testID={`onboarding-budget-${id}`}
            />
          );
        })}
      </View>
      {draft.budgetsAdjusted ? (
        <TextLink
          label={t('onboarding.budgets.resetSuggestion')}
          onPress={() => update({ budgets: {}, budgetsAdjusted: false })}
          testID="onboarding-budgets-reset"
        />
      ) : null}
    </OnboardingScreen>
  );
}
