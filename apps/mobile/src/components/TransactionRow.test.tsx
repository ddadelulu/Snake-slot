import { chf } from '@budget/core';
import { fireEvent, screen } from '@testing-library/react-native';

import { lightTheme } from '@/theme';
import { renderWithTheme } from '@/theme/testUtils';

import { TransactionRow, transactionAmountText } from './TransactionRow';

describe('transactionAmountText', () => {
  it.each([
    [-chf(1240, 50), 'de', 'CHF 1’240.50'],
    [-chf(1240, 50), 'en', 'CHF 1,240.50'],
    [chf(1240, 50), 'de', 'CHF +1’240.50'],
    [chf(1240, 50), 'en', 'CHF +1,240.50'],
    [-5, 'de', 'CHF 0.05'],
    [0, 'en', 'CHF 0.00'],
  ] as const)('%i Rappen in %s reads "%s"', (amount, language, expected) => {
    expect(transactionAmountText(amount, language)).toBe(expected);
  });
});

describe('TransactionRow', () => {
  it('shows money out without a minus, in the normal text colour (de)', async () => {
    await renderWithTheme(
      <TransactionRow
        merchant="Migros"
        amount={-chf(1240, 50)}
        language="de"
        subtitle="Lebensmittel · 3. Okt."
        testID="tx"
      />,
    );

    const amount = screen.getByTestId('tx-amount');
    expect(amount).toHaveTextContent('CHF 1’240.50');
    expect(amount).toHaveStyle({
      color: lightTheme.colors.textPrimary,
      fontVariant: ['tabular-nums'],
    });
    expect(screen.getByText('Migros')).toBeOnTheScreen();
    expect(screen.getByText('Lebensmittel · 3. Okt.')).toBeOnTheScreen();
    expect(screen.getByLabelText('Migros, Lebensmittel · 3. Okt., CHF 1’240.50')).toBeOnTheScreen();
  });

  it('shows money out without a minus (en)', async () => {
    await renderWithTheme(
      <TransactionRow merchant="Coop" amount={-chf(1240, 50)} language="en" testID="tx" />,
    );
    expect(screen.getByTestId('tx-amount')).toHaveTextContent('CHF 1,240.50');
    expect(screen.getByLabelText('Coop, CHF 1,240.50')).toBeOnTheScreen();
  });

  it.each([
    ['de', 'CHF +1’240.50'],
    ['en', 'CHF +1,240.50'],
  ] as const)('shows money in with a plus in green (%s)', async (language, expected) => {
    await renderWithTheme(
      <TransactionRow merchant="Refund" amount={chf(1240, 50)} language={language} testID="tx" />,
    );
    expect(screen.getByTestId('tx-amount')).toHaveTextContent(expected);
    expect(screen.getByTestId('tx-amount')).toHaveStyle({ color: lightTheme.colors.statusOk });
  });

  it('is a button only when it has onPress', async () => {
    const onPress = jest.fn();
    const { rerender } = await renderWithTheme(
      <TransactionRow merchant="SBB" amount={-chf(4, 40)} language="en" />,
    );
    expect(screen.queryByRole('button')).toBeNull();

    rerender(
      <TransactionRow merchant="SBB" amount={-chf(4, 40)} language="en" onPress={onPress} />,
    );
    fireEvent.press(screen.getByRole('button', { name: 'SBB, CHF 4.40' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('says what pressing it does', async () => {
    await renderWithTheme(
      <TransactionRow
        merchant="SBB"
        amount={-chf(4, 40)}
        language="en"
        onPress={jest.fn()}
        accessibilityHint="Shows the details"
      />,
    );
    expect(screen.getByRole('button', { name: 'SBB, CHF 4.40' })).toHaveProp(
      'accessibilityHint',
      'Shows the details',
    );
  });
});
