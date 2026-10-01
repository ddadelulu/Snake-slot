import { Text, type TextProps } from 'react-native';

import { makeStyles, useTheme, type ColorRoles, type TextVariant, type Theme } from '@/theme';

export type TextTone =
  'primary' | 'secondary' | 'accent' | 'danger' | 'ok' | 'warning' | 'onAccent';

export type AppTextProps = TextProps & {
  variant?: TextVariant;
  tone?: TextTone;
  /** Tabular figures, for amounts and other numbers that should line up. */
  numeric?: boolean;
  align?: 'left' | 'center' | 'right';
};

const TONE_COLOR: Record<TextTone, keyof ColorRoles> = {
  primary: 'textPrimary',
  secondary: 'textSecondary',
  accent: 'accent',
  danger: 'statusDanger',
  ok: 'statusOk',
  warning: 'statusWarning',
  onAccent: 'textOnAccent',
};

const variantStyle = (theme: Theme, variant: TextVariant) => {
  const { fontSize, lineHeight, fontWeight, letterSpacing } = theme.typography.variants[variant];
  return {
    fontFamily: theme.typography.fontFamily,
    fontSize,
    lineHeight,
    fontWeight,
    letterSpacing,
  };
};

const toneStyle = (theme: Theme, tone: TextTone) => ({ color: theme.colors[TONE_COLOR[tone]] });

const useStyles = makeStyles((theme) => ({
  display: variantStyle(theme, 'display'),
  title: variantStyle(theme, 'title'),
  heading: variantStyle(theme, 'heading'),
  body: variantStyle(theme, 'body'),
  bodyStrong: variantStyle(theme, 'bodyStrong'),
  label: variantStyle(theme, 'label'),
  caption: variantStyle(theme, 'caption'),
  primary: toneStyle(theme, 'primary'),
  secondary: toneStyle(theme, 'secondary'),
  accent: toneStyle(theme, 'accent'),
  danger: toneStyle(theme, 'danger'),
  ok: toneStyle(theme, 'ok'),
  warning: toneStyle(theme, 'warning'),
  onAccent: toneStyle(theme, 'onAccent'),
  numeric: { fontVariant: theme.typography.tabularNumbers },
  left: { textAlign: 'left' },
  center: { textAlign: 'center' },
  right: { textAlign: 'right' },
}));

/**
 * The only text component screens should use. Sizes, weights and colours come from the tokens,
 * and text follows the system text size (only `display` and `title` are capped, see tokens.ts).
 */
export function AppText({
  variant = 'body',
  tone = 'primary',
  numeric = false,
  align,
  style,
  maxFontSizeMultiplier,
  ...rest
}: AppTextProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <Text
      maxFontSizeMultiplier={
        maxFontSizeMultiplier ?? theme.typography.variants[variant].maxFontSizeMultiplier
      }
      style={[
        styles[variant],
        styles[tone],
        numeric && styles.numeric,
        align !== undefined && styles[align],
        style,
      ]}
      {...rest}
    />
  );
}
