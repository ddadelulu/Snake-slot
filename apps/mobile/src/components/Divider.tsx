import { View } from 'react-native';

import { makeStyles } from '@/theme';

export type DividerProps = {
  /** Indent from the leading edge so the line starts under the row text. */
  inset?: boolean;
  testID?: string;
};

const useStyles = makeStyles((theme) => ({
  line: { height: theme.borderWidths.hairline, backgroundColor: theme.colors.border },
  inset: { marginStart: theme.layout.cardPadding },
}));

/** A decorative separator line, hidden from screen readers. */
export function Divider({ inset = false, testID }: DividerProps) {
  const styles = useStyles();
  return (
    <View
      testID={testID}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[styles.line, inset && styles.inset]}
    />
  );
}
