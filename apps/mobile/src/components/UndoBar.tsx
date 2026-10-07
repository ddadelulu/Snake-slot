import { ActivityIndicator, Pressable, View } from 'react-native';

import { makeStyles, useTheme } from '@/theme';

import { AppText } from './AppText';

export type UndoBarProps = {
  /** What just happened, e.g. "Purchase deleted". */
  message: string;
  /** Translated, e.g. "Undo". */
  actionLabel: string;
  onAction: () => void;
  /** While the undo runs: a spinner instead of the label, and presses are ignored. */
  busy?: boolean;
  /** On the bar, which is the undo button. */
  testID?: string;
};

const useStyles = makeStyles((theme) => ({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    minHeight: theme.sizes.rowHeight,
    paddingStart: theme.layout.cardPadding,
    paddingEnd: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: theme.borderWidths.thin,
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accentSurface,
  },
  pressed: { backgroundColor: theme.colors.surfaceMuted },
  message: { flex: 1 },
  action: {
    minWidth: theme.sizes.minTouchTarget,
    minHeight: theme.sizes.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));

/**
 * Confirms something that can still be taken back ("Purchase deleted · Undo"). The whole bar is
 * the undo button, so it is easy to hit; screen readers hear the message and the action together
 * and are told when it appears.
 */
export function UndoBar({ message, actionLabel, onAction, busy = false, testID }: UndoBarProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <Pressable
      onPress={onAction}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={`${message}, ${actionLabel}`}
      accessibilityState={{ busy, disabled: busy }}
      accessibilityLiveRegion="polite"
      testID={testID}
      style={({ pressed }) => [styles.bar, pressed && styles.pressed]}
    >
      <AppText style={styles.message}>{message}</AppText>
      <View style={styles.action}>
        {busy ? (
          <ActivityIndicator
            color={theme.colors.accent}
            testID={testID === undefined ? undefined : `${testID}-spinner`}
          />
        ) : (
          <AppText variant="bodyStrong" tone="accent">
            {actionLabel}
          </AppText>
        )}
      </View>
    </Pressable>
  );
}
