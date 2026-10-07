import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { makeStyles, useTheme } from '@/theme';

import { AppText } from './AppText';

export type SearchFieldProps = {
  value: string;
  onChangeText: (text: string) => void;
  /** Translated name of the field for screen readers, e.g. "Search transactions". */
  label: string;
  placeholder?: string;
  /** Translated label of the clear button, e.g. "Clear search". */
  clearLabel: string;
  /** On the input; the clear button gets `${testID}-clear`. */
  testID?: string;
};

const useStyles = makeStyles((theme) => ({
  frame: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: theme.sizes.inputHeight,
    paddingStart: theme.spacing.md,
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.borderStrong,
    borderWidth: theme.borderWidths.thin,
    borderRadius: theme.radii.pill,
  },
  focused: { borderColor: theme.colors.focus, borderWidth: theme.borderWidths.thick },
  input: {
    flex: 1,
    alignSelf: 'stretch',
    paddingVertical: theme.spacing.md,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.variants.body.fontSize,
    color: theme.colors.textPrimary,
  },
  clear: {
    minWidth: theme.sizes.minTouchTarget,
    minHeight: theme.sizes.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearPressed: { opacity: theme.opacity.pressed },
  clearSpacer: { width: theme.spacing.md },
}));

/** A search box with a magnifier and a clear button. Debouncing is the screen's business. */
export function SearchField({
  value,
  onChangeText,
  label,
  placeholder,
  clearLabel,
  testID,
}: SearchFieldProps) {
  const styles = useStyles();
  const theme = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.frame, focused && styles.focused]}>
      <Ionicons
        name="search"
        size={theme.sizes.inlineIcon}
        color={theme.colors.textSecondary}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        accessibilityLabel={label}
        accessibilityRole="search"
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="never"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholderTextColor={theme.colors.textSecondary}
        selectionColor={theme.colors.accent}
        cursorColor={theme.colors.accent}
        keyboardAppearance={theme.scheme}
        style={styles.input}
      />
      {value !== '' ? (
        <Pressable
          onPress={() => onChangeText('')}
          accessibilityRole="button"
          accessibilityLabel={clearLabel}
          testID={testID === undefined ? undefined : `${testID}-clear`}
          style={({ pressed }) => [styles.clear, pressed && styles.clearPressed]}
        >
          <AppText
            variant="heading"
            tone="secondary"
            accessibilityElementsHidden
            importantForAccessibility="no"
          >
            ×
          </AppText>
        </Pressable>
      ) : (
        <View style={styles.clearSpacer} />
      )}
    </View>
  );
}
