import { fireEvent, screen } from '@testing-library/react-native';
import { useState } from 'react';

import { lightTheme } from '@/theme';
import { renderWithTheme } from '@/theme/testUtils';

import { ToggleChip } from './ToggleChip';

const { colors, sizes } = lightTheme;

function Twint({ onToggle }: { onToggle: jest.Mock }) {
  const [selected, setSelected] = useState(false);
  return (
    <ToggleChip
      label="TWINT"
      selected={selected}
      onToggle={() => {
        setSelected((current) => !current);
        onToggle();
      }}
      testID="twint"
    />
  );
}

describe('ToggleChip', () => {
  it('is a checkbox that toggles its checked state', async () => {
    const onToggle = jest.fn();
    await renderWithTheme(<Twint onToggle={onToggle} />);

    const chip = screen.getByRole('checkbox', { name: 'TWINT' });
    expect(chip).not.toBeChecked();
    fireEvent.press(chip);
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('checkbox', { name: 'TWINT' })).toBeChecked();
    fireEvent.press(screen.getByTestId('twint'));
    expect(screen.getByRole('checkbox', { name: 'TWINT' })).not.toBeChecked();
  });

  it('is outlined when off and filled with the accent when on', async () => {
    const { rerender } = await renderWithTheme(
      <ToggleChip label="Card" selected={false} onToggle={jest.fn()} testID="card" />,
    );
    expect(screen.getByTestId('card')).toHaveStyle({ backgroundColor: colors.surface });
    expect(screen.getByText('Card')).toHaveStyle({ color: colors.textPrimary });

    rerender(<ToggleChip label="Card" selected onToggle={jest.fn()} testID="card" />);
    expect(screen.getByTestId('card')).toHaveStyle({ backgroundColor: colors.accent });
    expect(screen.getByText('Card')).toHaveStyle({ color: colors.textOnAccent });
  });

  it('meets the minimum touch target', async () => {
    await renderWithTheme(
      <ToggleChip label="Cash" selected={false} onToggle={jest.fn()} testID="cash" />,
    );
    expect(screen.getByTestId('cash')).toHaveStyle({ minHeight: sizes.chipHeight });
    expect(sizes.chipHeight).toBeGreaterThanOrEqual(sizes.minTouchTarget);
  });

  it('has no remove button unless asked for one', async () => {
    await renderWithTheme(
      <ToggleChip label="Cash" selected={false} onToggle={jest.fn()} testID="cash" />,
    );
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByTestId('cash-remove')).toBeNull();
  });

  it('offers a separately labelled remove button for custom entries', async () => {
    const onToggle = jest.fn();
    const onRemove = jest.fn();
    await renderWithTheme(
      <ToggleChip
        label="Pets"
        selected
        onToggle={onToggle}
        onRemove={onRemove}
        removeLabel="Remove Pets"
        testID="pets"
      />,
    );

    // Both stay reachable for screen readers: the remove button is not nested in the checkbox.
    expect(screen.getByRole('checkbox', { name: 'Pets' })).toBeChecked();
    const remove = screen.getByRole('button', { name: 'Remove Pets' });
    expect(remove).toBe(screen.getByTestId('pets-remove'));
    expect(remove).toHaveStyle({ minWidth: sizes.minTouchTarget, minHeight: sizes.chipHeight });
    // The × is decoration; the button's label says what it does.
    expect(screen.queryByText('×')).toBeNull();
    expect(screen.getByText('×', { includeHiddenElements: true })).toHaveStyle({
      color: colors.textOnAccent,
    });

    fireEvent.press(remove);
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onToggle).not.toHaveBeenCalled();
  });
});
