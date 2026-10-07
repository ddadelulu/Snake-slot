import { fireEvent, screen } from '@testing-library/react-native';
import { useState } from 'react';

import { lightTheme } from '@/theme';
import { renderWithTheme } from '@/theme/testUtils';

import { ChoiceChips } from './ChoiceChips';

const { colors, sizes } = lightTheme;

const OPTIONS = [
  { value: 'c-1', label: 'Groceries', testID: 'pick-groceries' },
  { value: 'c-2', label: 'Eating out' },
  { value: 'c-3', label: 'Dog' },
];

function Picker({ onSelect }: { onSelect: (value: string) => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <ChoiceChips
      options={OPTIONS}
      selected={selected}
      onSelect={(value) => {
        setSelected(value);
        onSelect(value);
      }}
      accessibilityLabel="Category"
      testID="pick"
    />
  );
}

describe('ChoiceChips', () => {
  it('is a radio group with one radio per option, none chosen at first', async () => {
    await renderWithTheme(<Picker onSelect={jest.fn()} />);
    const group = screen.getByTestId('pick');
    expect(group).toHaveProp('accessibilityRole', 'radiogroup');
    expect(group).toHaveProp('accessibilityLabel', 'Category');
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);
    for (const radio of radios) expect(radio).not.toBeChecked();
  });

  it('chooses with one tap and fills the chosen chip with the accent', async () => {
    const onSelect = jest.fn();
    await renderWithTheme(<Picker onSelect={onSelect} />);
    fireEvent.press(screen.getByRole('radio', { name: 'Eating out' }));
    expect(onSelect).toHaveBeenCalledWith('c-2');
    expect(screen.getByRole('radio', { name: 'Eating out' })).toBeChecked();
    expect(screen.getByTestId('pick-c-2')).toHaveStyle({ backgroundColor: colors.accent });
    expect(screen.getByText('Eating out')).toHaveStyle({ color: colors.textOnAccent });
    expect(screen.getByTestId('pick-c-3')).toHaveStyle({ backgroundColor: colors.surface });
  });

  it('reports a tap on the chosen chip too (an answer may be given again)', async () => {
    const onSelect = jest.fn();
    await renderWithTheme(<Picker onSelect={onSelect} />);
    fireEvent.press(screen.getByTestId('pick-groceries'));
    fireEvent.press(screen.getByTestId('pick-groceries'));
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it('uses an option’s own testID when it has one', async () => {
    await renderWithTheme(<Picker onSelect={jest.fn()} />);
    expect(screen.getByTestId('pick-groceries')).toBeOnTheScreen();
    expect(screen.queryByTestId('pick-c-1')).toBeNull();
  });

  it('meets the touch target, and the large size is button height', async () => {
    const { rerender } = await renderWithTheme(
      <ChoiceChips
        options={OPTIONS}
        selected={null}
        onSelect={jest.fn()}
        accessibilityLabel="Category"
        testID="pick"
      />,
    );
    expect(screen.getByTestId('pick-c-2')).toHaveStyle({ minHeight: sizes.chipHeight });
    rerender(
      <ChoiceChips
        options={OPTIONS}
        selected={null}
        onSelect={jest.fn()}
        accessibilityLabel="Category"
        size="large"
        testID="pick"
      />,
    );
    expect(screen.getByTestId('pick-c-2')).toHaveStyle({ minHeight: sizes.buttonHeight });
  });

  it('ignores taps while disabled', async () => {
    const onSelect = jest.fn();
    await renderWithTheme(
      <ChoiceChips
        options={OPTIONS}
        selected="c-1"
        onSelect={onSelect}
        accessibilityLabel="Category"
        disabled
        testID="pick"
      />,
    );
    fireEvent.press(screen.getByTestId('pick-c-2'));
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole('radio', { name: 'Eating out' })).toBeDisabled();
  });
});
