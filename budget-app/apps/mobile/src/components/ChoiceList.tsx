import { Pressable, View } from 'react-native';

import { makeStyles } from '@/theme';

import { AppText } from './AppText';
import { Divider } from './Divider';

export type Choice<T extends string> = {
  value: T;
  label: string;
  /** Optional second line, e.g. what "System" means. */
  description?: string;
};

export type ChoiceListProps<T extends string> = {
  options: readonly Choice<T>[];
  selected: T | null;
  onSelect: (value: T) => void;
  /** Names the group for screen readers, e.g. "Language". */
  accessibilityLabel?: string;
  testID?: string;
};

const useStyles = makeStyles((theme) => ({
  group: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: theme.borderWidths.thin,
    borderRadius: theme.radii.lg,
    overflow: 'hidden',
  },
  option: {
    minHeight: theme.sizes.rowHeight,
    paddingHorizontal: theme.layout.cardPadding,
    paddingVertical: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  pressed: { backgroundColor: theme.colors.surfaceMuted },
  text: { flex: 1, gap: theme.spacing.xxs },
  radio: {
    width: theme.sizes.radioOuter,
    height: theme.sizes.radioOuter,
    borderRadius: theme.radii.pill,
    borderWidth: theme.borderWidths.thick,
    borderColor: theme.colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioChecked: { borderColor: theme.colors.accent },
  dot: {
    width: theme.sizes.radioInner,
    height: theme.sizes.radioInner,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.accent,
  },
}));

/** A single-choice list with radio semantics, e.g. the language and appearance pickers. */
export function ChoiceList<T extends string>({
  options,
  selected,
  onSelect,
  accessibilityLabel,
  testID,
}: ChoiceListProps<T>) {
  const styles = useStyles();
  return (
    <View
      testID={testID}
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      style={styles.group}
    >
      {options.map((option, index) => {
        const checked = option.value === selected;
        return (
          <View key={option.value}>
            {index > 0 ? <Divider inset /> : null}
            <Pressable
              onPress={() => {
                if (!checked) onSelect(option.value);
              }}
              accessibilityRole="radio"
              accessibilityLabel={
                option.description ? `${option.label}, ${option.description}` : option.label
              }
              accessibilityState={{ checked }}
              testID={testID === undefined ? undefined : `${testID}-${option.value}`}
              style={({ pressed }) => [styles.option, pressed && styles.pressed]}
            >
              <View style={styles.text}>
                <AppText>{option.label}</AppText>
                {option.description ? (
                  <AppText variant="caption" tone="secondary">
                    {option.description}
                  </AppText>
                ) : null}
              </View>
              <View style={[styles.radio, checked && styles.radioChecked]}>
                {checked ? <View style={styles.dot} /> : null}
              </View>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}
