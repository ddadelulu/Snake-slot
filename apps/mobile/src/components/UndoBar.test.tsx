import { fireEvent, screen } from '@testing-library/react-native';

import { lightTheme } from '@/theme';
import { renderWithTheme } from '@/theme/testUtils';

import { UndoBar } from './UndoBar';

describe('UndoBar', () => {
  it('is one button with the message and the action, announced when it appears', async () => {
    const onAction = jest.fn();
    await renderWithTheme(
      <UndoBar message="Purchase deleted" actionLabel="Undo" onAction={onAction} testID="undo" />,
    );
    const bar = screen.getByRole('button', { name: 'Purchase deleted, Undo' });
    expect(bar).toHaveProp('accessibilityLiveRegion', 'polite');
    expect(screen.getByText('Purchase deleted')).toBeOnTheScreen();
    expect(screen.getByText('Undo')).toBeOnTheScreen();
    fireEvent.press(bar);
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('undo')).toHaveStyle({
      minHeight: lightTheme.sizes.rowHeight,
      backgroundColor: lightTheme.colors.accentSurface,
    });
  });

  it('shows a spinner and ignores presses while the undo runs', async () => {
    const onAction = jest.fn();
    await renderWithTheme(
      <UndoBar
        message="Purchase deleted"
        actionLabel="Undo"
        onAction={onAction}
        busy
        testID="undo"
      />,
    );
    expect(screen.getByTestId('undo-spinner')).toBeOnTheScreen();
    expect(screen.queryByText('Undo')).toBeNull();
    expect(screen.getByTestId('undo')).toBeBusy();
    fireEvent.press(screen.getByTestId('undo'));
    expect(onAction).not.toHaveBeenCalled();
  });
});
