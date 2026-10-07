import { fireEvent, screen } from '@testing-library/react-native';

import { lightTheme } from '@/theme';
import { renderWithTheme } from '@/theme/testUtils';

import { FloatingActionButton } from './FloatingActionButton';

describe('FloatingActionButton', () => {
  it('is a button named by its label, not by its icon', async () => {
    const onPress = jest.fn();
    await renderWithTheme(
      <FloatingActionButton
        accessibilityLabel="Add a purchase"
        accessibilityHint="Amount, category, save"
        onPress={onPress}
        testID="fab"
      />,
    );
    const button = screen.getByRole('button', { name: 'Add a purchase' });
    expect(button).toHaveProp('accessibilityHint', 'Amount, category, save');
    fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('is a round accent button of the token size in the bottom corner', async () => {
    await renderWithTheme(
      <FloatingActionButton accessibilityLabel="Add" onPress={jest.fn()} testID="fab" />,
    );
    const { sizes, colors, radii, layout, spacing } = lightTheme;
    expect(screen.getByTestId('fab')).toHaveStyle({
      position: 'absolute',
      width: sizes.fab,
      height: sizes.fab,
      borderRadius: radii.pill,
      backgroundColor: colors.accent,
      right: layout.screenPadding,
      bottom: spacing.xl,
    });
    expect(sizes.fab).toBeGreaterThanOrEqual(sizes.minTouchTarget);
  });
});
