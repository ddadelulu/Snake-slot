import { fireEvent, screen } from '@testing-library/react-native';
import { useState } from 'react';

import { lightTheme } from '@/theme';
import { renderWithTheme } from '@/theme/testUtils';

import { Stepper } from './Stepper';

const { colors, sizes } = lightTheme;
const MIN = 1;
const MAX = 3;

/** "Alerts per day" from 1 to 3, the way a screen would wire it. */
function AlertsPerDay({ initial = 2 }: { initial?: number }) {
  const [count, setCount] = useState(initial);
  return (
    <Stepper
      label="Alerts per day"
      valueText={String(count)}
      onDecrement={() => setCount((current) => current - 1)}
      onIncrement={() => setCount((current) => current + 1)}
      decrementLabel="Fewer"
      incrementLabel="More"
      canDecrement={count > MIN}
      canIncrement={count < MAX}
      testID="alerts"
    />
  );
}

const accessibilityAction = (actionName: string) => {
  fireEvent(screen.getByRole('adjustable'), 'accessibilityAction', { nativeEvent: { actionName } });
};

describe('Stepper', () => {
  it('shows the label and the caller-formatted value in tabular figures', async () => {
    await renderWithTheme(
      <Stepper
        label="Quiet hours start"
        valueText="22:00"
        onDecrement={jest.fn()}
        onIncrement={jest.fn()}
        decrementLabel="Earlier"
        incrementLabel="Later"
        testID="start"
      />,
    );
    expect(screen.getByText('22:00')).toHaveStyle({ fontVariant: ['tabular-nums'] });
    // The visible label is hidden because the adjustable value carries it.
    expect(screen.queryByText('Quiet hours start')).toBeNull();
    expect(
      screen.getByText('Quiet hours start', { includeHiddenElements: true }),
    ).toBeOnTheScreen();
  });

  it('is one adjustable element named by the label with the value as its value', async () => {
    await renderWithTheme(<AlertsPerDay />);

    const value = screen.getByRole('adjustable', { name: 'Alerts per day' });
    expect(value).toBe(screen.getByTestId('alerts-value'));
    expect(value).toHaveAccessibilityValue({ text: '2' });
    expect(value.props.accessibilityActions).toEqual([
      { name: 'increment', label: 'More' },
      { name: 'decrement', label: 'Fewer' },
    ]);
  });

  it('steps with the minus and plus buttons', async () => {
    await renderWithTheme(<AlertsPerDay />);

    fireEvent.press(screen.getByRole('button', { name: 'More' }));
    expect(screen.getByText('3')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Fewer' }));
    fireEvent.press(screen.getByRole('button', { name: 'Fewer' }));
    expect(screen.getByRole('adjustable')).toHaveAccessibilityValue({ text: '1' });
  });

  it('steps with the screen reader increment and decrement actions', async () => {
    await renderWithTheme(<AlertsPerDay />);

    accessibilityAction('increment');
    expect(screen.getByRole('adjustable')).toHaveAccessibilityValue({ text: '3' });
    accessibilityAction('decrement');
    accessibilityAction('decrement');
    expect(screen.getByRole('adjustable')).toHaveAccessibilityValue({ text: '1' });
  });

  it('disables the buttons and drops the actions at the limits', async () => {
    const { rerender } = await renderWithTheme(<AlertsPerDay initial={MAX} />);

    const more = screen.getByRole('button', { name: 'More' });
    expect(more).toBeDisabled();
    expect(more).toHaveStyle({ backgroundColor: colors.surfaceMuted });
    expect(screen.getByText('+')).toHaveStyle({ color: colors.textDisabled });
    expect(screen.getByRole('button', { name: 'Fewer' })).toBeEnabled();
    expect(screen.getByRole('adjustable').props.accessibilityActions).toEqual([
      { name: 'decrement', label: 'Fewer' },
    ]);
    fireEvent.press(more);
    accessibilityAction('increment');
    expect(screen.getByRole('adjustable')).toHaveAccessibilityValue({ text: String(MAX) });

    rerender(<AlertsPerDay key="min" initial={MIN} />);
    expect(screen.getByRole('button', { name: 'Fewer' })).toBeDisabled();
    accessibilityAction('decrement');
    expect(screen.getByRole('adjustable')).toHaveAccessibilityValue({ text: String(MIN) });
  });

  it('does not call back for a disabled direction', async () => {
    const onDecrement = jest.fn();
    const onIncrement = jest.fn();
    await renderWithTheme(
      <Stepper
        label="Alerts per day"
        valueText="1"
        onDecrement={onDecrement}
        onIncrement={onIncrement}
        decrementLabel="Fewer"
        incrementLabel="More"
        canDecrement={false}
      />,
    );
    fireEvent.press(screen.getByRole('button', { name: 'Fewer' }));
    accessibilityAction('decrement');
    expect(onDecrement).not.toHaveBeenCalled();
    accessibilityAction('increment');
    expect(onIncrement).toHaveBeenCalledTimes(1);
  });

  it('gives both buttons at least the minimum touch target', async () => {
    await renderWithTheme(<AlertsPerDay />);
    for (const id of ['alerts-decrement', 'alerts-increment']) {
      expect(screen.getByTestId(id)).toHaveStyle({
        minWidth: sizes.stepperButton,
        minHeight: sizes.stepperButton,
        borderColor: colors.borderStrong,
      });
    }
    expect(sizes.stepperButton).toBeGreaterThanOrEqual(sizes.minTouchTarget);
  });
});
