import { FIXED_COST_KINDS, formatChf } from '@budget/core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AppText, TextField } from '@/components';
import { monthPlan, optionalAmount, validateFixedCosts } from '@/features/onboarding/draft';
import { OnboardingScreen, goToNextStep } from '@/features/onboarding/OnboardingScreen';
import { useOnboarding } from '@/features/onboarding/OnboardingProvider';
import { useLanguage } from '@/i18n';

export default function FixedCostsStep() {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const { draft, update } = useOnboarding();
  const [submitted, setSubmitted] = useState(false);
  const { ok, errors } = validateFixedCosts(draft);
  const otherAmount = optionalAmount(draft.fixedCosts.other);

  return (
    <OnboardingScreen
      step="fixed-costs"
      title={t('onboarding.fixedCosts.title')}
      message={t('onboarding.fixedCosts.message')}
      onContinue={() => {
        setSubmitted(true);
        if (ok) goToNextStep('fixed-costs');
      }}
    >
      {FIXED_COST_KINDS.map((kind) => (
        <TextField
          key={kind}
          label={t(`fixedCostKinds.${kind}`)}
          value={draft.fixedCosts[kind]}
          onChangeText={(value) =>
            update((current) => ({ fixedCosts: { ...current.fixedCosts, [kind]: value } }))
          }
          keyboardType="decimal-pad"
          inputMode="decimal"
          placeholder="CHF"
          error={submitted && errors[kind] ? t('onboarding.amountInvalid') : undefined}
          testID={`onboarding-fixed-${kind}`}
        />
      ))}
      {otherAmount.ok && otherAmount.value > 0 ? (
        <TextField
          label={t('onboarding.fixedCosts.otherLabel')}
          value={draft.otherFixedCostLabel}
          onChangeText={(otherFixedCostLabel) => update({ otherFixedCostLabel })}
          maxLength={80}
          testID="onboarding-fixed-other-label"
        />
      ) : null}
      <AppText variant="bodyStrong" testID="onboarding-fixed-total">
        {t('onboarding.fixedCosts.total', {
          amount: formatChf(monthPlan(draft).fixedCostsRappen, { language }),
        })}
      </AppText>
    </OnboardingScreen>
  );
}
