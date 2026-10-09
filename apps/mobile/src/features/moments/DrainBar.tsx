import type { Rappen } from '@budget/core';
import { useEffect, useState } from 'react';
import { Animated, View } from 'react-native';

import { makeStyles, useTheme } from '@/theme';

const useStyles = makeStyles((theme) => ({
  track: {
    height: theme.sizes.momentBarHeight,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.progressTrack,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: theme.radii.pill },
}));

/** Share of the budget still left, 0…1. */
export function leftShare(remaining: Rappen, budget: Rappen): number {
  if (budget <= 0) return 0;
  return Math.min(1, Math.max(0, remaining / budget));
}

export type DrainBarProps = {
  budget: Rappen;
  before: Rappen;
  after: Rappen;
  durationMs: number;
  runKey: string;
  accessibilityLabel: string;
  testID?: string;
};

/**
 * The category's money left, draining from its level before the purchase to the new one. Green
 * above 20 % left, orange below, red when nothing is left (the budget colours of spec section 5).
 */
export function DrainBar({
  budget,
  before,
  after,
  durationMs,
  runKey,
  accessibilityLabel,
  testID,
}: DrainBarProps) {
  const styles = useStyles();
  const theme = useTheme();
  const start = leftShare(before, budget);
  const end = leftShare(after, budget);
  const [level] = useState(() => new Animated.Value(durationMs > 0 ? start : end));

  useEffect(() => {
    if (durationMs <= 0) {
      level.setValue(end);
      return;
    }
    level.setValue(start);
    const animation = Animated.timing(level, {
      toValue: end,
      duration: durationMs,
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [durationMs, end, level, runKey, start]);

  const color =
    after <= 0
      ? theme.colors.statusDanger
      : end < 0.2
        ? theme.colors.statusWarning
        : theme.colors.statusOk;

  return (
    <View
      style={styles.track}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(end * 100) }}
      testID={testID}
    >
      <Animated.View
        style={[
          styles.fill,
          {
            backgroundColor: color,
            width: level.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
          },
        ]}
      />
    </View>
  );
}
