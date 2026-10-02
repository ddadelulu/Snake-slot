import { chf, type Rappen } from '@budget/core';
import { fireEvent, screen } from '@testing-library/react-native';
import { useState } from 'react';

import { lightTheme } from '@/theme';
import { renderWithTheme } from '@/theme/testUtils';

import { AmountSlider } from './AmountSlider';

// The native slider has no Jest implementation; a plain View keeps its props inspectable and lets
// the tests fire onValueChange the way a drag would.
jest.mock('@react-native-community/slider', () => {
  const { createElement } = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    __esModule: true,
    default: (props: Record<string, unknown>) => createElement(View, props),
  };
});

const MAX = chf(2000);
const STEP = chf(10);

function GroceriesBudget({
  initial,
  onChange,
  max = MAX,
  step = STEP,
}: {
  initial: Rappen;
  onChange: jest.Mock;
  max?: Rappen;
  step?: Rappen;
}) {
  const [value, setValue] = useState(initial);
  return (
    <AmountSlider
      label="Groceries"
      valueRappen={value}
      maxRappen={max}
      stepRappen={step}
      language="en"
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
      accessibilityLabel="Budget for Groceries"
      testID="groceries"
    />
  );
}

/** What a drag does: the slider reports a (possibly fractional) step index. */
const slide = (index: number) =>
  fireEvent(
    screen.getByTestId('groceries-slider', { includeHiddenElements: true }),
    'valueChange',
    index,
  );
const accessibilityAction = (actionName: string) => {
  fireEvent(screen.getByRole('adjustable'), 'accessibilityAction', { nativeEvent: { actionName } });
};

