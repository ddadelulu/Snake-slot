import { Pressable } from 'react-native';

import { makeStyles } from '@/theme';

import { AppText } from './AppText';

export type TextLinkProps = {
  label: string;
  onPress: () => void;
  accessibilityHint?: string;
  testID?: string;
};

const useStyles = makeStyles((theme) => ({
  link: {
    minHeight: theme.sizes.minTouchTarget,
    justifyContent: 'center',
    alignSelf: 'center',
    paddingHorizontal: theme.spacing.sm,
  },
  pressed: { opacity: theme.opacity.pressed },
}));

/** A text-only button for secondary actions such as "Forgot password?". */
export function TextLink({ label, onPress, accessibilityHint, testID }: TextLinkProps) {
  const styles = useStyles();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      testID={testID}
      style={({ pressed }) => [styles.link, pressed && styles.pressed]}
    >
      <AppText variant="bodyStrong" tone="accent">
        {label}
      </AppText>
    </Pressable>
  );
}
