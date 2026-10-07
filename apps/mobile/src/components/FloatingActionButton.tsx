import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { Pressable } from 'react-native';

import { makeStyles, useTheme } from '@/theme';

export type FloatingActionButtonProps = {
  /** Translated name of the action, e.g. "Add a purchase"; the button shows only an icon. */
  accessibilityLabel: string;
  onPress: () => void;
  /** Ionicons glyph (default "add", a plus). */
  icon?: ComponentProps<typeof Ionicons>['name'];
  accessibilityHint?: string;
  testID?: string;
};

const useStyles = makeStyles((theme) => ({
  button: {
    position: 'absolute',
    end: theme.layout.screenPadding,
    bottom: theme.spacing.xl,
    width: theme.sizes.fab,
    height: theme.sizes.fab,
    borderRadius: theme.radii.pill,
    borderWidth: theme.borderWidths.thick,
    borderColor: theme.colors.background,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { backgroundColor: theme.colors.accentPressed },
}));

/**
 * The round main action floating in the bottom corner of a screen (Home's "+"). It positions
 * itself over its parent, so render it as the last child of a container that fills the screen,
 * and keep `theme.sizes.fab` of free space under the scroll content so it never hides the last row.
 */
export function FloatingActionButton({
  accessibilityLabel,
  onPress,
  icon = 'add',
  accessibilityHint,
  testID,
}: FloatingActionButtonProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      testID={testID}
      hitSlop={theme.spacing.xs}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <Ionicons
        name={icon}
        size={theme.sizes.fabIcon}
        color={theme.colors.textOnAccent}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
    </Pressable>
  );
}
