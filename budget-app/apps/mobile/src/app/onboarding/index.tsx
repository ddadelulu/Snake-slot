import { Redirect } from 'expo-router';

import { ONBOARDING_STEPS } from '@/features/onboarding/draft';
import { stepPath } from '@/features/onboarding/OnboardingScreen';
import { useOnboarding } from '@/features/onboarding/OnboardingProvider';

/** Resumes the questionnaire at the furthest step reached (the first step on a fresh start). */
export default function OnboardingStart() {
  const { draft } = useOnboarding();
  const step = ONBOARDING_STEPS[draft.reached] ?? 'income';
  return <Redirect href={stepPath(step)} />;
}
