import { View } from 'react-native';

import { makeStyles } from '@/theme';

import { AppText } from './AppText';
import { PrimaryButton } from './PrimaryButton';

type ActionProps =
  { actionLabel: string; onAction: () => void } | { actionLabel?: undefined; onAction?: undefined };

export type EmptyStateProps = {
  title: string;
  message: string;
  testID?: string;
} & ActionProps;

const useStyles = makeStyles((theme) => ({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.xxxl,
    paddingHorizontal: theme.spacing.xl,
  },
  action: { marginTop: theme.spacing.lg, alignSelf: 'stretch' },
}));

/** What a list shows before it has content, with an optional way to add the first item. */
export function EmptyState({ title, message, actionLabel, onAction, testID }: EmptyStateProps) {
  const styles = useStyles();
  return (
    <View testID={testID} style={styles.container}>
      <AppText variant="heading" align="center" accessibilityRole="header">
        {title}
      </AppText>
      <AppText tone="secondary" align="center">
        {message}
      </AppText>
      {actionLabel !== undefined && onAction !== undefined ? (
        <View style={styles.action}>
          <PrimaryButton
            label={actionLabel}
            onPress={onAction}
            testID={testID === undefined ? undefined : `${testID}-action`}
          />
        </View>
      ) : null}
    </View>
  );
}
