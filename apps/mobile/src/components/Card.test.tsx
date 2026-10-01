import { screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { lightTheme } from '@/theme';
import { renderWithTheme } from '@/theme/testUtils';

import { Card } from './Card';
import { Divider } from './Divider';

describe('Card', () => {
  it('draws a padded surface from the tokens', async () => {
    await renderWithTheme(
      <Card testID="card">
        <Text>Inside</Text>
      </Card>,
    );
    expect(screen.getByTestId('card')).toHaveStyle({
      backgroundColor: lightTheme.colors.surface,
      borderColor: lightTheme.colors.border,
      borderRadius: lightTheme.radii.lg,
      padding: lightTheme.layout.cardPadding,
    });
    expect(screen.getByText('Inside')).toBeOnTheScreen();
  });

  it('can drop the padding for edge-to-edge rows', async () => {
    await renderWithTheme(<Card testID="card" padded={false} />);
    expect(screen.getByTestId('card')).not.toHaveStyle({ padding: lightTheme.layout.cardPadding });
  });
});

describe('Divider', () => {
  it('is a hairline in the border colour, hidden from screen readers', async () => {
    await renderWithTheme(<Divider testID="divider" inset />);
    expect(screen.queryByTestId('divider')).toBeNull();
    const divider = screen.getByTestId('divider', { includeHiddenElements: true });
    expect(divider).toHaveStyle({
      height: lightTheme.borderWidths.hairline,
      backgroundColor: lightTheme.colors.border,
      marginStart: lightTheme.layout.cardPadding,
    });
  });
});
