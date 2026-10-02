import { Pressable, View, type AccessibilityActionEvent } from 'react-native';

import { makeStyles } from '@/theme';

import { AppText } from './AppText';

export type StepperProps = {
  label: string;
  /** The value as shown, formatted by the caller, e.g. "22:00" or "3". */
  valueText: string;
  onDecrement: () => void;
  onIncrement: () => void;
  /** Translated, e.g. "Earlier" / "Fewer". */
  decrementLabel: string;
  /** Translated, e.g. "Later" / "More". */
  incrementLabel: string;
  /** False at the lower limit (default true). */
  canDecrement?: boolean;
  /** False at the upper limit (default true). */
  canIncrement?: boolean;
  /**
   * On the container; the value (the adjustable element) gets `${testID}-value`, the buttons
   * `${testID}-decrement` and `${testID}-increment`.
   */
  testID?: string;
};

const useStyles = makeStyles((theme) => ({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: theme.spacing.md,
    rowGap: theme.spacing.sm,
  },
  label: { flexGrow: 1, flexShrink: 1 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  value: {
    minWidth: theme.sizes.stepperValueMinWidth,
    minHeight: theme.sizes.minTouchTarget,
    justifyContent: 'center',
  },
  button: {
    minWidth: theme.sizes.stepperButton,
    minHeight: theme.sizes.stepperButton,
    borderRadius: theme.radii.pill,
    borderWidth: theme.borderWidths.thin,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: { backgroundColor: theme.colors.surfaceMuted },
  buttonDisabled: {
    borderColor: theme.colors.surfaceMuted,
    backgroundColor: theme.colors.surfaceMuted,
  },
  glyphDisabled: { color: theme.colors.textDisabled },
}));

type StepButtonProps = {
  glyph: string;
  label: string;
  onPress: () => void;
  enabled: boolean;
  testID?: string;
};

function StepButton({ glyph, label, onPress, enabled, testID }: StepButtonProps) {
  const styles = useStyles();
  return (
    <Pressable
      onPress={onPress}
      disabled={!enabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !enabled }}
      testID={testID}
      style={({ pressed }) => [
        styles.button,
        pressed && styles.buttonPressed,
        !enabled && styles.buttonDisabled,
      ]}
    >
      <AppText variant="heading" tone="accent" style={!enabled && styles.glyphDisabled}>
        {glyph}
      </AppText>
    </Pressable>
  );
}

/**
 * A value changed one step at a time with minus and plus buttons, e.g. quiet hours or alerts per
 * day. Screen readers get one adjustable element (swipe up or down) plus the two buttons.
 */
export function Stepper({
  label,
  valueText,
  onDecrement,
  onIncrement,
  decrementLabel,
  incrementLabel,
  canDecrement = true,
  canIncrement = true,
  testID,
}: StepperProps) {
  const styles = useStyles();
  const subId = (suffix: string) => (testID === undefined ? undefined : `${testID}-${suffix}`);

  const actions = [
    ...(canIncrement ? [{ name: 'increment', label: incrementLabel }] : []),
    ...(canDecrement ? [{ name: 'decrement', label: decrementLabel }] : []),
  ];
  const onAccessibilityAction = (event: AccessibilityActionEvent) => {
    const { actionName } = event.nativeEvent;
    if (actionName === 'increment' && canIncrement) onIncrement();
    if (actionName === 'decrement' && canDecrement) onDecrement();
  };

  return (
    <View testID={testID} style={styles.container}>
      {/* The adjustable value carries the label, so the visible one is not read twice. */}
      <AppText
        style={styles.label}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {label}
      </AppText>
      <View style={styles.controls}>
        <StepButton
          glyph="−"
          label={decrementLabel}
          onPress={onDecrement}
          enabled={canDecrement}
          testID={subId('decrement')}
        />
        <View
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={label}
          accessibilityValue={{ text: valueText }}
          accessibilityActions={actions}
          onAccessibilityAction={onAccessibilityAction}
          testID={subId('value')}
          style={styles.value}
        >
          <AppText variant="bodyStrong" numeric align="center">
            {valueText}
          </AppText>
        </View>
        <StepButton
          glyph="+"
          label={incrementLabel}
          onPress={onIncrement}
          enabled={canIncrement}
          testID={subId('increment')}
        />
      </View>
    </View>
  );
}
