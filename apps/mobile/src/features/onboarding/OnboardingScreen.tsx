import { router } from 'expo-router';
import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppText, PrimaryButton, Screen, StepProgress, TextLink } from '@/components';
import { makeStyles } from '@/theme';

import { ONBOARDING_STEPS, type OnboardingStep } from './draft';
import { useOnboarding } from './OnboardingProvider';

const useStyles = makeStyles((theme) => ({
  header: { gap: theme.spacing.md },
  backRow: { flexDirection: 'row', minHeight: theme.sizes.minTouchTarget },
  intro: { gap: theme.spacing.sm },
}));

export function stepPath(step: OnboardingStep) {
  return `/onboarding/${step}` as const;
}

/** Moves to the next step of the questionnaire. */
export function goToNextStep(step: OnboardingStep) {
  const next = ONBOARDING_STEPS[ONBOARDING_STEPS.indexOf(step) + 1];
  if (next) router.push(stepPath(next));
}

/** Moves to the previous step, also when the step was opened directly (resumed). */
export function goToPreviousStep(step: OnboardingStep) {
  const previous = ONBOARDING_STEPS[ONBOARDING_STEPS.indexOf(step) - 1];
  if (!previous) return;
  if (router.canGoBack()) router.back();
  else router.replace(stepPath(previous));
}

type OnboardingScreenProps = {
  step: OnboardingStep;
  title: string;
  message?: string;
  children: ReactNode;
  onContinue: () => void;
  continueLabel?: string;
  continueLoading?: boolean;
  /** Shown as "Skip" next to Continue on optional steps. */
  onSkip?: () => void;
};

/**
 * The frame of every questionnaire step (spec section 3): back button, progress bar, one topic
 * per screen, and Continue (plus Skip where the step is optional).
 */
export function OnboardingScreen({
  step,
  title,
  message,
  children,
  onContinue,
  continueLabel,
  continueLoading = false,
  onSkip,
}: OnboardingScreenProps) {
  const { t } = useTranslation();
  const styles = useStyles();
  const { markReached } = useOnboarding();
  const index = ONBOARDING_STEPS.indexOf(step);

  useEffect(() => {
    markReached(step);
  }, [markReached, step]);

  return (
    <Screen
      scroll
      testID={`onboarding-${step}`}
      footer={
        <>
          <PrimaryButton
            label={continueLabel ?? t('onboarding.continue')}
            onPress={onContinue}
            loading={continueLoading}
            testID="onboarding-continue"
          />
          {onSkip ? (
            <TextLink label={t('onboarding.skip')} onPress={onSkip} testID="onboarding-skip" />
          ) : null}
        </>
      }
    >
      <View style={styles.header}>
        <View style={styles.backRow}>
          {index > 0 ? (
            <TextLink
              label={t('onboarding.back')}
              onPress={() => goToPreviousStep(step)}
              testID="onboarding-back"
            />
          ) : null}
        </View>
        <StepProgress
          current={index + 1}
          total={ONBOARDING_STEPS.length}
          label={t('onboarding.progress', { current: index + 1, total: ONBOARDING_STEPS.length })}
          testID="onboarding-progress"
        />
      </View>
      <View style={styles.intro}>
        <AppText variant="title" accessibilityRole="header">
          {title}
        </AppText>
        {message ? <AppText tone="secondary">{message}</AppText> : null}
      </View>
      {children}
    </Screen>
  );
}
