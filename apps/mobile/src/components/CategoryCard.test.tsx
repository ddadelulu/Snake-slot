import { chf } from '@budget/core';
import { fireEvent, screen } from '@testing-library/react-native';

import { lightTheme } from '@/theme';
import { renderWithTheme } from '@/theme/testUtils';

import { CategoryCard } from './CategoryCard';

const labels = { remainingLabel: 'left', overLabel: 'over' };

describe('CategoryCard', () => {
  it('shows what is left of the budget and a progress bar', async () => {
    await renderWithTheme(
      <CategoryCard
        name="Groceries"
        spent={chf(380)}
        budget={chf(500)}
        language="en"
        {...labels}
        testID="groceries"
      />,
    );

    expect(screen.getByText('Groceries')).toBeOnTheScreen();
    expect(screen.getByText('CHF 120.00 left')).toHaveStyle({
      color: lightTheme.colors.textPrimary,
      fontVariant: ['tabular-nums'],
    });
    expect(screen.getByText('/ CHF 500.00')).toBeOnTheScreen();
    expect(screen.getByTestId('groceries-progress-fill')).toHaveStyle({
      width: '76%',
      backgroundColor: lightTheme.colors.statusOk,
    });
    expect(screen.getByLabelText('Groceries, CHF 120.00 left / CHF 500.00')).toBeOnTheScreen();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows the overspent amount in red with the over label', async () => {
    await renderWithTheme(
      <CategoryCard
        name="Ausgang"
        spent={chf(1330, 50)}
        budget={chf(1200)}
        language="de"
        remainingLabel="übrig"
        overLabel="zu viel"
        testID="going-out"
      />,
    );

    expect(screen.getByText('CHF 130.50 zu viel')).toHaveStyle({
      color: lightTheme.colors.statusDanger,
    });
    expect(screen.getByText('/ CHF 1’200.00')).toBeOnTheScreen();
    expect(screen.queryByText(/übrig/)).toBeNull();
    expect(screen.getByTestId('going-out-progress-fill')).toHaveStyle({
      width: '100%',
      backgroundColor: lightTheme.colors.statusDanger,
    });
  });

  it('turns the bar orange from 80 % while still showing what is left', async () => {
    await renderWithTheme(
      <CategoryCard
        name="Clothes"
        spent={chf(80)}
        budget={chf(100)}
        language="en"
        {...labels}
        testID="clothes"
      />,
    );
    expect(screen.getByText('CHF 20.00 left')).toBeOnTheScreen();
    expect(screen.getByTestId('clothes-progress-fill')).toHaveStyle({
      backgroundColor: lightTheme.colors.statusWarning,
    });
  });

  it('shows exactly-spent as nothing left with a red bar', async () => {
    await renderWithTheme(
      <CategoryCard
        name="Gifts"
        spent={chf(50)}
        budget={chf(50)}
        language="en"
        {...labels}
        testID="gifts"
      />,
    );
    expect(screen.getByText('CHF 0.00 left')).toBeOnTheScreen();
    expect(screen.getByTestId('gifts-progress-fill')).toHaveStyle({
      backgroundColor: lightTheme.colors.statusDanger,
    });
  });

  it('becomes a button when it has onPress', async () => {
    const onPress = jest.fn();
    await renderWithTheme(
      <CategoryCard
        name="Groceries"
        spent={chf(10)}
        budget={chf(500)}
        language="en"
        {...labels}
        onPress={onPress}
      />,
    );
    fireEvent.press(
      screen.getByRole('button', { name: 'Groceries, CHF 490.00 left / CHF 500.00' }),
    );
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
