import { PAIN_LEVELS, type PainLevel } from '@budget/core';
import { useTranslation } from 'react-i18next';

import { ChoiceList } from '@/components';
import { OnboardingScreen, goToNextStep } from '@/features/onboarding/OnboardingScreen';
import { useOnboarding } from '@/features/onboarding/OnboardingProvider';

export default function PainStep() {
  const { t } = useTranslation();
  const { draft, update } = useOnboarding();
  return (
    <OnboardingScreen
      step="pain"
      title={t('onboarding.pain.title')}
      message={t('onboarding.pain.message')}
      onContinue={() => goToNextStep('pain')}
    >
      <ChoiceList<PainLevel>
        options={PAIN_LEVELS.map((value) => ({
          value,
          label: t(`onboarding.pain.${value}`),
          description: t(`onboarding.pain.${value}Hint`),
        }))}
        selected={draft.painLevel}
        onSelect={(painLevel) => update({ painLevel })}
        accessibilityLabel={t('onboarding.pain.title')}
        testID="onboarding-pain-levels"
      />
    </OnboardingScreen>
  );
}
