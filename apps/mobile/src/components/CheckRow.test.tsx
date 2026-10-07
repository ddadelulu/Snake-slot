import { fireEvent, screen } from '@testing-library/react-native';

import { renderWithTheme } from '@/theme/testUtils';

import { CheckRow } from './CheckRow';

describe('CheckRow', () => {
  it('is one checkbox named by all of its text', async () => {
    const onToggle = jest.fn();
    await renderWithTheme(
      <CheckRow
        label="Exempla Kiosk"
        value="CHF 4.50"
        details={[
          { text: 'Wed, 30 Sept · Groceries' },
          { text: 'Needs a category', tone: 'warning' },
        ]}
        checked
        onToggle={onToggle}
        testID="row"
      />,
    );
    const row = screen.getByRole('checkbox', {
      name: 'Exempla Kiosk, CHF 4.50, Wed, 30 Sept · Groceries, Needs a category',
    });
    expect(row).toBeChecked();
    expect(screen.getByTestId('row-value')).toHaveTextContent('CHF 4.50');
    expect(screen.getByText('✓')).toBeOnTheScreen();
    fireEvent.press(row);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('shows an unchecked box without a mark', async () => {
    await renderWithTheme(<CheckRow label="Exempla Bar" checked={false} onToggle={jest.fn()} />);
    expect(screen.getByRole('checkbox', { name: 'Exempla Bar' })).not.toBeChecked();
    expect(screen.queryByText('✓')).toBeNull();
  });

  it('cannot be changed when disabled', async () => {
    const onToggle = jest.fn();
    await renderWithTheme(
      <CheckRow
        label="Fictiva Lohn"
        details={[{ text: 'Imported before', testID: 'row-status' }]}
        checked={false}
        disabled
        onToggle={onToggle}
        testID="row"
      />,
    );
    const row = screen.getByTestId('row');
    expect(row).toBeDisabled();
    fireEvent.press(row);
    expect(onToggle).not.toHaveBeenCalled();
    expect(screen.getByTestId('row-status')).toHaveTextContent('Imported before');
  });
});
