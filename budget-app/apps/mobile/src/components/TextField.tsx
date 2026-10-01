import { useEffect, useState, type Ref } from 'react';
import {
  AccessibilityInfo,
  Platform,
  Pressable,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

import { makeStyles, useTheme } from '@/theme';

import { AppText } from './AppText';

type PassThroughProps = Pick<
  TextInputProps,
  | 'autoCapitalize'
  | 'autoComplete'
  | 'autoCorrect'
  | 'autoFocus'
  | 'editable'
  | 'inputMode'
  | 'keyboardType'
  | 'maxLength'
  | 'onBlur'
  | 'onFocus'
  | 'onSubmitEditing'
  | 'placeholder'
  | 'returnKeyType'
  | 'submitBehavior'
  | 'textContentType'
>;

type SecureProps =
  | {
      /** Hides the text and adds a show/hide toggle. */
      secureTextEntry: true;
      /** Translated toggle label while the text is hidden, e.g. "Show". */
      showLabel: string;
      /** Translated toggle label while the text is visible, e.g. "Hide". */
      hideLabel: string;
    }
  | { secureTextEntry?: false; showLabel?: undefined; hideLabel?: undefined };

export type TextFieldProps = PassThroughProps &
  SecureProps & {
    label: string;
    value: string;
    onChangeText: (text: string) => void;
    /** Validation message: shown under the field, announced, and the border turns red. */
    error?: string;
    /** Help text under the field while there is no error. */
    hint?: string;
    testID?: string;
    /** Focus the field from outside, e.g. move from email to password on "next". */
    ref?: Ref<TextInput>;
  };

const useStyles = makeStyles((theme) => ({
  container: { gap: theme.spacing.xs },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: theme.sizes.inputHeight,
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
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.variants.body.fontSize,
    color: theme.colors.textPrimary,
  },
  toggle: {
    minWidth: theme.sizes.minTouchTarget,
    minHeight: theme.sizes.minTouchTarget,
    paddingHorizontal: theme.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  togglePressed: { opacity: theme.opacity.pressed },
}));

/** A labelled text input with validation message and optional password visibility toggle. */
export function TextField({
  label,
  value,
  onChangeText,
  error,
  hint,
  secureTextEntry = false,
  showLabel,
  hideLabel,
  testID,
  ref,
  editable = true,
  onFocus,
  onBlur,
  ...inputProps
}: TextFieldProps) {
  const styles = useStyles();
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const hasError = error !== undefined && error !== '';

  // iOS has no live regions, so the message is announced explicitly when it appears or changes.
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
          styles.inputRow,
          !editable && styles.disabled,
          focused && styles.focused,
          hasError && styles.invalid,
        ]}
      >
        <TextInput
          ref={ref}
          testID={testID}
          value={value}
          onChangeText={onChangeText}
          editable={editable}
          secureTextEntry={secureTextEntry && !revealed}
          accessibilityLabel={label}
          accessibilityHint={hasError ? error : hint}
          accessibilityState={{ disabled: !editable }}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          placeholderTextColor={theme.colors.textSecondary}
          selectionColor={theme.colors.accent}
          cursorColor={theme.colors.accent}
          keyboardAppearance={theme.scheme}
          style={styles.input}
          {...inputProps}
        />
        {secureTextEntry ? (
          <Pressable
            onPress={() => setRevealed((current) => !current)}
            accessibilityRole="button"
            accessibilityLabel={revealed ? hideLabel : showLabel}
            testID={testID === undefined ? undefined : `${testID}-visibility`}
            style={({ pressed }) => [styles.toggle, pressed && styles.togglePressed]}
          >
            <AppText variant="label" tone="accent">
              {revealed ? hideLabel : showLabel}
            </AppText>
          </Pressable>
        ) : null}
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
