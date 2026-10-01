import { fireEvent, screen } from '@testing-library/react-native';

import { renderWithTheme } from '@/theme/testUtils';

import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('shows a heading and message', async () => {
    await renderWithTheme(
      <EmptyState title="No transactions yet" message="Purchases appear here as you pay." />,
    );
    expect(screen.getByRole('header', { name: 'No transactions yet' })).toBeOnTheScreen();
    expect(screen.getByText('Purchases appear here as you pay.')).toBeOnTheScreen();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('offers an action when given one', async () => {
    const onAction = jest.fn();
    await renderWithTheme(
      <EmptyState
        title="No transactions yet"
        message="Purchases appear here as you pay."
        actionLabel="Add an expense"
        onAction={onAction}
      />,
    );
    fireEvent.press(screen.getByRole('button', { name: 'Add an expense' }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});
