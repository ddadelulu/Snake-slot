import { chf } from '@budget/core';
import { screen } from '@testing-library/react-native';

import { lightTheme, type ColorRoles } from '@/theme';
import { renderWithTheme } from '@/theme/testUtils';

import { ProgressBar } from './ProgressBar';

const BUDGET = chf(100);

describe('ProgressBar', () => {
  it.each<[label: string, spent: number, width: `${number}%`, now: number, role: keyof ColorRoles]>(
    [
      ['nothing spent', 0, '0%', 0, 'statusOk'],
      ['79.99 % spent', 7999, '79.9%', 79, 'statusOk'],
      ['80 % spent', 8000, '80%', 80, 'statusWarning'],
      ['100 % spent', 10000, '100%', 100, 'statusDanger'],
      ['over budget', 13050, '100%', 100, 'statusDanger'],
    ],
  )('%s: fill %s wide in %s', async (_label, spent, width, now, role) => {
    await renderWithTheme(
      <ProgressBar spent={spent} budget={BUDGET} accessibilityLabel="Groceries" testID="bar" />,
    );

    const bar = screen.getByRole('progressbar', { name: 'Groceries' });
    expect(bar).toHaveAccessibilityValue({ min: 0, max: 100, now });
    expect(screen.getByTestId('bar-fill')).toHaveStyle({
      width,
      backgroundColor: lightTheme.colors[role],
    });
  });

  it('shows a refund (negative spending) as an empty green bar', async () => {
    await renderWithTheme(<ProgressBar spent={-chf(5)} budget={BUDGET} testID="bar" />);
    expect(screen.getByTestId('bar-fill')).toHaveStyle({
      width: '0%',
      backgroundColor: lightTheme.colors.statusOk,
    });
  });

  it('shows spending without a budget as a full red bar', async () => {
    await renderWithTheme(<ProgressBar spent={chf(1)} budget={0} testID="bar" />);
    expect(screen.getByTestId('bar-fill')).toHaveStyle({
      width: '100%',
      backgroundColor: lightTheme.colors.statusDanger,
    });
  });

  it('draws on the progress track token', async () => {
    await renderWithTheme(<ProgressBar spent={0} budget={BUDGET} testID="bar" />);
    expect(screen.getByTestId('bar')).toHaveStyle({
      backgroundColor: lightTheme.colors.progressTrack,
      height: lightTheme.sizes.progressBarHeight,
    });
  });
});