describe('AmountSlider', () => {
  it('shows the category and the formatted amount in tabular figures', async () => {
    await renderWithTheme(<GroceriesBudget initial={chf(500)} onChange={jest.fn()} />);

    expect(screen.getByText('Groceries', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(
      screen.getByTestId('groceries-amount', { includeHiddenElements: true }),
    ).toHaveTextContent('CHF 500.00');
    expect(screen.getByText('CHF 500.00', { includeHiddenElements: true })).toHaveStyle({
      fontVariant: ['tabular-nums'],
      color: lightTheme.colors.textPrimary,
    });
  });

  it('formats the amount for the language', async () => {
    await renderWithTheme(
      <AmountSlider
        label="Lebensmittel"
        valueRappen={chf(1250)}
        maxRappen={MAX}
        stepRappen={STEP}
        language="de"
        onChange={jest.fn()}
        accessibilityLabel="Budget für Lebensmittel"
      />,
    );
    expect(screen.getByText('CHF 1’250.00', { includeHiddenElements: true })).toBeOnTheScreen();
  });

  it('drives the slider in whole steps from 0 to max / step', async () => {
    await renderWithTheme(<GroceriesBudget initial={chf(500)} onChange={jest.fn()} />);

    const slider = screen.getByTestId('groceries-slider', { includeHiddenElements: true });
    expect(slider).toHaveProp('minimumValue', 0);
    expect(slider).toHaveProp('maximumValue', 200);
    expect(slider).toHaveProp('step', 1);
    expect(slider).toHaveProp('value', 50);
  });

  it.each<[label: string, index: number, rappen: Rappen, shown: string]>([
    ['a whole step', 38, chf(380), 'CHF 380.00'],
    ['a fractional index, rounded', 37.6, chf(380), 'CHF 380.00'],
    ['zero', 0, 0, 'CHF 0.00'],
    ['the maximum', 200, chf(2000), 'CHF 2,000.00'],
    ['an index below the range, clamped', -3, 0, 'CHF 0.00'],
    ['an index above the range, clamped', 250, chf(2000), 'CHF 2,000.00'],
  ])('reports %s as an integer multiple of the step', async (_label, index, rappen, shown) => {
    const onChange = jest.fn();
    await renderWithTheme(<GroceriesBudget initial={chf(500)} onChange={onChange} />);

    slide(index);
    expect(onChange).toHaveBeenCalledWith(rappen);
    const [reported] = onChange.mock.calls[0] as [number];
    expect(Number.isSafeInteger(reported)).toBe(true);
    expect(reported % STEP).toBe(0);
    expect(
      screen.getByTestId('groceries-amount', { includeHiddenElements: true }),
    ).toHaveTextContent(shown);
  });

  it('caps at the last whole step when max is not a multiple of the step', async () => {
    const onChange = jest.fn();
    await renderWithTheme(
      <GroceriesBudget initial={0} onChange={onChange} max={chf(105)} step={chf(10)} />,
    );
    const slider = screen.getByTestId('groceries-slider', { includeHiddenElements: true });
    expect(slider).toHaveProp('maximumValue', 10);
    slide(11);
    expect(onChange).toHaveBeenCalledWith(chf(100));
  });

  it('shows an amount between steps as it is, with the thumb on the nearest step', async () => {
    await renderWithTheme(<GroceriesBudget initial={chf(123, 45)} onChange={jest.fn()} />);
    expect(
      screen.getByTestId('groceries-amount', { includeHiddenElements: true }),
    ).toHaveTextContent('CHF 123.45');
    expect(screen.getByTestId('groceries-slider', { includeHiddenElements: true })).toHaveProp(
      'value',
      12,
    );
  });

  it('keeps the thumb at the end for an amount above max', async () => {
    await renderWithTheme(<GroceriesBudget initial={chf(2500)} onChange={jest.fn()} />);
    expect(
      screen.getByTestId('groceries-amount', { includeHiddenElements: true }),
    ).toHaveTextContent('CHF 2,500.00');
    expect(screen.getByTestId('groceries-slider', { includeHiddenElements: true })).toHaveProp(
      'value',
      200,
    );
  });

  it('is one adjustable element for screen readers, with the amount as its value', async () => {
    await renderWithTheme(<GroceriesBudget initial={chf(500)} onChange={jest.fn()} />);

    const control = screen.getByRole('adjustable', { name: 'Budget for Groceries' });
    expect(control).toBe(screen.getByTestId('groceries-control'));
    expect(control).toHaveAccessibilityValue({ min: 0, max: 200, now: 50, text: 'CHF 500.00' });
    // The slider itself and the visible texts are hidden, so nothing is read twice.
    expect(screen.queryByTestId('groceries-slider')).toBeNull();
    expect(screen.queryByText('Groceries')).toBeNull();
    expect(screen.queryByText('CHF 500.00')).toBeNull();
  });

  it('steps one step at a time with the screen reader actions', async () => {
    const onChange = jest.fn();
    await renderWithTheme(<GroceriesBudget initial={chf(500)} onChange={onChange} />);

    accessibilityAction('increment');
    expect(onChange).toHaveBeenLastCalledWith(chf(510));
    expect(screen.getByRole('adjustable')).toHaveAccessibilityValue({ text: 'CHF 510.00' });
    accessibilityAction('decrement');
    accessibilityAction('decrement');
    expect(onChange).toHaveBeenLastCalledWith(chf(490));
  });

  it('moves an amount between steps to the neighbouring step', async () => {
    const up = jest.fn();
    await renderWithTheme(<GroceriesBudget initial={chf(123, 45)} onChange={up} />);
    accessibilityAction('increment');
    expect(up).toHaveBeenCalledWith(chf(130));

    screen.unmount();
    const down = jest.fn();
    await renderWithTheme(<GroceriesBudget initial={chf(123, 45)} onChange={down} />);
    accessibilityAction('decrement');
    expect(down).toHaveBeenCalledWith(chf(120));
  });

  it('stops at both ends instead of overshooting', async () => {
    const atZero = jest.fn();
    await renderWithTheme(<GroceriesBudget initial={0} onChange={atZero} />);
    accessibilityAction('decrement');
    expect(atZero).not.toHaveBeenCalled();

    screen.unmount();
    const atMax = jest.fn();
    await renderWithTheme(<GroceriesBudget initial={MAX} onChange={atMax} />);
    accessibilityAction('increment');
    expect(atMax).not.toHaveBeenCalled();

    screen.unmount();
    const aboveMax = jest.fn();
    await renderWithTheme(<GroceriesBudget initial={chf(2500)} onChange={aboveMax} />);
    accessibilityAction('increment');
    expect(aboveMax).not.toHaveBeenCalled();
    accessibilityAction('decrement');
    expect(aboveMax).toHaveBeenCalledWith(MAX);
  });

  it('draws the track and thumb in token colours at a touchable height', async () => {
    await renderWithTheme(<GroceriesBudget initial={chf(500)} onChange={jest.fn()} />);
    const { colors, sizes } = lightTheme;
    const slider = screen.getByTestId('groceries-slider', { includeHiddenElements: true });
    expect(slider).toHaveProp('minimumTrackTintColor', colors.accent);
    expect(slider).toHaveProp('maximumTrackTintColor', colors.borderStrong);
    expect(slider).toHaveProp('thumbTintColor', colors.accent);
    expect(slider).toHaveStyle({ height: sizes.sliderHeight });
    expect(sizes.sliderHeight).toBeGreaterThanOrEqual(sizes.minTouchTarget);
  });

  it('disables the slider when max is smaller than one step', async () => {
    await renderWithTheme(
      <GroceriesBudget initial={0} onChange={jest.fn()} max={chf(5)} step={chf(10)} />,
    );
    const slider = screen.getByTestId('groceries-slider', { includeHiddenElements: true });
    expect(slider).toHaveProp('maximumValue', 0);
    expect(slider).toHaveProp('disabled', true);
  });

  it.each<[label: string, max: Rappen, step: Rappen]>([
    ['a zero step', MAX, 0],
    ['a negative step', MAX, -STEP],
    ['a fractional step', MAX, 0.5],
    ['a negative max', -MAX, STEP],
  ])('throws a RangeError for %s', async (_label, max, step) => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(
      renderWithTheme(<GroceriesBudget initial={0} onChange={jest.fn()} max={max} step={step} />),
    ).rejects.toThrow(RangeError);
    consoleError.mockRestore();
  });
});
