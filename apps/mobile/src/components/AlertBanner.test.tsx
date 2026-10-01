import { fireEvent, screen } from '@testing-library/react-native';

import { lightTheme } from '@/theme';
import { renderWithTheme } from '@/theme/testUtils';

import { AlertBanner } from './AlertBanner';

const { colors } = lightTheme;

describe('AlertBanner', () => {
  it('is announced as an alert with title and message', async () => {
    await renderWithTheme(
      <AlertBanner
        tone="warning"
        title="Groceries at 80 %"
        message="CHF 100.00 left for 9 days."
      />,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveAccessibleName('Groceries at 80 %. CHF 100.00 left for 9 days.');
    expect(alert.props.accessibilityLiveRegion).toBe('polite');
    expect(screen.getByText('Groceries at 80 %')).toBeOnTheScreen();
    expect(screen.getByText('CHF 100.00 left for 9 days.')).toBeOnTheScreen();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('interrupts politely for info and warning, assertively for danger', async () => {
    const { rerender } = await renderWithTheme(<AlertBanner tone="info" message="Synced" />);
    expect(screen.getByRole('alert').props.accessibilityLiveRegion).toBe('polite');
    rerender(<AlertBanner tone="danger" message="Over budget" />);
    expect(screen.getByRole('alert').props.accessibilityLiveRegion).toBe('assertive');
    expect(screen.getByRole('alert')).toHaveAccessibleName('Over budget');
  });

  it.each([
    ['info', colors.accentSurface, colors.accent],
    ['warning', colors.statusWarningSurface, colors.statusWarning],
    ['danger', colors.statusDangerSurface, colors.statusDanger],
  ] as const)('colours the %s tone from the tokens', async (tone, backgroundColor, borderColor) => {
    await renderWithTheme(<AlertBanner tone={tone} message="Message" testID="banner" />);
    expect(screen.getByTestId('banner')).toHaveStyle({ backgroundColor, borderColor });
  });

  it('offers an action and a dismiss button', async () => {
    const onAction = jest.fn();
    const onDismiss = jest.fn();
    await renderWithTheme(
      <AlertBanner
        tone="danger"
        message="Your bank connection expired."
        actionLabel="Reconnect"
        onAction={onAction}
        onDismiss={onDismiss}
        dismissLabel="Dismiss"
      />,
    );

    fireEvent.press(screen.getByRole('button', { name: 'Reconnect' }));
    expect(onAction).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('gives the dismiss button a full touch target', async () => {
    await renderWithTheme(
      <AlertBanner
        tone="info"
        message="Hi"
        onDismiss={jest.fn()}
        dismissLabel="Dismiss"
        testID="b"
      />,
    );
    expect(screen.getByTestId('b-dismiss')).toHaveStyle({
      minWidth: lightTheme.sizes.minTouchTarget,
      minHeight: lightTheme.sizes.minTouchTarget,
    });
  });
});
