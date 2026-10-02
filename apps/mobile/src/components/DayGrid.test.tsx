import { fireEvent, screen, within } from '@testing-library/react-native';
import { useState } from 'react';

import { lightTheme } from '@/theme';
import { renderWithTheme } from '@/theme/testUtils';

import { DayGrid } from './DayGrid';

const dayLabel = (day: number) => `${day}.`;

function PaydayPicker({ initial, onSelect }: { initial: number | null; onSelect: jest.Mock }) {
  const [selected, setSelected] = useState(initial);
  return (
    <DayGrid
      selected={selected}
      onSelect={(day) => {
        setSelected(day);
        onSelect(day);
      }}
      dayLabel={dayLabel}
      accessibilityLabel="Payday"
      testID="payday"
    />
  );
}

describe('DayGrid', () => {
  it('is a radio group with one radio per day from 1 to 31', async () => {
    await renderWithTheme(<PaydayPicker initial={25} onSelect={jest.fn()} />);

    const group = screen.getByTestId('payday');
    expect(group).toHaveProp('accessibilityRole', 'radiogroup');
    expect(group).toHaveProp('accessibilityLabel', 'Payday');
    const radios = within(group).getAllByRole('radio');
    expect(radios).toHaveLength(31);
    expect(radios.map((radio) => radio.props.accessibilityLabel)).toEqual(
      Array.from({ length: 31 }, (_, index) => `${index + 1}.`),
    );
    expect(screen.getByRole('radio', { name: '25.' })).toBeChecked();
    expect(screen.getAllByRole('radio', { checked: true })).toHaveLength(1);
  });

  it('lays the days out in rows of seven', async () => {
    await renderWithTheme(<PaydayPicker initial={null} onSelect={jest.fn()} />);

    const rowOf = (day: number) => screen.getByTestId(`payday-${day}`).parent;
    expect(rowOf(1)).toBe(rowOf(7));
    expect(rowOf(8)).not.toBe(rowOf(7));
    expect(rowOf(29)).toBe(rowOf(31));
    expect(rowOf(28)).not.toBe(rowOf(29));
  });

  it('selects a day and moves the check', async () => {
    const onSelect = jest.fn();
    await renderWithTheme(<PaydayPicker initial={25} onSelect={onSelect} />);

    fireEvent.press(screen.getByTestId('payday-31'));
    expect(onSelect).toHaveBeenCalledWith(31);
    expect(screen.getByRole('radio', { name: '31.' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '25.' })).not.toBeChecked();
  });

  it('does not report re-selecting the current day', async () => {
    const onSelect = jest.fn();
    await renderWithTheme(<PaydayPicker initial={25} onSelect={onSelect} />);
    fireEvent.press(screen.getByTestId('payday-25'));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('allows nothing to be selected yet', async () => {
    await renderWithTheme(<PaydayPicker initial={null} onSelect={jest.fn()} />);
    expect(screen.queryAllByRole('radio', { checked: true })).toHaveLength(0);
  });

  it('fills the selected day with the accent and keeps the others plain', async () => {
    await renderWithTheme(<PaydayPicker initial={25} onSelect={jest.fn()} />);

    const { colors } = lightTheme;
    const selectedNumber = screen.getByText('25');
    expect(selectedNumber).toHaveStyle({ color: colors.textOnAccent, fontVariant: ['tabular-nums'] });
    expect(selectedNumber.parent?.parent).toHaveStyle({ backgroundColor: colors.accent });
    const otherNumber = screen.getByText('24');
    expect(otherNumber).toHaveStyle({ color: colors.textPrimary });
    expect(otherNumber.parent?.parent).toHaveStyle({ backgroundColor: colors.surface });
  });

  it('gives every day at least the minimum touch height', async () => {
    await renderWithTheme(<PaydayPicker initial={null} onSelect={jest.fn()} />);
    const { sizes } = lightTheme;
    expect(screen.getByTestId('payday-1')).toHaveStyle({ minHeight: sizes.dayCellHeight, flex: 1 });
    expect(sizes.dayCellHeight).toBeGreaterThanOrEqual(sizes.minTouchTarget);
  });
});
