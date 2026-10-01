import { formatChf, type Language, type Rappen } from '@budget/core';
import { View } from 'react-native';

import { makeStyles, useTheme } from '@/theme';

import { AppText } from './AppText';

export type BalanceHeaderProps = {
  /** Money left until payday; negative when the month is overspent. */
  remaining: Rappen;
  language: Language;
  /** Translated, e.g. "left this month". */
  label: string;
  /** What can still be spent per day; shown with `dailyAllowanceLabel` (e.g. "per day"). */
  dailyAllowance?: Rappen;
  dailyAllowanceLabel?: string;
  /** Shown with `daysUntilPaydayLabel`, already in the right plural form (e.g. "days to payday"). */
  daysUntilPayday?: number;
  daysUntilPaydayLabel?: string;
  testID?: string;
};

const useStyles = makeStyles((theme) => ({
  container: { gap: theme.spacing.sm, paddingVertical: theme.spacing.lg },
  facts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: theme.spacing.xxl,
    rowGap: theme.spacing.md,
  },
  fact: { gap: theme.spacing.xxs },
}));

/** The big "bank balance" at the top of the home screen. */
export function BalanceHeader({
  remaining,
  language,
  label,
  dailyAllowance,
  dailyAllowanceLabel,
  daysUntilPayday,
  daysUntilPaydayLabel,
  testID,
}: BalanceHeaderProps) {
  const styles = useStyles();
  const theme = useTheme();
  const balanceText = formatChf(remaining, { language });
  const number = formatChf(remaining, { language, currency: false });
  // Draw the currency smaller than the number, keeping whatever prefix formatChf uses.
  const currency = balanceText.endsWith(number) ? balanceText.slice(0, -number.length) : '';
  const tone = remaining < 0 ? 'danger' : 'primary';

  const showAllowance = dailyAllowance !== undefined && Boolean(dailyAllowanceLabel);
  const showPayday = daysUntilPayday !== undefined && Boolean(daysUntilPaydayLabel);
  const allowanceText = showAllowance ? formatChf(dailyAllowance, { language }) : '';

  const accessibilityLabel = [
    `${balanceText} ${label}`,
    showAllowance ? `${allowanceText} ${dailyAllowanceLabel}` : null,
    showPayday ? `${daysUntilPayday} ${daysUntilPaydayLabel}` : null,
  ]
    .filter((part): part is string => part !== null)
    .join(', ');

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="summary"
      accessibilityLabel={accessibilityLabel}
      style={styles.container}
    >
      <AppText
        variant="display"
        tone={tone}
        numeric
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.5}
        testID={testID === undefined ? undefined : `${testID}-balance`}
      >
        {currency ? (
          <AppText
            variant="heading"
            tone={tone}
            maxFontSizeMultiplier={theme.typography.variants.display.maxFontSizeMultiplier}
          >
            {currency}
          </AppText>
        ) : null}
        {currency ? number : balanceText}
      </AppText>
      <AppText variant="label" tone="secondary">
        {label}
      </AppText>
      {showAllowance || showPayday ? (
        <View style={styles.facts}>
          {showAllowance ? (
            <View style={styles.fact}>
              <AppText
                variant="bodyStrong"
                numeric
                tone={dailyAllowance < 0 ? 'danger' : 'primary'}
              >
                {allowanceText}
              </AppText>
              <AppText variant="caption" tone="secondary">
                {dailyAllowanceLabel}
              </AppText>
            </View>
          ) : null}
          {showPayday ? (
            <View style={styles.fact}>
              <AppText variant="bodyStrong" numeric>
                {String(daysUntilPayday)}
              </AppText>
              <AppText variant="caption" tone="secondary">
                {daysUntilPaydayLabel}
              </AppText>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
