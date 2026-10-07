import { fireEvent, screen } from '@testing-library/react-native';

import { lightTheme } from '@/theme';
import { renderWithTheme } from '@/theme/testUtils';

import { LinkBanner } from './LinkBanner';

const { colors, sizes } = lightTheme;

describe('LinkBanner', () => {
  it('is one button named by its message, with a hint', async () => {
    const onPress = jest.fn();
    await renderWithTheme(
      <LinkBanner
        message="3 purchases need a category"
        accessibilityHint="Asks for the category of each one"
        onPress={onPress}
        testID="banner"
      />,
    );
    const banner = screen.getByRole('button', { name: '3 purchases need a category' });
    expect(banner).toHaveProp('accessibilityHint', 'Asks for the category of each one');
    fireEvent.press(banner);
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('banner')).toHaveStyle({ minHeight: sizes.rowHeight });
  });

  it.each([
    ['info', colors.accentSurface, colors.accent],
    ['warning', colors.statusWarningSurface, colors.statusWarning],
  ] as const)('colours the %s tone from the tokens', async (tone, backgroundColor, borderColor) => {
    await renderWithTheme(
      <LinkBanner tone={tone} message="Message" onPress={jest.fn()} testID="banner" />,
    );
    expect(screen.getByTestId('banner')).toHaveStyle({ backgroundColor, borderColor });
  });
});
