import { screen } from '@testing-library/react-native';
import { useColorScheme } from 'react-native';

import { darkTheme, lightTheme, type TextVariant } from '@/theme';
import { renderWithTheme } from '@/theme/testUtils';

import { AppText, type TextTone } from './AppText';

const VARIANTS = Object.keys(lightTheme.typography.variants) as TextVariant[];

describe('AppText', () => {
  it('defaults to body text in the primary colour with system font scaling', async () => {
    await renderWithTheme(<AppText>Hello</AppText>);
    const text = screen.getByText('Hello');
    const body = lightTheme.typography.variants.body;
    expect(text).toHaveStyle({
      fontSize: body.fontSize,
      lineHeight: body.lineHeight,
      color: lightTheme.colors.textPrimary,
    });
    expect(text.props.allowFontScaling).not.toBe(false);
    expect(text.props.maxFontSizeMultiplier).toBeUndefined();
  });

  it.each(VARIANTS)('renders the %s variant from the tokens', async (variant) => {
    await renderWithTheme(<AppText variant={variant}>Text</AppText>);
    const { fontSize, lineHeight, fontWeight, maxFontSizeMultiplier } =
      lightTheme.typography.variants[variant];
    const text = screen.getByText('Text');
    expect(text).toHaveStyle({ fontSize, lineHeight, fontWeight });
    expect(text.props.maxFontSizeMultiplier).toBe(maxFontSizeMultiplier);
  });

  it.each<[TextTone, keyof typeof lightTheme.colors]>([
    ['primary', 'textPrimary'],
    ['secondary', 'textSecondary'],
    ['accent', 'accent'],
    ['danger', 'statusDanger'],
    ['ok', 'statusOk'],
    ['warning', 'statusWarning'],
    ['onAccent', 'textOnAccent'],
  ])('colours the %s tone with %s', async (tone, role) => {
    await renderWithTheme(<AppText tone={tone}>Text</AppText>);
    expect(screen.getByText('Text')).toHaveStyle({ color: lightTheme.colors[role] });
  });

  it('uses tabular figures for numbers', async () => {
    await renderWithTheme(<AppText numeric>CHF 12.50</AppText>);
    expect(screen.getByText('CHF 12.50')).toHaveStyle({ fontVariant: ['tabular-nums'] });
  });

  it('lets callers raise or lower the font scaling cap', async () => {
    await renderWithTheme(
      <AppText variant="display" maxFontSizeMultiplier={2}>
        Big
      </AppText>,
    );
    expect(screen.getByText('Big').props.maxFontSizeMultiplier).toBe(2);
  });

  it('switches to the dark colours with the system', async () => {
    jest.mocked(useColorScheme).mockReturnValue('dark');
    try {
      await renderWithTheme(<AppText tone="secondary">Text</AppText>);
      expect(screen.getByText('Text')).toHaveStyle({ color: darkTheme.colors.textSecondary });
    } finally {
      jest.mocked(useColorScheme).mockReturnValue('light');
    }
  });
});
