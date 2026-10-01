import { View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';

import { makeStyles } from '@/theme';

export type CardProps = ViewProps & {
  /** Inner padding from the tokens (default true). Turn off for edge-to-edge rows. */
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
};

const useStyles = makeStyles((theme) => ({
  card: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: theme.borderWidths.thin,
    borderRadius: theme.radii.lg,
    overflow: 'hidden',
  },
  padded: { padding: theme.layout.cardPadding },
}));

/** A surface that groups related content, e.g. a list of settings rows. */
export function Card({ padded = true, style, ...rest }: CardProps) {
  const styles = useStyles();
  return <View style={[styles.card, padded && styles.padded, style]} {...rest} />;
}
