import { Pressable, View } from 'react-native';

import { makeStyles } from '@/theme';

import { AppText } from './AppText';

export type SettingsRowProps = {
  label: string;
  /** Current value, e.g. "Deutsch" or "System". */
  value?: string;
  /** Makes the row a button. Navigation rows show a chevron. */
  onPress?: () => void;
  /** Red label for actions such as "Delete account"; these show no chevron. */
  destructive?: boolean;
  /**
   * The row opens another screen (default when pressable). Pass false for rows that act in
   * place, such as "Sign out", so no chevron promises navigation.
   */
  navigates?: boolean;
  accessibilityHint?: string;
  testID?: string;
};

const useStyles = makeStyles((theme) => ({
  row: {
    minHeight: theme.sizes.rowHeight,
    paddingHorizontal: theme.layout.cardPadding,
    paddingVertical: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    backgroundColor: theme.colors.surface,
  },
  pressed: { backgroundColor: theme.colors.surfaceMuted },
  label: { flex: 1 },
  value: { flexShrink: 1 },
}));

/** One line in a settings list. */
export function SettingsRow({
  label,
  value,
  onPress,
  destructive = false,
  navigates = true,
  accessibilityHint,
  testID,
}: SettingsRowProps) {
  const styles = useStyles();
  const hasValue = value !== undefined && value !== '';
  const accessibilityLabel = hasValue ? `${label}, ${value}` : label;

  const content = (
    <>
      <AppText tone={destructive ? 'danger' : 'primary'} style={styles.label}>
        {label}
      </AppText>
      {hasValue ? (
        <AppText tone="secondary" align="right" numberOfLines={1} style={styles.value}>
          {value}
        </AppText>
      ) : null}
      {onPress !== undefined && !destructive && navigates ? (
        <AppText
          variant="heading"
          tone="secondary"
          importantForAccessibility="no"
          accessibilityElementsHidden
          testID={testID === undefined ? undefined : `${testID}-chevron`}
        >
          ›
        </AppText>
      ) : null}
    </>
  );

  if (onPress === undefined) {
    return (
      <View testID={testID} accessible accessibilityLabel={accessibilityLabel} style={styles.row}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}
