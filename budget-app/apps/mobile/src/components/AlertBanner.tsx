import { Pressable, View } from 'react-native';

import { makeStyles } from '@/theme';

import { AppText } from './AppText';

export type AlertTone = 'info' | 'warning' | 'danger';

type ActionProps =
  { actionLabel: string; onAction: () => void } | { actionLabel?: undefined; onAction?: undefined };

type DismissProps =
  | { onDismiss: () => void; dismissLabel: string }
  | { onDismiss?: undefined; dismissLabel?: undefined };

export type AlertBannerProps = {
  tone: AlertTone;
  title?: string;
  message: string;
  /** A second sentence after the message, e.g. what else happened; testID `${testID}-detail`. */
  detail?: string;
  testID?: string;
} & ActionProps &
  DismissProps;

const useStyles = makeStyles((theme) => ({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    borderWidth: theme.borderWidths.thin,
    borderRadius: theme.radii.md,
    paddingVertical: theme.spacing.md,
    paddingStart: theme.layout.cardPadding,
    paddingEnd: theme.spacing.xs,
  },
  info: { backgroundColor: theme.colors.accentSurface, borderColor: theme.colors.accent },
  warning: {
    backgroundColor: theme.colors.statusWarningSurface,
    borderColor: theme.colors.statusWarning,
  },
  danger: {
    backgroundColor: theme.colors.statusDangerSurface,
    borderColor: theme.colors.statusDanger,
  },
  body: { flex: 1, gap: theme.spacing.xs, paddingEnd: theme.spacing.sm },
  text: { gap: theme.spacing.xxs },
  action: {
    alignSelf: 'flex-start',
    minHeight: theme.sizes.minTouchTarget,
    justifyContent: 'center',
  },
  actionPressed: { opacity: theme.opacity.pressed },
  dismiss: {
    minWidth: theme.sizes.minTouchTarget,
    minHeight: theme.sizes.minTouchTarget,
    marginTop: -theme.spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radii.md,
  },
  dismissPressed: { backgroundColor: theme.colors.surfaceMuted },
}));

/**
 * An inline message: `info` for neutral news, `warning` and `danger` for budget status (spec
 * section 9). Screen readers announce it when it appears (Android live region) and on focus.
 */
export function AlertBanner({
  tone,
  title,
  message,
  detail,
  actionLabel,
  onAction,
  onDismiss,
  dismissLabel,
  testID,
}: AlertBannerProps) {
  const styles = useStyles();
  const text = title ? `${title}. ${message}` : message;
  // The detail is a sentence of its own after the message.
  const spoken = detail === undefined ? text : `${text} ${detail}`;

  return (
    <View testID={testID} style={[styles.banner, styles[tone]]}>
      <View style={styles.body}>
        <View
          accessible
          accessibilityRole="alert"
          accessibilityLabel={spoken}
          accessibilityLiveRegion={tone === 'danger' ? 'assertive' : 'polite'}
          style={styles.text}
        >
          {title ? <AppText variant="bodyStrong">{title}</AppText> : null}
          <AppText>{message}</AppText>
          {detail !== undefined ? (
            <AppText testID={testID === undefined ? undefined : `${testID}-detail`}>
              {detail}
            </AppText>
          ) : null}
        </View>
        {actionLabel !== undefined && onAction !== undefined ? (
          <Pressable
            onPress={onAction}
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
            testID={testID === undefined ? undefined : `${testID}-action`}
            style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
          >
            <AppText variant="bodyStrong" tone="accent">
              {actionLabel}
            </AppText>
          </Pressable>
        ) : null}
      </View>
      {onDismiss !== undefined ? (
        <Pressable
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel={dismissLabel}
          testID={testID === undefined ? undefined : `${testID}-dismiss`}
          style={({ pressed }) => [styles.dismiss, pressed && styles.dismissPressed]}
        >
          <AppText variant="heading" tone="secondary" importantForAccessibility="no">
            ×
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}
