import { Pressable } from 'react-native';

import { makeStyles } from '@/theme';

import { AppText } from './AppText';

export type FilterChipProps = {
  /** What the filter is about, e.g. "Category". */
  label: string;
  /** Its current setting, e.g. "All" or "2 categories". */
  value: string;
  /** Filled with the accent while the filter narrows the list. */
  active: boolean;
  /** Opens the filter's choices (usually a bottom sheet). */
  onPress: () => void;
  accessibilityHint?: string;
  testID?: string;
};

const useStyles = makeStyles((theme) => ({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    maxWidth: '100%',
    minHeight: theme.sizes.chipHeight,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radii.pill,
    borderWidth: theme.borderWidths.thin,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.surface,
  },
  active: { borderColor: theme.colors.accent, backgroundColor: theme.colors.accent },
  pressed: { backgroundColor: theme.colors.surfaceMuted },
  activePressed: { backgroundColor: theme.colors.accentPressed },
  text: { flexShrink: 1 },
}));

/** A button in a filter bar that shows a filter and its current setting, e.g. "Source: By hand ▾". */
export function FilterChip({
  label,
  value,
  active,
  onPress,
  accessibilityHint,
  testID,
}: FilterChipProps) {
  const styles = useStyles();
  const tone = active ? 'onAccent' : 'primary';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ selected: active }}
      testID={testID}
      style={({ pressed }) => [
        styles.chip,
        active && styles.active,
        pressed && (active ? styles.activePressed : styles.pressed),
      ]}
    >
      <AppText variant="label" tone={tone} numberOfLines={1} style={styles.text}>
        {`${label}: ${value}`}
      </AppText>
      <AppText
        variant="label"
        tone={tone}
        accessibilityElementsHidden
        importantForAccessibility="no"
      >
        ▾
      </AppText>
    </Pressable>
  );
}
