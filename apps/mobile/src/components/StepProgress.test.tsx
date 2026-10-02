import { screen } from '@testing-library/react-native';

import { lightTheme } from '@/theme';
import { renderWithTheme } from '@/theme/testUtils';

import { StepProgress } from './StepProgress';

describe('StepProgress', () => {
  it('is a progress bar that reports the step and reads the translated label', async () => {
    await renderWithTheme(
      <StepProgress current={3} total={9} label="Step 3 of 9" testID="progress" />,
    );

    const bar = screen.getByRole('progressbar');
    expect(bar).toBe(screen.getByTestId('progress'));
    expect(bar).toHaveAccessibilityValue({ min: 1, max: 9, now: 3, text: 'Step 3 of 9' });
  });

  it('shows the label as a caption above the bar, hidden from screen readers', async () => {
    await renderWithTheme(<StepProgress current={1} total={4} label="Schritt 1 von 4" />);

    // The label is the value of the progress bar, so it is not also read as separate text.
    expect(screen.queryByText('Schritt 1 von 4')).toBeNull();
    expect(screen.getByText('Schritt 1 von 4', { includeHiddenElements: true })).toHaveStyle({
      fontSize: lightTheme.typography.variants.caption.fontSize,
      color: lightTheme.colors.textSecondary,
    });
  });

  it.each<[current: number, total: number, width: `${number}%`]>([
    [1, 4, '25%'],
    [2, 4, '50%'],
    [4, 4, '100%'],
    [1, 1, '100%'],
  ])('fills %i of %i as %s', async (current, total, width) => {
    await renderWithTheme(
      <StepProgress current={current} total={total} label="Step" testID="progress" />,
    );
    expect(screen.getByTestId('progress-fill')).toHaveStyle({ width });
  });

  it('draws a thin accent bar on the progress track, not a budget status colour', async () => {
    await renderWithTheme(<StepProgress current={3} total={9} label="Step" testID="progress" />);

    const fill = screen.getByTestId('progress-fill');
    expect(fill).toHaveStyle({ backgroundColor: lightTheme.colors.accent });
    expect(screen.getByTestId('progress-track')).toHaveStyle({
      height: lightTheme.sizes.stepProgressHeight,
      backgroundColor: lightTheme.colors.progressTrack,
    });
    expect(lightTheme.sizes.stepProgressHeight).toBeLessThan(lightTheme.sizes.progressBarHeight);
  });

  it.each<[current: number, total: number]>([
    [0, 9],
    [10, 9],
    [-1, 9],
    [1, 0],
    [1.5, 9],
    [Number.NaN, 9],
  ])('throws a RangeError for step %p of %p', async (current, total) => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(
      renderWithTheme(<StepProgress current={current} total={total} label="Step" />),
    ).rejects.toThrow(RangeError);
    consoleError.mockRestore();
  });
});
