import { useEffect, useState, type Ref } from 'react';
import { AccessibilityInfo, Platform, TextInput, View, type TextInputProps } from 'react-native';

import { makeStyles, useTheme } from '@/theme';

import { AppText } from './AppText';

export type AmountInputProps = Pick<
  TextInputProps,
  'autoFocus' | 'onSubmitEditing' | 'returnKeyType' | 'editable'
> & {
  label: string;
  /** What the person typed, e.g. "12.50" or "1'240"; the caller parses it (parseChf). */
  value: string;
  onChangeText: (text: string) => void;
  /** The currency shown in front of the number, e.g. "CHF". */
  currency: string;
  /** Validation message: shown under the field, announced, and the border turns red. */
  error?: string;
  /** Help text under the field while there is no error. */
  hint?: string;
  placeholder?: string;
  /** Large type for the one amount of a screen (quick add); compact for amounts inside a form. */
  size?: 'large' | 'compact';
  /** On the input; the frame gets `${testID}-frame` and the message `${testID}-error`. */
  testID?: string;
  ref?: Ref<TextInput>;
};

const useStyles = makeStyles((theme) => ({
  container: { gap: theme.spacing.xs },
  frame: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    minHeight: theme.sizes.inputHeight,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.borderStrong,
    borderWidth: theme.borderWidths.thin,
    borderRadius: theme.radii.md,
  },
  focused: { borderColor: theme.colors.focus, borderWidth: theme.borderWidths.thick },
  invalid: { borderColor: theme.colors.statusDanger, borderWidth: theme.borderWidths.thick },
  disabled: { backgroundColor: theme.colors.surfaceMuted },
  input: {
    flex: 1,
    alignSelf: 'stretch',
    paddingVertical: theme.spacing.md,
    fontFamily: theme.typography.fontFamily,
    color: theme.colors.textPrimary,
    fontVariant: theme.typography.tabularNumbers,
  },
  large: {
    fontSize: theme.typography.variants.title.fontSize,
    fontWeight: theme.typography.variants.title.fontWeight,
  },
  compact: { fontSize: theme.typography.variants.body.fontSize },
}));

/**
 * A money field: the currency in front, a decimal keyboard, tabular figures. It keeps the typed
 * text as it is; the screen turns it into Rappen with `parseChf`, which accepts Swiss input such
 * as "12.50", "12,50", "1'240" and "12.–" without floating point.
 */
export function AmountInput({
  label,
  value,
  onChangeText,
  currency,
  error,
  hint,
  placeholder,
  size = 'compact',
  testID,
  ref,
  editable = true,
  ...inputProps
}: AmountInputProps) {
  const styles = useStyles();
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const hasError = error !== undefined && error !== '';

  useEffect(() => {
    if (hasError && Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(error);
  }, [error, hasError]);

  return (
    <View style={styles.container}>
      <AppText variant="label" accessible={false} importantForAccessibility="no">
        {label}
      </AppText>
      <View
        testID={testID === undefined ? undefined : `${testID}-frame`}
        style={[
          styles.frame,
          !editable && styles.disabled,
          focused && styles.focused,
          hasError && styles.invalid,
        ]}
      >
        <AppText
          variant={size === 'large' ? 'heading' : 'body'}
          tone="secondary"
          accessibilityElementsHidden
          importantForAccessibility="no"
        >
          {currency}
        </AppText>
        <TextInput
          ref={ref}
          testID={testID}
          value={value}
          onChangeText={onChangeText}
          editable={editable}
          keyboardType="decimal-pad"
          inputMode="decimal"
          autoComplete="off"
          autoCorrect={false}
          placeholder={placeholder}
          accessibilityLabel={`${label}, ${currency}`}
          accessibilityHint={hasError ? error : hint}
          accessibilityState={{ disabled: !editable }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholderTextColor={theme.colors.textSecondary}
          selectionColor={theme.colors.accent}
          cursorColor={theme.colors.accent}
          keyboardAppearance={theme.scheme}
          style={[styles.input, size === 'large' ? styles.large : styles.compact]}
          {...inputProps}
        />
      </View>
      {hasError ? (
        <AppText
          variant="caption"
          tone="danger"
          accessibilityLiveRegion="polite"
          testID={testID === undefined ? undefined : `${testID}-error`}
        >
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="caption" tone="secondary">
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}
