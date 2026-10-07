import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { makeStyles } from '@/theme';

import { AmountInput } from './AmountInput';
import { AppText } from './AppText';
import { ChoiceChips } from './ChoiceChips';
import { TextLink } from './TextLink';

export type SplitEditorPart = {
  /** Stable while the part exists (React key, and how changes are reported). */
  key: string;
  /** Value of the chosen category option; null while none is chosen. */
  category: string | null;
  /** The part's amount as typed (always positive; the transaction gives the sign). */
  amountText: string;
  /** Translated validation messages. */
  categoryError?: string;
  amountError?: string;
};

export type SplitCategoryOption = {
  value: string;
  label: string;
  /** Names the chip in testIDs (`…-category-${testKey}`); defaults to the value. */
  testKey?: string;
};

export type SplitEditorLabels = {
  /** "Part 1". */
  part: (position: number) => string;
  amount: string;
  category: string;
  /** Shown on a part without a category, e.g. "Choose a category". */
  chooseCategory: string;
  /** "Remove part 1". */
  remove: (position: number) => string;
  /** "Add a part". */
  add: string;
};

export type SplitEditorProps = {
  parts: readonly SplitEditorPart[];
  categories: readonly SplitCategoryOption[];
  currency: string;
  onChangeAmount: (key: string, text: string) => void;
  onChangeCategory: (key: string, category: string) => void;
  onRemove: (key: string) => void;
  onAdd: () => void;
  /** False while only the minimum number of parts is left. */
  canRemove: boolean;
  labels: SplitEditorLabels;
  /** Live summary, already formatted, e.g. "CHF 12.00 left to assign". */
  remaining: string;
  /** `ok` once everything is assigned, `danger` when the parts are more than the total. */
  remainingTone: 'secondary' | 'ok' | 'danger';
  /** A problem with the split as a whole, e.g. "The parts must add up to CHF 84.00". */
  error?: string;
  /**
   * On the container. Parts: `${testID}-part-${index}` with `-amount`, `-category` (the button
   * that opens the choice), `-category-${testKey}` (each chip) and `-remove`; then `${testID}-add`,
   * `${testID}-remaining` and `${testID}-error`.
   */
  testID?: string;
};

const useStyles = makeStyles((theme) => ({
  container: { gap: theme.spacing.md },
  part: {
    gap: theme.spacing.md,
    padding: theme.layout.cardPadding,
    borderRadius: theme.radii.lg,
    borderWidth: theme.borderWidths.thin,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  partHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: theme.sizes.minTouchTarget,
  },
  categoryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    minHeight: theme.sizes.inputHeight,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: theme.borderWidths.thin,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.surface,
  },
  categoryButtonInvalid: {
    borderColor: theme.colors.statusDanger,
    borderWidth: theme.borderWidths.thick,
  },
  pressed: { backgroundColor: theme.colors.surfaceMuted },
  categoryText: { flex: 1 },
  field: { gap: theme.spacing.xs },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
}));

/**
 * Splits one amount across categories (spec section 6: a supermarket receipt with groceries and
 * a gift). Each part has a category and an amount; the caller keeps the parts, checks them and
 * shows what is left to assign. A part's categories fold away once one is chosen.
 */
export function SplitEditor({
  parts,
  categories,
  currency,
  onChangeAmount,
  onChangeCategory,
  onRemove,
  onAdd,
  canRemove,
  labels,
  remaining,
  remainingTone,
  error,
  testID,
}: SplitEditorProps) {
  const styles = useStyles();
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const sub = (suffix: string) => (testID === undefined ? undefined : `${testID}-${suffix}`);
  const labelOf = (value: string | null) =>
    categories.find((option) => option.value === value)?.label ?? null;

  const toggle = (key: string, show: boolean) =>
    setOpen((current) => {
      const next = new Set(current);
      if (show) next.add(key);
      else next.delete(key);
      return next;
    });

  return (
    <View style={styles.container} testID={testID}>
      {parts.map((part, index) => {
        const position = index + 1;
        const chosen = labelOf(part.category);
        const showChoices = chosen === null || open.has(part.key);
        const partId = (suffix: string) => sub(`part-${index}${suffix}`);
        return (
          <View key={part.key} style={styles.part} testID={partId('')}>
            <View style={styles.partHeader}>
              <AppText variant="bodyStrong" accessibilityRole="header">
                {labels.part(position)}
              </AppText>
              {canRemove ? (
                <TextLink
                  label={labels.remove(position)}
                  onPress={() => onRemove(part.key)}
                  testID={partId('-remove')}
                />
              ) : null}
            </View>
            <View style={styles.field}>
              <AppText variant="label" accessible={false} importantForAccessibility="no">
                {labels.category}
              </AppText>
              {showChoices ? (
                <ChoiceChips
                  options={categories.map((option) => ({
                    value: option.value,
                    label: option.label,
                    testID: partId(`-category-${option.testKey ?? option.value}`),
                  }))}
                  selected={part.category}
                  onSelect={(value) => {
                    onChangeCategory(part.key, value);
                    toggle(part.key, false);
                  }}
                  accessibilityLabel={`${labels.part(position)}, ${labels.category}`}
                />
              ) : (
                <Pressable
                  onPress={() => toggle(part.key, true)}
                  accessibilityRole="button"
                  accessibilityLabel={`${labels.category}, ${chosen}`}
                  testID={partId('-category')}
                  style={({ pressed }) => [
                    styles.categoryButton,
                    part.categoryError ? styles.categoryButtonInvalid : null,
                    pressed && styles.pressed,
                  ]}
                >
                  <AppText style={styles.categoryText} numberOfLines={1}>
                    {chosen}
                  </AppText>
                  <AppText
                    tone="secondary"
                    accessibilityElementsHidden
                    importantForAccessibility="no"
                  >
                    ▾
                  </AppText>
                </Pressable>
              )}
              {part.categoryError ? (
                <AppText
                  variant="caption"
                  tone="danger"
                  accessibilityLiveRegion="polite"
                  testID={partId('-category-error')}
                >
                  {part.categoryError}
                </AppText>
              ) : chosen === null ? (
                <AppText variant="caption" tone="secondary">
                  {labels.chooseCategory}
                </AppText>
              ) : null}
            </View>
            <AmountInput
              label={labels.amount}
              currency={currency}
              value={part.amountText}
              onChangeText={(text) => onChangeAmount(part.key, text)}
              error={part.amountError}
              testID={partId('-amount')}
            />
          </View>
        );
      })}
      <View style={styles.footer}>
        <AppText
          variant="bodyStrong"
          tone={remainingTone}
          accessibilityLiveRegion="polite"
          testID={sub('remaining')}
        >
          {remaining}
        </AppText>
        <TextLink label={labels.add} onPress={onAdd} testID={sub('add')} />
      </View>
      {error ? (
        <AppText
          variant="caption"
          tone="danger"
          accessibilityLiveRegion="polite"
          testID={sub('error')}
        >
          {error}
        </AppText>
      ) : null}
    </View>
  );
}
