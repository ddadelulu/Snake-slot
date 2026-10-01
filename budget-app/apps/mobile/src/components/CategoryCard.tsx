import { formatChf, type Language, type Rappen } from '@budget/core';
import { Pressable, View } from 'react-native';

import { makeStyles } from '@/theme';

import { AppText } from './AppText';
import { ProgressBar } from './ProgressBar';

export type CategoryCardProps = {
  name: string;
  spent: Rappen;
  budget: Rappen;
  language: Language;
  /** Translated word after the remaining amount, e.g. "left" / "übrig". */
  remainingLabel: string;
  /** Translated word after the overspent amount, e.g. "over" / "zu viel". */
  overLabel: string;
  onPress?: () => void;
  testID?: string;
};

const useStyles = makeStyles((theme) => ({
  card: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: theme.borderWidths.thin,
    borderRadius: theme.radii.lg,
    padding: theme.layout.cardPadding,
    gap: theme.spacing.md,
    minHeight: theme.sizes.minTouchTarget,
  },
  pressed: { backgroundColor: theme.colors.surfaceMuted },
  header: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    columnGap: theme.spacing.md,
    rowGap: theme.spacing.xs,
  },
  name: { flexShrink: 1 },
  amounts: { alignItems: 'flex-end', marginStart: 'auto' },
}));

/** One spending category: what is left (or how much over), the budget, and a status bar. */
export function CategoryCard({
  name,
  spent,
  budget,
  language,
  remainingLabel,
  overLabel,
  onPress,
  testID,
}: CategoryCardProps) {
  const styles = useStyles();
  const remaining = budget - spent;
  const over = remaining < 0;
  const statusText = over
    ? `${formatChf(-remaining, { language })} ${overLabel}`
    : `${formatChf(remaining, { language })} ${remainingLabel}`;
  const budgetText = formatChf(budget, { language });
  const accessibilityLabel = `${name}, ${statusText} / ${budgetText}`;

  const content = (
    <>
      <View style={styles.header}>
        <AppText variant="bodyStrong" style={styles.name}>
          {name}
        </AppText>
        <View style={styles.amounts}>
          <AppText
            variant="bodyStrong"
            tone={over ? 'danger' : 'primary'}
            numeric
            align="right"
            testID={testID === undefined ? undefined : `${testID}-status`}
          >
            {statusText}
          </AppText>
          <AppText variant="caption" tone="secondary" numeric align="right">
            {`/ ${budgetText}`}
          </AppText>
        </View>
      </View>
      <ProgressBar
        spent={spent}
        budget={budget}
        testID={testID === undefined ? undefined : `${testID}-progress`}
      />
    </>
  );

  if (onPress === undefined) {
    return (
      <View testID={testID} accessible accessibilityLabel={accessibilityLabel} style={styles.card}>
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
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}
