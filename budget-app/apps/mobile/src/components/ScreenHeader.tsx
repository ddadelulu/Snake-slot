import type { ReactNode } from 'react';
import { View } from 'react-native';

import { makeStyles } from '@/theme';

import { TextLink } from './TextLink';

export type ScreenHeaderProps = {
  /** Translated label of the back link, e.g. "Back" or "Cancel". */
  backLabel: string;
  onBack: () => void;
  /** An optional action on the right, e.g. a "Delete" link. */
  right?: ReactNode;
  testID?: string;
};

const useStyles = makeStyles((theme) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: theme.sizes.minTouchTarget,
  },
}));

/**
 * The row above a pushed screen's title: a back link on the left and an optional action on the
 * right. The screen title itself comes from `Screen`.
 */
export function ScreenHeader({ backLabel, onBack, right, testID }: ScreenHeaderProps) {
  const styles = useStyles();
  return (
    <View style={styles.row} testID={testID}>
      <TextLink
        label={backLabel}
        onPress={onBack}
        testID={testID === undefined ? undefined : `${testID}-back`}
      />
      {right ?? null}
    </View>
  );
}
