import { Pressable, View } from 'react-native';

import { makeStyles } from '@/theme';

import { AppText } from './AppText';

export type ChipChoice<T extends string> = {
  value: T;
  label: string;
  /** Overrides the default `${testID}-${value}`, e.g. to name a category by its key. */
  testID?: string;
};

export type ChoiceChipsProps<T extends string> = {
  options: readonly ChipChoice<T>[];
  /** The chosen value; null while nothing is chosen. */
  selected: T | null;
  /** Called for every tap, also on the chosen chip (a one-tap answer may be given twice). */
  onSelect: (value: T) => void;
  /** Names the group for screen readers, e.g. "Category". */
  accessibilityLabel: string;
  /** Larger chips for the one decision of a screen (quick add, the review question). */
  size?: 'regular' | 'large';
  disabled?: boolean;
  testID?: string;
};

const useStyles = makeStyles((theme) => ({
  group: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
  },
  chip: {
    maxWidth: '100%',
    minHeight: theme.sizes.chipHeight,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    justifyContent: 'center',
    borderRadius: theme.radii.pill,
    borderWidth: theme.borderWidths.thin,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.surface,
  },
  large: {
    minHeight: theme.sizes.buttonHeight,
    paddingHorizontal: theme.spacing.xl,
    borderRadius: theme.radii.md,
  },
  selected: { borderColor: theme.colors.accent, backgroundColor: theme.colors.accent },
  pressed: { backgroundColor: theme.colors.surfaceMuted },
  selectedPressed: { backgroundColor: theme.colors.accentPressed },
  disabled: { borderColor: theme.colors.surfaceMuted, backgroundColor: theme.colors.surfaceMuted },
}));

/**
 * One choice out of a few, as chips that wrap into rows: the categories of quick add and of the
 * review question, the day of a purchase. Radio semantics for screen readers; the chosen chip is
 * filled with the accent.
 */
export function ChoiceChips<T extends string>({
  options,
  selected,
  onSelect,
  accessibilityLabel,
  size = 'regular',
  disabled = false,
  testID,
}: ChoiceChipsProps<T>) {
  const styles = useStyles();
  return (
    <View
      testID={testID}
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      style={styles.group}
    >
      {options.map((option) => {
        const checked = option.value === selected;
        return (
          <Pressable
            key={option.value}
            onPress={() => onSelect(option.value)}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ checked, disabled }}
            testID={
              option.testID ?? (testID === undefined ? undefined : `${testID}-${option.value}`)
            }
            style={({ pressed }) => [
              styles.chip,
              size === 'large' && styles.large,
              checked && styles.selected,
              pressed && (checked ? styles.selectedPressed : styles.pressed),
              disabled && !checked && styles.disabled,
            ]}
          >
            <AppText
              variant={size === 'large' ? 'bodyStrong' : 'label'}
              tone={checked ? 'onAccent' : 'primary'}
            >
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}
