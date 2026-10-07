import { act, fireEvent, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Animated, Text } from 'react-native';

import { lightTheme } from '@/theme';
import { renderWithTheme } from '@/theme/testUtils';

import { BottomSheet } from './BottomSheet';

const reduceMotionEnabled = jest.mocked(AccessibilityInfo.isReduceMotionEnabled);

function sheet(visible: boolean, onClose = jest.fn()) {
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Add expense"
      closeLabel="Close"
      testID="sheet"
    >
      <Text>Sheet body</Text>
    </BottomSheet>
  );
}

afterEach(() => {
  reduceMotionEnabled.mockImplementation(() => Promise.resolve(false));
  jest.restoreAllMocks();
});

describe('BottomSheet', () => {
  it('renders nothing while hidden', async () => {
    await renderWithTheme(sheet(false));
    expect(screen.queryByText('Sheet body')).toBeNull();
    expect(screen.queryByTestId('sheet')).toBeNull();
  });

  it('shows the title as a header, the content and a close button', async () => {
    await renderWithTheme(sheet(true));
    expect(screen.getByRole('header', { name: 'Add expense' })).toBeOnTheScreen();
    expect(screen.getByText('Sheet body')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Close' })).toBeOnTheScreen();
  });

  it('closes from the close button', async () => {
    const onClose = jest.fn();
    await renderWithTheme(sheet(true, onClose));
    fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes when the dimmed backdrop is tapped', async () => {
    const onClose = jest.fn();
    await renderWithTheme(sheet(true, onClose));
    fireEvent.press(screen.getByTestId('sheet-scrim'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes from the screen reader escape gesture', async () => {
    const onClose = jest.fn();
    await renderWithTheme(sheet(true, onClose));
    const panel = screen.getByTestId('sheet-panel');
    expect(panel.props.accessibilityViewIsModal).toBe(true);
    fireEvent(panel, 'accessibilityEscape');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Android back (onRequestClose)', async () => {
    const onClose = jest.fn();
    await renderWithTheme(sheet(true, onClose));
    fireEvent(screen.getByTestId('sheet'), 'requestClose');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('lets the panel shrink to the screen so long content can scroll', async () => {
    await renderWithTheme(sheet(true));
    expect(screen.getByTestId('sheet-panel')).toHaveStyle({ flexShrink: 1 });
  });

  it('pads the panel above the home indicator', async () => {
    await renderWithTheme(sheet(true), { insets: { bottom: 34 } });
    expect(screen.getByTestId('sheet-panel')).toHaveStyle({
      paddingBottom: 34 + lightTheme.spacing.xl,
    });
  });

  it('slides in and out, unmounting once the exit animation has finished', async () => {
    const timing = jest.spyOn(Animated, 'timing');
    const { rerender } = await renderWithTheme(sheet(false));

    jest.useFakeTimers();
    try {
      rerender(sheet(true));
      expect(screen.getByText('Sheet body')).toBeOnTheScreen();
      expect(timing).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({
          toValue: 1,
          duration: lightTheme.motion.sheetEnter,
          useNativeDriver: true,
        }),
      );

      rerender(sheet(false));
      expect(timing).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({ toValue: 0, duration: lightTheme.motion.sheetExit }),
      );
      // Still on screen while it slides away...
      expect(screen.getByText('Sheet body')).toBeOnTheScreen();
      // ...and gone once the animation reports that it has finished.
      act(() => jest.advanceTimersByTime(lightTheme.motion.sheetExit));
      expect(screen.queryByText('Sheet body')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('skips the animation when Reduce Motion is on', async () => {
    reduceMotionEnabled.mockImplementation(() => Promise.resolve(true));
    const timing = jest.spyOn(Animated, 'timing');
    const { rerender } = await renderWithTheme(sheet(false));
    await act(async () => {});

    rerender(sheet(true));
    expect(screen.getByText('Sheet body')).toBeOnTheScreen();
    rerender(sheet(false));
    expect(screen.queryByText('Sheet body')).toBeNull();
    expect(timing).not.toHaveBeenCalled();
  });

  it('follows Reduce Motion when the setting changes while the app runs', async () => {
    const timing = jest.spyOn(Animated, 'timing');
    const { rerender } = await renderWithTheme(sheet(false));

    const calls = jest.mocked(AccessibilityInfo.addEventListener).mock.calls as unknown as [
      string,
      (enabled: boolean) => void,
    ][];
    const listener = calls.findLast(([event]) => event === 'reduceMotionChanged')?.[1];
    expect(listener).toBeDefined();
    act(() => listener?.(true));

    rerender(sheet(true));
    rerender(sheet(false));
    expect(screen.queryByText('Sheet body')).toBeNull();
    expect(timing).not.toHaveBeenCalled();
  });
});
