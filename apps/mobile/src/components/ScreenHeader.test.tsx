import { fireEvent, screen } from '@testing-library/react-native';

import { renderWithTheme } from '@/theme/testUtils';

import { ScreenHeader } from './ScreenHeader';
import { TextLink } from './TextLink';

describe('ScreenHeader', () => {
  it('goes back', async () => {
    const onBack = jest.fn();
    await renderWithTheme(<ScreenHeader backLabel="Back" onBack={onBack} testID="detail-header" />);
    fireEvent.press(screen.getByTestId('detail-header-back'));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: 'Back' })).toBeOnTheScreen();
  });

  it('shows an action on the right', async () => {
    const onDelete = jest.fn();
    await renderWithTheme(
      <ScreenHeader
        backLabel="Cancel"
        onBack={jest.fn()}
        right={<TextLink label="Delete" onPress={onDelete} />}
      />,
    );
    fireEvent.press(screen.getByRole('link', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
