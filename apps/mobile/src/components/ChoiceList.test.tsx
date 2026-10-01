import { fireEvent, screen } from '@testing-library/react-native';
import { useState } from 'react';

import { lightTheme } from '@/theme';
import { renderWithTheme } from '@/theme/testUtils';

import { ChoiceList, type Choice } from './ChoiceList';

type Appearance = 'system' | 'light' | 'dark';

const OPTIONS: Choice<Appearance>[] = [
  { value: 'system', label: 'System', description: 'Follows your phone' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

function Picker({ onSelect }: { onSelect: (value: Appearance) => void }) {
  const [selected, setSelected] = useState<Appearance>('system');
  return (
    <ChoiceList
      options={OPTIONS}
      selected={selected}
      onSelect={(value) => {
        setSelected(value);
        onSelect(value);
      }}
      accessibilityLabel="Appearance"
      testID="appearance"
    />
  );
}

describe('ChoiceList', () => {
  it('is a radio group with one checked radio per option', async () => {
    await renderWithTheme(<Picker onSelect={jest.fn()} />);

    // The group is a container, not a focus stop, so each radio stays reachable on its own.
    const group = screen.getByTestId('appearance');
    expect(group).toHaveProp('accessibilityRole', 'radiogroup');
    expect(group).toHaveProp('accessibilityLabel', 'Appearance');
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);
    expect(screen.getByRole('radio', { name: 'System, Follows your phone' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Light' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Dark' })).not.toBeChecked();
    expect(screen.getByText('Follows your phone')).toBeOnTheScreen();
  });

  it('selects another option and moves the check', async () => {
    const onSelect = jest.fn();
    await renderWithTheme(<Picker onSelect={onSelect} />);

    fireEvent.press(screen.getByRole('radio', { name: 'Dark' }));
    expect(onSelect).toHaveBeenCalledWith('dark');
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'System, Follows your phone' })).not.toBeChecked();
  });

  it('does not report re-selecting the current option', async () => {
    const onSelect = jest.fn();
    await renderWithTheme(<Picker onSelect={onSelect} />);
    fireEvent.press(screen.getByRole('radio', { name: 'System, Follows your phone' }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('allows nothing to be selected yet', async () => {
    await renderWithTheme(
      <ChoiceList
        options={OPTIONS}
        selected={null}
        onSelect={jest.fn()}
        accessibilityLabel="Appearance"
      />,
    );
    for (const radio of screen.getAllByRole('radio')) expect(radio).not.toBeChecked();
  });

  it('gives every option a full-height row', async () => {
    await renderWithTheme(<Picker onSelect={jest.fn()} />);
    expect(screen.getByTestId('appearance-light')).toHaveStyle({
      minHeight: lightTheme.sizes.rowHeight,
    });
  });
});
