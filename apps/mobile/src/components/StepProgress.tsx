import { View } from 'react-native';

import { makeStyles } from '@/theme';

import { AppText } from './AppText';

export type StepProgressProps = {
  /** The step on screen, counted from 1. */
  current: number;
  total: number;
  /** Translated, e.g. "Step 3 of 9" / "Schritt 3 von 9". */
  label: string;
  testID?: string;
};

const useStyles = makeStyles((theme) => ({
  container: { gap: theme.spacing.xs },
  track: {
    height: theme.sizes.stepProgressHeight,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.progressTrack,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: theme.radii.pill, backgroundColor: theme.colors.accent },
}));

/**
 * Where the person is in a multi-step flow such as the onboarding questionnaire. Uses the accent,
 * not the budget status colours, because it says nothing about money.
 */
export function StepProgress({ current, total, label, testID }: StepProgressProps) {
  const styles = useStyles();
  if (
    !Number.isSafeInteger(current) ||
    !Number.isSafeInteger(total) ||
    current < 1 ||
    current > total
  ) {
    throw new RangeError(
      `StepProgress needs whole numbers with 1 ≤ current ≤ total, got ${current} of ${total}`,
    );
  }

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 1, max: total, now: current, text: label }}
      style={styles.container}
    >
      {/* Read once, as the value; hidden here so screen readers do not repeat it as the name. */}
      <AppText
        variant="caption"
        tone="secondary"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {label}
      </AppText>
      <View testID={testID === undefined ? undefined : `${testID}-track`} style={styles.track}>
        <View
          testID={testID === undefined ? undefined : `${testID}-fill`}
          style={[styles.fill, { width: `${(current / total) * 100}%` }]}
        />
      </View>
    </View>
  );
}
