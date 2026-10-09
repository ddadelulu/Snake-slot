import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, View } from 'react-native';

import { AppText, PrimaryButton } from '@/components';
import { makeStyles, useReduceMotion, useTheme } from '@/theme';

const useStyles = makeStyles((theme) => ({
  button: {
    minHeight: theme.sizes.buttonHeight,
    borderRadius: theme.radii.md,
    borderWidth: theme.borderWidths.thick,
    borderColor: theme.colors.statusDanger,
    backgroundColor: theme.colors.statusDangerSurface,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  // A strip along the bottom edge, so the label keeps its contrast while the hold fills it.
  fill: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    height: theme.spacing.xs,
    backgroundColor: theme.colors.statusDanger,
  },
  label: {
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
  },
}));

export type ConfirmButtonProps = {
  label: string;
  /** 0: a tap confirms. Otherwise the button must be held this long (Brutal). */
  holdMs: number;
  onConfirm: () => void;
  loading?: boolean;
  accessibilityHint: string;
  testID?: string;
};

/**
 * "I paid this". On Brutal the person holds it for two seconds while it fills red; letting go
 * early starts over. Screen reader users confirm with the standard activate action, since a timed
 * hold is not something every assistive technology can perform (WCAG 2.5.1).
 */
export function ConfirmButton({
  label,
  holdMs,
  onConfirm,
  loading = false,
  accessibilityHint,
  testID,
}: ConfirmButtonProps) {
  const styles = useStyles();
  const theme = useTheme();
  const reduceMotion = useReduceMotion();
  const [fill] = useState(() => new Animated.Value(0));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  if (holdMs <= 0) {
    return (
      <PrimaryButton
        label={label}
        onPress={onConfirm}
        loading={loading}
        accessibilityHint={accessibilityHint}
        testID={testID}
      />
    );
  }

  const start = () => {
    if (loading) return;
    if (timer.current) clearTimeout(timer.current);
    fill.setValue(0);
    if (!reduceMotion) {
      Animated.timing(fill, { toValue: 1, duration: holdMs, useNativeDriver: false }).start();
    }
    timer.current = setTimeout(() => {
      timer.current = null;
      onConfirm();
    }, holdMs);
  };

  const cancel = () => {
    if (!timer.current) return;
    clearTimeout(timer.current);
    timer.current = null;
    fill.stopAnimation();
    fill.setValue(0);
  };

  return (
    <Pressable
      onPressIn={start}
      onPressOut={cancel}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ busy: loading }}
      accessibilityActions={[{ name: 'activate' }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'activate' && !loading) onConfirm();
      }}
      style={styles.button}
      testID={testID}
    >
      <Animated.View
        style={[
          styles.fill,
          { width: fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
        ]}
      />
      <View style={styles.label}>
        {loading ? (
          <ActivityIndicator color={theme.colors.statusDanger} />
        ) : (
          <AppText variant="bodyStrong" tone="danger" align="center">
            {label}
          </AppText>
        )}
      </View>
    </Pressable>
  );
}
