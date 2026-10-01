import { budgetStatus, progressPermille, type BudgetStatus, type Rappen } from '@budget/core';
import { View } from 'react-native';

import { makeStyles, type ColorRoles } from '@/theme';

export type ProgressBarProps = {
  spent: Rappen;
  budget: Rappen;
  /** What the bar measures, e.g. the category name. */
  accessibilityLabel?: string;
  testID?: string;
};

/** Spec section 5: green under 80 %, orange from 80 %, red from 100 %. */
export const STATUS_COLOR_ROLE: Record<BudgetStatus, keyof ColorRoles> = {
  ok: 'statusOk',
  warning: 'statusWarning',
  danger: 'statusDanger',
};

const useStyles = makeStyles((theme) => ({
  track: {
    height: theme.sizes.progressBarHeight,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.progressTrack,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: theme.radii.pill },
  ok: { backgroundColor: theme.colors[STATUS_COLOR_ROLE.ok] },
  warning: { backgroundColor: theme.colors[STATUS_COLOR_ROLE.warning] },
  danger: { backgroundColor: theme.colors[STATUS_COLOR_ROLE.danger] },
}));

/** How much of a budget is spent. Over budget shows a full red bar. */
export function ProgressBar({ spent, budget, accessibilityLabel, testID }: ProgressBarProps) {
  const styles = useStyles();
  const permille = progressPermille(spent, budget);
  const status = budgetStatus(spent, budget);
  const percent = permille / 10;

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.floor(percent) }}
      style={styles.track}
    >
      <View
        testID={testID === undefined ? undefined : `${testID}-fill`}
        style={[styles.fill, styles[status], { width: `${percent}%` }]}
      />
    </View>
  );
}
