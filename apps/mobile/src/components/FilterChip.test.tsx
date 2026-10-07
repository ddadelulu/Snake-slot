import { fireEvent, screen } from '@testing-library/react-native';

import { lightTheme } from '@/theme';
import { renderWithTheme } from '@/theme/testUtils';

import { FilterChip } from './FilterChip';

const { colors, sizes } = lightTheme;

describe('FilterChip', () => {
  it('is a button that says the filter and its setting', async () => {
    const onPress = jest.fn();
    await renderWithTheme(
      <FilterChip
        label="Source"
        value="By hand"
        active
        onPress={onPress}
        accessibilityHint="Opens the choices"
        testID="chip"
      />,
    );
    const chip = screen.getByRole('button', { name: 'Source: By hand' });
    expect(chip).toHaveProp('accessibilityHint', 'Opens the choices');
    expect(chip).toBeSelected();
    expect(screen.getByText('Source: By hand')).toBeOnTheScreen();
    fireEvent.press(chip);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('is filled with the accent only while it narrows the list', async () => {
    const { rerender } = await renderWithTheme(
      <FilterChip label="Period" value="All time" active={false} onPress={jest.fn()} testID="c" />,
    );
    expect(screen.getByTestId('c')).toHaveStyle({ backgroundColor: colors.surface });
    expect(screen.getByTestId('c')).not.toBeSelected();
    rerender(
      <FilterChip label="Period" value="This month" active onPress={jest.fn()} testID="c" />,
    );
    expect(screen.getByTestId('c')).toHaveStyle({ backgroundColor: colors.accent });
    expect(screen.getByText('Period: This month')).toHaveStyle({ color: colors.textOnAccent });
  });

  it('meets the minimum touch target', async () => {
    await renderWithTheme(
      <FilterChip label="Category" value="All" active={false} onPress={jest.fn()} testID="c" />,
    );
    expect(screen.getByTestId('c')).toHaveStyle({ minHeight: sizes.chipHeight });
  });
});
