import { PAYMENT_METHODS, type PaymentMethod } from '@budget/core';
import { useTranslation } from 'react-i18next';

import { ChipGroup, ToggleChip } from '@/components';
import { OnboardingScreen, goToNextStep } from '@/features/onboarding/OnboardingScreen';
import { useOnboarding } from '@/features/onboarding/OnboardingProvider';

export default function PaymentStep() {
  const { t } = useTranslation();
  const { draft, update } = useOnboarding();
  const toggle = (method: PaymentMethod) =>
    update((current) => ({
      paymentMethods: current.paymentMethods.includes(method)
        ? current.paymentMethods.filter((m) => m !== method)
        : PAYMENT_METHODS.filter((m) => m === method || current.paymentMethods.includes(m)),
    }));

  return (
    <OnboardingScreen
      step="payment"
      title={t('onboarding.payment.title')}
      message={t('onboarding.payment.message')}
      onContinue={() => goToNextStep('payment')}
      onSkip={() => goToNextStep('payment')}
    >
      <ChipGroup accessibilityLabel={t('onboarding.payment.title')}>
        {PAYMENT_METHODS.map((method) => (
          <ToggleChip
            key={method}
            label={t(`paymentMethods.${method}`)}
            selected={draft.paymentMethods.includes(method)}
            onToggle={() => toggle(method)}
            testID={`onboarding-payment-${method}`}
          />
        ))}
      </ChipGroup>
    </OnboardingScreen>
  );
}
