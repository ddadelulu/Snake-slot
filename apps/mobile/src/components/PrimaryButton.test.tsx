import { fireEvent, screen } from '@testing-library/react-native';

import { lightTheme } from '@/theme';
import { renderWithTheme } from '@/theme/testUtils';

import { PrimaryButton } from './PrimaryButton';

const { colors, sizes } = lightTheme;

describe('PrimaryButton', () => {
  it('is an accessible button that calls onPress', async () => {
    const onPress = jest.fn();
    await renderWithTheme(<PrimaryButton label="Continue" onPress={onPress} testID="continue" />);

    const button = screen.getByRole('button', { name: 'Continue' });
    expect(button).toBeEnabled();
    expect(button).not.toBeBusy();
    expect(screen.getByText('Continue')).toBeOnTheScreen();
    fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('meets the minimum touch target', async () => {
    await renderWithTheme(<PrimaryButton label="Continue" onPress={jest.fn()} testID="continue" />);
    expect(screen.getByTestId('continue')).toHaveStyle({ minHeight: sizes.buttonHeight });
    expect(sizes.buttonHeight).toBeGreaterThanOrEqual(sizes.minTouchTarget);
  });

  it('uses the accent for primary, an outline for secondary and red for destructive', async () => {
    const { rerender } = await renderWithTheme(
      <PrimaryButton label="Save" onPress={jest.fn()} testID="button" />,
    );
    expect(screen.getByTestId('button')).toHaveStyle({ backgroundColor: colors.accent });
    expect(screen.getByText('Save')).toHaveStyle({ color: colors.textOnAccent });

    rerender(
      <PrimaryButton label="Save" onPress={jest.fn()} variant="secondary" testID="button" />,
    );
    expect(screen.getByTestId('button')).toHaveStyle({
      backgroundColor: colors.surface,
      borderColor: colors.accent,
    });
    expect(screen.getByText('Save')).toHaveStyle({ color: colors.accent });

    rerender(
      <PrimaryButton label="Delete" onPress={jest.fn()} variant="destructive" testID="button" />,
    );
    expect(screen.getByTestId('button')).toHaveStyle({ borderColor: colors.statusDanger });
    expect(screen.getByText('Delete')).toHaveStyle({ color: colors.statusDanger });
  });

  it('ignores presses and reports the state when disabled', async () => {
    const onPress = jest.fn();
    await renderWithTheme(<PrimaryButton label="Continue" onPress={onPress} disabled testID="b" />);

    const button = screen.getByRole('button', { name: 'Continue' });
    expect(button).toBeDisabled();
    expect(button).toHaveStyle({ backgroundColor: colors.surfaceMuted });
    expect(screen.getByText('Continue')).toHaveStyle({ color: colors.textDisabled });
    fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('shows a spinner, keeps its label for screen readers and ignores presses while loading', async () => {
    const onPress = jest.fn();
    await renderWithTheme(
      <PrimaryButton label="Sign in" onPress={onPress} loading testID="sign-in" />,
    );

    const button = screen.getByRole('button', { name: 'Sign in' });
    expect(button).toBeBusy();
    expect(button).toBeDisabled();
    expect(screen.getByTestId('sign-in-spinner')).toBeOnTheScreen();
    expect(screen.getByText('Sign in')).toHaveStyle({ opacity: 0 });
    fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('passes an accessibility hint through', async () => {
    await renderWithTheme(
      <PrimaryButton label="Connect" onPress={jest.fn()} accessibilityHint="Opens your bank" />,
    );
    expect(screen.getByHintText('Opens your bank')).toBeOnTheScreen();
  });
});
