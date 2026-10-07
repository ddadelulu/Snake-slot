import { Pressable } from 'react-native';

import { makeStyles } from '@/theme';

import { AppText } from './AppText';

export type LinkBannerProps = {
  /** E.g. "3 purchases need a category". */
  message: string;
  onPress: () => void;
  /** `info` (accent) for news, `warning` (orange) for something that needs the person. */
  tone?: 'info' | 'warning';
  accessibilityHint?: string;
  testID?: string;
};

const useStyles = makeStyles((theme) => ({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    minHeight: theme.sizes.rowHeight,
    paddingHorizontal: theme.layout.cardPadding,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: theme.borderWidths.thin,
  },
  info: { backgroundColor: theme.colors.accentSurface, borderColor: theme.colors.accent },
  warning: {
    backgroundColor: theme.colors.statusWarningSurface,
    borderColor: theme.colors.statusWarning,
  },
  pressed: { backgroundColor: theme.colors.surfaceMuted },
  message: { flex: 1 },
}));

/**
 * A tappable banner that leads to another screen, e.g. Home's "3 purchases need a category".
 * The whole banner is one button with a chevron.
 */
export function LinkBanner({
  message,
  onPress,
  tone = 'info',
  accessibilityHint,
  testID,
}: LinkBannerProps) {
  const styles = useStyles();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={message}
      accessibilityHint={accessibilityHint}
      testID={testID}
      style={({ pressed }) => [styles.banner, styles[tone], pressed && styles.pressed]}
    >
      <AppText variant="bodyStrong" style={styles.message}>
        {message}
      </AppText>
      <AppText
        variant="heading"
        tone={tone === 'warning' ? 'warning' : 'accent'}
        accessibilityElementsHidden
        importantForAccessibility="no"
      >
        ›
      </AppText>
    </Pressable>
  );
}
