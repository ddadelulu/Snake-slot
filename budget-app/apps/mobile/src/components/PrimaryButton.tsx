import { ActivityIndicator, Pressable, View } from 'react-native';

import { makeStyles, useTheme } from '@/theme';

import { AppText } from './AppText';

export type ButtonVariant = 'primary' | 'secondary' | 'destructive';

export type PrimaryButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  /** Shows a spinner and ignores presses; the label stays for screen readers. */
  loading?: boolean;
  accessibilityHint?: string;
  testID?: string;
};

const useStyles = makeStyles((theme) => ({
  base: {
    minHeight: theme.sizes.buttonHeight,
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: theme.borderWidths.thick,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
  primaryPressed: {
    backgroundColor: theme.colors.accentPressed,
    borderColor: theme.colors.accentPressed,
  },
  secondary: { backgroundColor: theme.colors.surface, borderColor: theme.colors.accent },
  secondaryPressed: { backgroundColor: theme.colors.surfaceMuted },
  destructive: { backgroundColor: theme.colors.surface, borderColor: theme.colors.statusDanger },
  destructivePressed: { backgroundColor: theme.colors.statusDangerSurface },
  disabled: { backgroundColor: theme.colors.surfaceMuted, borderColor: theme.colors.surfaceMuted },
  primaryLabel: { color: theme.colors.textOnAccent },
  secondaryLabel: { color: theme.colors.accent },
  destructiveLabel: { color: theme.colors.statusDanger },
  disabledLabel: { color: theme.colors.textDisabled },
  hidden: { opacity: 0 },
  spinner: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));

/**
 * The app's button. `primary` is the one main action of a screen, `secondary` an alternative,
 * `destructive` an action that deletes or disconnects something.
 */
export function PrimaryButton({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  accessibilityHint,
  testID,
}: PrimaryButtonProps) {
  const styles = useStyles();
  const theme = useTheme();
  const inactive = disabled || loading;
  const spinnerColor = {
    primary: theme.colors.textOnAccent,
    secondary: theme.colors.accent,
    destructive: theme.colors.statusDanger,
  }[variant];

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        pressed && styles[`${variant}Pressed`],
        disabled && styles.disabled,
      ]}
    >
      <AppText
        variant="bodyStrong"
        align="center"
        style={[
          disabled ? styles.disabledLabel : styles[`${variant}Label`],
          loading && styles.hidden,
        ]}
      >
        {label}
      </AppText>
      {loading ? (
        <View style={styles.spinner} pointerEvents="none">
          <ActivityIndicator
            color={spinnerColor}
            testID={testID ? `${testID}-spinner` : undefined}
          />
        </View>
      ) : null}
    </Pressable>
  );
}
