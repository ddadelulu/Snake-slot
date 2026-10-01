import { act, fireEvent, screen } from '@testing-library/react-native';
import { createRef } from 'react';
import { AccessibilityInfo, Platform, type TextInput } from 'react-native';

import { lightTheme } from '@/theme';
import { renderWithTheme } from '@/theme/testUtils';

import { TextField } from './TextField';

const { colors, borderWidths } = lightTheme;
const announce = jest.mocked(AccessibilityInfo.announceForAccessibility);

beforeEach(() => announce.mockClear());

describe('TextField', () => {
  it('labels the input and reports typed text', async () => {
    const onChangeText = jest.fn();
    await renderWithTheme(
      <TextField label="Email" value="" onChangeText={onChangeText} testID="email" />,
    );

    expect(screen.getByText('Email')).toBeOnTheScreen();
    const input = screen.getByLabelText('Email');
    expect(input).toBe(screen.getByTestId('email'));
    fireEvent.changeText(input, 'anna@example.ch');
    expect(onChangeText).toHaveBeenCalledWith('anna@example.ch');
  });

  it('passes keyboard and autofill props through to the input', async () => {
    const onSubmitEditing = jest.fn();
    await renderWithTheme(
      <TextField
        label="Email"
        value=""
        onChangeText={jest.fn()}
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        autoCapitalize="none"
        returnKeyType="next"
        onSubmitEditing={onSubmitEditing}
        testID="email"
      />,
    );

    const input = screen.getByTestId('email');
    expect(input).toHaveProp('autoComplete', 'email');
    expect(input).toHaveProp('keyboardType', 'email-address');
    expect(input).toHaveProp('textContentType', 'emailAddress');
    expect(input).toHaveProp('autoCapitalize', 'none');
    expect(input).toHaveProp('returnKeyType', 'next');
    expect(input).toHaveProp('keyboardAppearance', 'light');
    fireEvent(input, 'submitEditing');
    expect(onSubmitEditing).toHaveBeenCalledTimes(1);
  });

  it('shows, announces and marks an error', async () => {
    const { rerender } = await renderWithTheme(
      <TextField label="Email" value="anna" onChangeText={jest.fn()} testID="email" />,
    );
    expect(screen.queryByTestId('email-error')).toBeNull();
    expect(announce).not.toHaveBeenCalled();

    rerender(
      <TextField
        label="Email"
        value="anna"
        onChangeText={jest.fn()}
        error="Enter a valid email address."
        testID="email"
      />,
    );

    const message = screen.getByTestId('email-error');
    expect(message).toHaveTextContent('Enter a valid email address.');
    expect(message).toHaveStyle({ color: colors.statusDanger });
    expect(message.props.accessibilityLiveRegion).toBe('polite');
    expect(screen.getByHintText('Enter a valid email address.')).toBe(screen.getByTestId('email'));
    expect(screen.getByTestId('email-frame')).toHaveStyle({
      borderColor: colors.statusDanger,
      borderWidth: borderWidths.thick,
    });
    expect(Platform.OS).toBe('ios');
    expect(announce).toHaveBeenCalledWith('Enter a valid email address.');
  });

  it('shows the hint while there is no error', async () => {
    await renderWithTheme(
      <TextField
        label="Password"
        value=""
        onChangeText={jest.fn()}
        hint="At least 10 characters"
      />,
    );
    expect(screen.getByText('At least 10 characters')).toBeOnTheScreen();
    expect(screen.getByHintText('At least 10 characters')).toBe(screen.getByLabelText('Password'));
  });

  it('hides a secure entry until the toggle reveals it', async () => {
    await renderWithTheme(
      <TextField
        label="Password"
        value="correct horse"
        onChangeText={jest.fn()}
        secureTextEntry
        showLabel="Show"
        hideLabel="Hide"
        testID="password"
      />,
    );

    const input = screen.getByTestId('password');
    expect(input).toHaveProp('secureTextEntry', true);

    fireEvent.press(screen.getByRole('button', { name: 'Show' }));
    expect(screen.getByTestId('password')).toHaveProp('secureTextEntry', false);
    expect(screen.getByDisplayValue('correct horse')).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('button', { name: 'Hide' }));
    expect(screen.getByTestId('password')).toHaveProp('secureTextEntry', true);
    expect(screen.getByTestId('password-visibility')).toHaveStyle({
      minHeight: lightTheme.sizes.minTouchTarget,
      minWidth: lightTheme.sizes.minTouchTarget,
    });
  });

  it('has no toggle for normal fields', async () => {
    await renderWithTheme(<TextField label="Name" value="" onChangeText={jest.fn()} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByLabelText('Name')).toHaveProp('secureTextEntry', false);
  });

  it('highlights the field while focused and forwards focus events', async () => {
    const onFocus = jest.fn();
    const onBlur = jest.fn();
    await renderWithTheme(
      <TextField
        label="Name"
        value=""
        onChangeText={jest.fn()}
        onFocus={onFocus}
        onBlur={onBlur}
        testID="name"
      />,
    );

    const input = screen.getByTestId('name');
    act(() => fireEvent(input, 'focus'));
    expect(onFocus).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('name-frame')).toHaveStyle({
      borderColor: colors.focus,
      borderWidth: borderWidths.thick,
    });

    act(() => fireEvent(input, 'blur'));
    expect(onBlur).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('name-frame')).toHaveStyle({ borderColor: colors.borderStrong });
  });

  it('reports a read-only field as disabled', async () => {
    await renderWithTheme(
      <TextField
        label="IBAN"
        value="CH93 0076 2011 6238 5295 7"
        onChangeText={jest.fn()}
        editable={false}
      />,
    );
    expect(screen.getByLabelText('IBAN')).toBeDisabled();
  });

  it('exposes the input through ref for focus chaining', async () => {
    const ref = createRef<TextInput>();
    await renderWithTheme(<TextField label="Name" value="" onChangeText={jest.fn()} ref={ref} />);
    expect(ref.current).not.toBeNull();
  });
});
