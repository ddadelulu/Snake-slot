import { Pressable, View } from 'react-native';

import { makeStyles } from '@/theme';

import { AppText, type TextTone } from './AppText';

export type CheckRowDetail = {
  text: string;
  tone?: TextTone;
  testID?: string;
};

export type CheckRowProps = {
  /** Main line, e.g. the merchant. */
  label: string;
  /** Right-aligned value, e.g. an amount. */
  value?: string;
  valueTone?: TextTone;
  /** Further lines under the label, e.g. the day and category, or a status. */
  details?: readonly CheckRowDetail[];
  checked: boolean;
  /** Shown but not changeable, e.g. a statement line that was imported before. */
  disabled?: boolean;
  onToggle: () => void;
  /** On the row (the checkbox for screen readers); the value gets `${testID}-value`. */
  testID?: string;
};

const useStyles = makeStyles((theme) => ({
  row: {
    minHeight: theme.sizes.rowHeight,
    paddingHorizontal: theme.layout.cardPadding,
    paddingVertical: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
    backgroundColor: theme.colors.surface,
  },
  pressed: { backgroundColor: theme.colors.surfaceMuted },
  box: {
    width: theme.sizes.radioOuter,
    height: theme.sizes.radioOuter,
    marginTop: theme.spacing.xxs,
    borderRadius: theme.radii.sm,
    borderWidth: theme.borderWidths.thick,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxChecked: { borderColor: theme.colors.accent, backgroundColor: theme.colors.accent },
  boxDisabled: {
    borderColor: theme.colors.surfaceMuted,
    backgroundColor: theme.colors.surfaceMuted,
  },
  text: { flex: 1, gap: theme.spacing.xxs },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.md },
  label: { flex: 1 },
  labelDisabled: { color: theme.colors.textDisabled },
}));

/**
 * A list line that can be checked or unchecked as a whole, e.g. the transactions of a statement
 * before they are imported. Screen readers meet one checkbox named by all of its text.
 */
export function CheckRow({
  label,
  value,
  valueTone = 'primary',
  details = [],
  checked,
  disabled = false,
  onToggle,
  testID,
}: CheckRowProps) {
  const styles = useStyles();
  const accessibilityLabel = [label, value, ...details.map((detail) => detail.text)]
    .filter((part) => part !== undefined && part !== '')
    .join(', ');

  return (
    <Pressable
      testID={testID}
      onPress={onToggle}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked, disabled }}
      style={({ pressed }) => [styles.row, pressed && !disabled && styles.pressed]}
    >
      <View
        style={[styles.box, checked && styles.boxChecked, disabled && styles.boxDisabled]}
        testID={testID === undefined ? undefined : `${testID}-box`}
      >
        {checked ? (
          <AppText variant="label" tone="onAccent" importantForAccessibility="no">
            ✓
          </AppText>
        ) : null}
      </View>
      <View style={styles.text}>
        <View style={styles.top}>
          <AppText
            variant="bodyStrong"
            numberOfLines={2}
            style={[styles.label, disabled && styles.labelDisabled]}
          >
            {label}
          </AppText>
          {value !== undefined ? (
            <AppText
              variant="bodyStrong"
              numeric
              align="right"
              tone={valueTone}
              testID={testID === undefined ? undefined : `${testID}-value`}
            >
              {value}
            </AppText>
          ) : null}
        </View>
        {details.map((detail, index) => (
          <AppText
            key={index}
            variant="caption"
            tone={detail.tone ?? 'secondary'}
            testID={detail.testID}
          >
            {detail.text}
          </AppText>
        ))}
      </View>
    </Pressable>
  );
}
