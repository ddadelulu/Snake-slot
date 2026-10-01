import { chf } from '@budget/core';
import { screen } from '@testing-library/react-native';

import { lightTheme } from '@/theme';
import { renderWithTheme } from '@/theme/testUtils';

import { BalanceHeader } from './BalanceHeader';

describe('BalanceHeader', () => {
  it('shows the remaining money as a big number with every part in one accessible label', async () => {
    await renderWithTheme(
      <BalanceHeader
        remaining={chf(1240, 50)}
        language="de"
        label="übrig diesen Monat"
        dailyAllowance={chf(41, 35)}
        dailyAllowanceLabel="pro Tag"
        daysUntilPayday={12}
        daysUntilPaydayLabel="Tage bis Zahltag"
        testID="balance"
      />,
    );

    const balance = screen.getByTestId('balance-balance');
    expect(balance).toHaveTextContent('CHF 1’240.50');
    expect(balance).toHaveStyle({
      color: lightTheme.colors.textPrimary,
      fontSize: lightTheme.typography.variants.display.fontSize,
      fontVariant: ['tabular-nums'],
    });
    const cap = lightTheme.typography.variants.display.maxFontSizeMultiplier;
    expect(balance.props.maxFontSizeMultiplier).toBe(cap);
    // The smaller "CHF" is capped like the number, so it never outgrows it at huge text sizes.
    const currency = screen.getByText('CHF');
    expect(currency).not.toBe(balance);
    expect(currency.props.maxFontSizeMultiplier).toBe(cap);
    expect(screen.getByText('übrig diesen Monat')).toBeOnTheScreen();
    expect(screen.getByText('CHF 41.35')).toBeOnTheScreen();
    expect(screen.getByText('pro Tag')).toBeOnTheScreen();
    expect(screen.getByText('12')).toBeOnTheScreen();
    expect(screen.getByText('Tage bis Zahltag')).toBeOnTheScreen();

    const summary = screen.getByRole('summary');
    expect(summary).toHaveAccessibleName(
      'CHF 1’240.50 übrig diesen Monat, CHF 41.35 pro Tag, 12 Tage bis Zahltag',
    );
  });

  it('shows a negative balance in red', async () => {
    await renderWithTheme(
      <BalanceHeader
        remaining={-chf(85, 20)}
        language="en"
        label="left this month"
        testID="balance"
      />,
    );

    const balance = screen.getByTestId('balance-balance');
    expect(balance).toHaveTextContent('CHF -85.20');
    expect(balance).toHaveStyle({ color: lightTheme.colors.statusDanger });
    expect(screen.getByRole('summary')).toHaveAccessibleName('CHF -85.20 left this month');
  });

  it('uses the English thousands separator', async () => {
    await renderWithTheme(
      <BalanceHeader remaining={chf(12345, 5)} language="en" label="left" testID="balance" />,
    );
    expect(screen.getByTestId('balance-balance')).toHaveTextContent('CHF 12,345.05');
  });

  it('leaves out the facts whose value or label is missing', async () => {
    await renderWithTheme(
      <BalanceHeader
        remaining={chf(100)}
        language="en"
        label="left this month"
        dailyAllowance={chf(5)}
        daysUntilPayday={3}
        daysUntilPaydayLabel="days to payday"
      />,
    );
    expect(screen.queryByText('CHF 5.00')).toBeNull();
    expect(screen.getByText('days to payday')).toBeOnTheScreen();
    expect(screen.getByRole('summary')).toHaveAccessibleName(
      'CHF 100.00 left this month, 3 days to payday',
    );
  });

  it('shows a negative daily allowance in red', async () => {
    await renderWithTheme(
      <BalanceHeader
        remaining={-chf(10)}
        language="en"
        label="left"
        dailyAllowance={-chf(2)}
        dailyAllowanceLabel="per day"
      />,
    );
    expect(screen.getByText('CHF -2.00')).toHaveStyle({ color: lightTheme.colors.statusDanger });
  });
});
