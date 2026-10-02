import { Pressable, View } from 'react-native';

import { makeStyles } from '@/theme';

import { AppText } from './AppText';

type RemoveProps =
  | {
      /** Adds a small remove button, e.g. for a custom category the person typed in. */
      onRemove: () => void;
      /** Translated label of the remove button, e.g. "Remove Pets" / "Haustiere entfernen". */
      removeLabel: string;
    }
  | { onRemove?: undefined; removeLabel?: undefined };

export type ToggleChipProps = RemoveProps & {
  label: string;
  selected: boolean;
  onToggle: () => void;
  /** On the checkbox; the remove button gets `${testID}-remove`. */
  testID?: string;
};

const useStyles = makeStyles((theme) => ({
  chip: {
    flexDirection: 'row',
    alignItems: 'stretch',
    maxWidth: '100%',
    borderRadius: theme.radii.pill,
    borderWidth: theme.borderWidths.thin,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.surface,
    overflow: 'hidden',
  },
  chipSelected: { borderColor: theme.colors.accent, backgroundColor: theme.colors.accent },
  toggle: {
    flexShrink: 1,
    minHeight: theme.sizes.chipHeight,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
  },
  toggleWithRemove: { paddingEnd: theme.spacing.xxs },
  toggleSelected: { backgroundColor: theme.colors.accent },
  togglePressed: { backgroundColor: theme.colors.surfaceMuted },
  toggleSelectedPressed: { backgroundColor: theme.colors.accentPressed },
  remove: {
    minWidth: theme.sizes.minTouchTarget,
    minHeight: theme.sizes.chipHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removePressed: { opacity: theme.opacity.pressed },
}));

/**
 * A chip that is on or off, for picking several things at once (payment methods, categories).
 * Selected chips are filled with the accent, unselected ones are outlined.
 */
export function ToggleChip({
  label,
  selected,
  onToggle,
  onRemove,
  removeLabel,
  testID,
}: ToggleChipProps) {
  const styles = useStyles();
  const removable = onRemove !== undefined;

  // The remove button sits next to the toggle, not inside it, so screen readers reach both.
  return (
    <View style={[styles.chip, selected && styles.chipSelected]}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="checkbox"
        accessibilityLabel={label}
        accessibilityState={{ checked: selected }}
        testID={testID}
        style={({ pressed }) => [
          styles.toggle,
          removable && styles.toggleWithRemove,
          selected && styles.toggleSelected,
          pressed && (selected ? styles.toggleSelectedPressed : styles.togglePressed),
        ]}
      >
        <AppText variant="label" tone={selected ? 'onAccent' : 'primary'}>
          {label}
        </AppText>
      </Pressable>
      {removable ? (
        <Pressable
          onPress={onRemove}
          accessibilityRole="button"
          accessibilityLabel={removeLabel}
          testID={testID === undefined ? undefined : `${testID}-remove`}
          style={({ pressed }) => [styles.remove, pressed && styles.removePressed]}
        >
          <AppText
            variant="heading"
            tone={selected ? 'onAccent' : 'secondary'}
            accessibilityElementsHidden
            importantForAccessibility="no"
          >
            ×
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}
