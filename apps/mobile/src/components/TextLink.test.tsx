import { fireEvent, screen } from '@testing-library/react-native';

import { renderWithTheme } from '@/theme/testUtils';

import { TextLink } from './TextLink';

describe('TextLink', () => {
  it('renders an accessible link and handles presses', async () => {
    const onPress = jest.fn();
    await renderWithTheme(<TextLink label="Forgot password?" onPress={onPress} testID="forgot" />);
    const link = screen.getByRole('link', { name: 'Forgot password?' });
    expect(link).toBeOnTheScreen();
    fireEvent.press(link);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('meets the minimum touch target', async () => {
    await renderWithTheme(<TextLink label="Sign in" onPress={() => {}} testID="link" />);
    expect(screen.getByTestId('link')).toHaveStyle({ minHeight: 44 });
  });
});
