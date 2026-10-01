import { formatChf, type Language, type Rappen } from '@budget/core';
import { Pressable, View } from 'react-native';

import { makeStyles } from '@/theme';

import { AppText } from './AppText';

export type TransactionRowProps = {
  merchant: string;
  /** Signed: negative is money out (a purchase), positive is money in (a refund). */
  amount: Rappen;
  language: Language;
  /** Already translated and formatted, e.g. "Groceries · 3 Oct". */
  subtitle?: string;
  onPress?: () => void;
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
  text: { flex: 1, gap: theme.spacing.xxs },
}));

/**
 * Display amount: spending is the normal case and reads like a price ("CHF 12.50"); money
 * coming in gets a "+" and the green status colour.
 */
export function transactionAmountText(amount: Rappen, language: Language): string {
  return amount > 0
    ? formatChf(amount, { language, sign: 'always' })
    : formatChf(amount, { language, sign: 'never' });
}

/** One transaction in a list. */
export function TransactionRow({
  merchant,
  amount,
  language,
  subtitle,
  onPress,
  testID,
}: TransactionRowProps) {
  const styles = useStyles();
  const amountText = transactionAmountText(amount, language);
  const accessibilityLabel = [merchant, subtitle, amountText]
    .filter((part) => part !== undefined && part !== '')
    .join(', ');

  const content = (
    <>
      <View style={styles.text}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {merchant}
        </AppText>
        {subtitle ? (
          <AppText variant="caption" tone="secondary" numberOfLines={1}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      <AppText
        variant="bodyStrong"
        numeric
        align="right"
        tone={amount > 0 ? 'ok' : 'primary'}
        testID={testID === undefined ? undefined : `${testID}-amount`}
      >
        {amountText}
      </AppText>
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
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}
