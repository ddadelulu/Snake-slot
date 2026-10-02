import { fireEvent, screen, within } from '@testing-library/react-native';
import { useState } from 'react';

import { lightTheme } from '@/theme';
import { renderWithTheme } from '@/theme/testUtils';

import { ChipGroup } from './ChipGroup';
import { ToggleChip } from './ToggleChip';

const METHODS = ['TWINT', 'Debit card', 'Credit card', 'Cash'] as const;

function PaymentMethods({ onChange }: { onChange: (selected: string[]) => void }) {
  const [selected, setSelected] = useState<string[]>(['TWINT']);
  const toggle = (method: string) => {
    const next = selected.includes(method)
      ? selected.filter((item) => item !== method)
      : [...selected, method];
    setSelected(next);
    onChange(next);
  };
  return (
    <ChipGroup accessibilityLabel="Payment methods" testID="methods">
      {METHODS.map((method) => (
        <ToggleChip
          key={method}
          label={method}
          selected={selected.includes(method)}
          onToggle={() => toggle(method)}
        />
      ))}
    </ChipGroup>
  );
}

describe('ChipGroup', () => {
  it('names the group and leaves every chip reachable on its own', async () => {
    await renderWithTheme(<PaymentMethods onChange={jest.fn()} />);

    const group = screen.getByTestId('methods');
    expect(group).toHaveProp('role', 'group');
    expect(group).toHaveProp('accessibilityLabel', 'Payment methods');
    expect(group).not.toHaveProp('accessible', true);
    const chips = within(group).getAllByRole('checkbox');
    expect(chips.map((chip) => chip.props.accessibilityLabel)).toEqual([...METHODS]);
  });

  it('allows several chips to be selected at once', async () => {
    const onChange = jest.fn();
    await renderWithTheme(<PaymentMethods onChange={onChange} />);

    fireEvent.press(screen.getByRole('checkbox', { name: 'Cash' }));
    expect(onChange).toHaveBeenLastCalledWith(['TWINT', 'Cash']);
    expect(screen.getAllByRole('checkbox', { checked: true })).toHaveLength(2);

    fireEvent.press(screen.getByRole('checkbox', { name: 'TWINT' }));
    expect(onChange).toHaveBeenLastCalledWith(['Cash']);
    expect(screen.getByRole('checkbox', { name: 'TWINT' })).not.toBeChecked();
  });

  it('wraps the chips into rows with token gaps', async () => {
    await renderWithTheme(<PaymentMethods onChange={jest.fn()} />);
    expect(screen.getByTestId('methods')).toHaveStyle({
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: lightTheme.spacing.sm,
    });
  });
});
