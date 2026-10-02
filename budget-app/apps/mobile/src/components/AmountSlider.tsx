import { assertRappen, floorDiv, formatChf, type Language, type Rappen } from '@budget/core';
import Slider from '@react-native-community/slider';
import { View, type AccessibilityActionEvent } from 'react-native';

import { makeStyles, useTheme } from '@/theme';

import { AppText } from './AppText';

export type AmountSliderProps = {
  /** The category name shown above the slider, e.g. "Groceries". */
  label: string;
  /** Shown as-is, even when it is not a multiple of the step. */
  valueRappen: Rappen;
  maxRappen: Rappen;
  /** Size of one slider step, e.g. CHF 10. Every amount the slider reports is a multiple of it. */
  stepRappen: Rappen;
  language: Language;
  onChange: (valueRappen: Rappen) => void;
  /** Translated, e.g. "Budget for Groceries". */
  accessibilityLabel: string;
  /**
   * On the container; the amount text gets `${testID}-amount`, the adjustable element that screen
   * readers use `${testID}-control` and the slider itself `${testID}-slider`.
   */
  testID?: string;
};

const useStyles = makeStyles((theme) => ({
  container: { gap: theme.spacing.xs },
  header: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    columnGap: theme.spacing.md,
    rowGap: theme.spacing.xxs,
  },
  label: { flexShrink: 1 },
  amount: { marginStart: 'auto' },
  slider: { alignSelf: 'stretch', height: theme.sizes.sliderHeight },
}));

/** Clamps a step index to the slider's range. */
const clampIndex = (index: number, maxIndex: number) => Math.min(Math.max(index, 0), maxIndex);

/** Smallest integer ≥ a / b, exact for safe integers (b > 0). */
const ceilDiv = (a: number, b: number) => -floorDiv(-a, b);

/**
 * Sets one category's budget by dragging. The slider works in whole steps (index 0 … max / step),
 * so the amounts it reports are always integer multiples of `stepRappen` within [0, max].
 */
export function AmountSlider({
  label,
  valueRappen,
  maxRappen,
  stepRappen,
  language,
  onChange,
  accessibilityLabel,
  testID,
}: AmountSliderProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  assertRappen(maxRappen, 'maxRappen');
  assertRappen(stepRappen, 'stepRappen');
  if (maxRappen < 0 || stepRappen <= 0) {
    throw new RangeError('AmountSlider needs maxRappen ≥ 0 and stepRappen > 0');
  }

  const maxIndex = floorDiv(maxRappen, stepRappen);
  const index = clampIndex(Math.round(valueRappen / stepRappen), maxIndex);
  const amountText = formatChf(valueRappen, { language });
  const subId = (suffix: string) => (testID === undefined ? undefined : `${testID}-${suffix}`);

  const onSliderChange = (sliderValue: number) => {
    if (!Number.isFinite(sliderValue)) return;
    onChange(clampIndex(Math.round(sliderValue), maxIndex) * stepRappen);
  };

  // One step up or down from the current amount; an amount between steps moves to the next one.
  const onAccessibilityAction = (event: AccessibilityActionEvent) => {
    const { actionName } = event.nativeEvent;
    if (actionName === 'increment') {
      const next = clampIndex(floorDiv(valueRappen, stepRappen) + 1, maxIndex) * stepRappen;
      if (next > valueRappen) onChange(next);
    } else if (actionName === 'decrement') {
      const next = clampIndex(ceilDiv(valueRappen, stepRappen) - 1, maxIndex) * stepRappen;
      if (next < valueRappen) onChange(next);
    }
  };

  return (
    <View testID={testID} style={styles.container}>
      {/* The adjustable element below carries the name and the amount for screen readers. */}
      <View
        style={styles.header}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <AppText variant="bodyStrong" style={styles.label}>
          {label}
        </AppText>
        <AppText
          variant="bodyStrong"
          numeric
          align="right"
          style={styles.amount}
          testID={subId('amount')}
        >
          {amountText}
        </AppText>
      </View>
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={accessibilityLabel}
        accessibilityValue={{ min: 0, max: maxIndex, now: index, text: amountText }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={onAccessibilityAction}
        testID={subId('control')}
      >
        {/* Dragging stays with the slider; screen readers adjust the element around it in steps
            and hear the amount in francs instead of a percentage. */}
        <Slider
          value={index}
          minimumValue={0}
          maximumValue={maxIndex}
          step={1}
          disabled={maxIndex === 0}
          onValueChange={onSliderChange}
          minimumTrackTintColor={colors.accent}
          maximumTrackTintColor={colors.borderStrong}
          thumbTintColor={colors.accent}
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          testID={subId('slider')}
          style={styles.slider}
        />
      </View>
    </View>
  );
}
