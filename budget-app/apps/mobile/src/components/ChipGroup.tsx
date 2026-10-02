import type { ReactNode } from 'react';
import { View } from 'react-native';

import { makeStyles } from '@/theme';

export type ChipGroupProps = {
  /** `ToggleChip`s. */
  children: ReactNode;
  /** Names the group for screen readers, e.g. "Payment methods". */
  accessibilityLabel: string;
  testID?: string;
};

const useStyles = makeStyles((theme) => ({
  group: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
  },
}));

/** Lays chips out in rows that wrap, e.g. the payment methods someone uses. */
export function ChipGroup({ children, accessibilityLabel, testID }: ChipGroupProps) {
  const styles = useStyles();
  // React Native's accessibilityRole has no "group", so the ARIA-style `role` names it. Like the
  // radio group in ChoiceList, it is a container, not a focus stop: every chip stays reachable.
  return (
    <View testID={testID} role="group" accessibilityLabel={accessibilityLabel} style={styles.group}>
      {children}
    </View>
  );
}
