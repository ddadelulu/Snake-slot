import { fireEvent, screen } from '@testing-library/react-native';

import { lightTheme } from '@/theme';
import { renderWithTheme } from '@/theme/testUtils';

import { SettingsRow } from './SettingsRow';

describe('SettingsRow', () => {
  it('is a button with label, value and chevron when pressable', async () => {
    const onPress = jest.fn();
    await renderWithTheme(
      <SettingsRow label="Language" value="Deutsch" onPress={onPress} testID="language" />,
    );

    const row = screen.getByRole('button', { name: 'Language, Deutsch' });
    expect(screen.getByText('Language')).toBeOnTheScreen();
    expect(screen.getByText('Deutsch')).toHaveStyle({ color: lightTheme.colors.textSecondary });
    // Decorative: hidden from screen readers, so only found when hidden elements are included.
    expect(screen.queryByTestId('language-chevron')).toBeNull();
    expect(
      screen.getByTestId('language-chevron', { includeHiddenElements: true }),
    ).toHaveTextContent('›');
    expect(row).toHaveStyle({ minHeight: lightTheme.sizes.rowHeight });
    fireEvent.press(row);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('is plain text without onPress', async () => {
    await renderWithTheme(<SettingsRow label="Version" value="0.1.0" testID="version" />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByTestId('version-chevron', { includeHiddenElements: true })).toBeNull();
    expect(screen.getByLabelText('Version, 0.1.0')).toBeOnTheScreen();
  });

  it('shows destructive actions in red without a chevron', async () => {
    const onPress = jest.fn();
    await renderWithTheme(
      <SettingsRow
        label="Delete account"
        onPress={onPress}
        destructive
        accessibilityHint="Asks for confirmation"
        testID="delete"
      />,
    );
    expect(screen.getByText('Delete account')).toHaveStyle({
      color: lightTheme.colors.statusDanger,
    });
    expect(screen.queryByTestId('delete-chevron', { includeHiddenElements: true })).toBeNull();
    const row = screen.getByRole('button', { name: 'Delete account' });
    expect(row).toHaveAccessibleName('Delete account');
    expect(screen.getByHintText('Asks for confirmation')).toBe(row);
    fireEvent.press(row);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('shows no chevron for in-place actions', async () => {
    await renderWithTheme(
      <SettingsRow label="Sign out" onPress={() => {}} navigates={false} testID="row" />,
    );
    expect(screen.queryByTestId('row-chevron')).toBeNull();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeOnTheScreen();
  });
});
