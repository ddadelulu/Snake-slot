import { screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { lightTheme } from '@/theme';
import { renderWithTheme } from '@/theme/testUtils';

import { Screen } from './Screen';

const gutter = lightTheme.layout.screenPadding;
const insets = { top: 47, bottom: 34, left: 0, right: 0 };

describe('Screen', () => {
  it('draws the theme background with a title announced as a header', async () => {
    await renderWithTheme(
      <Screen title="Settings" testID="screen">
        <Text>Body</Text>
      </Screen>,
    );
    expect(screen.getByTestId('screen')).toHaveStyle({
      backgroundColor: lightTheme.colors.background,
    });
    expect(screen.getByRole('header', { name: 'Settings' })).toBeOnTheScreen();
    expect(screen.getByText('Body')).toBeOnTheScreen();
  });

  it('pads the content by the safe area plus the screen gutter', async () => {
    await renderWithTheme(
      <Screen testID="screen">
        <Text>Body</Text>
      </Screen>,
      { insets },
    );
    expect(screen.getByTestId('screen-content')).toHaveStyle({
      paddingTop: insets.top + gutter,
      paddingBottom: insets.bottom + gutter,
      paddingLeft: gutter,
      paddingRight: gutter,
    });
  });

  it('skips safe-area edges a navigation header already covers', async () => {
    await renderWithTheme(
      <Screen edges={['bottom']} testID="screen">
        <Text>Body</Text>
      </Screen>,
      { insets },
    );
    expect(screen.getByTestId('screen-content')).toHaveStyle({
      paddingTop: gutter,
      paddingBottom: insets.bottom + gutter,
    });
  });

  it('scrolls when asked and pins the footer above the home indicator', async () => {
    await renderWithTheme(
      <Screen scroll footer={<Text>Continue</Text>} testID="screen">
        <Text>Form</Text>
      </Screen>,
      { insets },
    );
    const scroll = screen.getByTestId('screen-scroll');
    expect(scroll).toHaveProp('keyboardShouldPersistTaps', 'handled');
    expect(screen.getByText('Form')).toBeOnTheScreen();
    expect(screen.getByTestId('screen-footer')).toHaveStyle({
      paddingBottom: insets.bottom + gutter,
    });
    // The footer owns the bottom inset, so the scroll content only keeps the gutter.
    expect(scroll.props.contentContainerStyle).toEqual(
      expect.arrayContaining([expect.objectContaining({ paddingBottom: gutter })]),
    );
  });
});
