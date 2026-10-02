import { Platform, Pressable, Switch, View } from 'react-native';

import { makeStyles, useTheme } from '@/theme';

import { AppText } from './AppText';

export type SwitchRowProps = {
  label: string;
  /** Second line explaining the setting, e.g. "No alerts between 22:00 and 07:00". */
  hint?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  /** On the row (the switch for screen readers); the drawn switch gets `${testID}-switch`. */
  testID?: string;
};

const useStyles = makeStyles((theme) => ({
  row: {
    minHeight: theme.sizes.rowHeight,
    paddingHorizontal: theme.layout.cardPadding,
    paddingVertical: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    backgroundColor: theme.colors.surface,
  },
  pressed: { backgroundColor: theme.colors.surfaceMuted },
  text: { flex: 1, gap: theme.spacing.xxs },
  labelDisabled: { color: theme.colors.textDisabled },
}));

/**
 * A settings line with an on/off switch. The whole row is the control: tapping anywhere toggles
 * it, and screen readers meet one switch with the label (and hint) as its name.
 */
export function SwitchRow({
  label,
  hint,
  value,
  onValueChange,
  disabled = false,
  testID,
}: SwitchRowProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const hasHint = hint !== undefined && hint !== '';
  // react-native-web draws the "on" thumb from `activeThumbColor` (not in React Native's types)
  // and renders a focusable checkbox. The row is the control, so on the web the drawn switch is
  // kept out of the tab order by disabling it; the explicit colours keep it looking enabled.
  const isWeb = Platform.OS === 'web';
  const webSwitchProps = isWeb ? { activeThumbColor: colors.switchThumb } : {};

  return (
    <Pressable
      testID={testID}
      onPress={() => onValueChange(!value)}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityLabel={hasHint ? `${label}, ${hint}` : label}
      accessibilityState={{ checked: value, disabled }}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.text}>
        <AppText style={disabled && styles.labelDisabled}>{label}</AppText>
        {hasHint ? (
          <AppText variant="caption" tone="secondary">
            {hint}
          </AppText>
        ) : null}
      </View>
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Switch
          value={value}
          disabled={disabled || isWeb}
          trackColor={{ false: colors.switchTrackOff, true: colors.switchTrackOn }}
          ios_backgroundColor={colors.switchTrackOff}
          thumbColor={colors.switchThumb}
          testID={testID === undefined ? undefined : `${testID}-switch`}
          {...webSwitchProps}
        />
      </View>
    </Pressable>
  );
}
