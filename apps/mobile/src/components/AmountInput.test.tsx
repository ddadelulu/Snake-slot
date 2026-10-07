import { fireEvent, screen } from '@testing-library/react-native';
import { useState } from 'react';

import { lightTheme } from '@/theme';
import { renderWithTheme } from '@/theme/testUtils';

import { AmountInput } from './AmountInput';

const { colors, typography } = lightTheme;

function Field({ onChange }: { onChange?: (text: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <AmountInput
      label="Amount"
      currency="CHF"
      value={value}
      onChangeText={(text) => {
        setValue(text);
        onChange?.(text);
      }}
      testID="amount"
    />
  );
}

describe('AmountInput', () => {
  it('names the field with its label and currency and offers a decimal keyboard', async () => {
    await renderWithTheme(<Field />);
    const input = screen.getByLabelText('Amount, CHF');
    expect(input).toHaveProp('keyboardType', 'decimal-pad');
    expect(input).toHaveProp('inputMode', 'decimal');
    expect(screen.getByText('CHF', { includeHiddenElements: true })).toBeOnTheScreen();
  });

  it('keeps what the person types, Swiss notation included', async () => {
    const onChange = jest.fn();
    await renderWithTheme(<Field onChange={onChange} />);
    fireEvent.changeText(screen.getByTestId('amount'), "1'240.50");
    expect(onChange).toHaveBeenCalledWith("1'240.50");
    expect(screen.getByTestId('amount')).toHaveProp('value', "1'240.50");
  });

  it('shows an error under the field and turns the border red', async () => {
    await renderWithTheme(
      <AmountInput
        label="Amount"
        currency="CHF"
        value="abc"
        onChangeText={jest.fn()}
        error="Enter an amount."
        testID="amount"
      />,
    );
    expect(screen.getByTestId('amount-error')).toHaveTextContent('Enter an amount.');
    expect(screen.getByTestId('amount')).toHaveProp('accessibilityHint', 'Enter an amount.');
    expect(screen.getByTestId('amount-frame')).toHaveStyle({ borderColor: colors.statusDanger });
  });

  it('shows the hint while there is no error', async () => {
    await renderWithTheme(
      <AmountInput
        label="Amount"
        currency="CHF"
        value=""
        onChangeText={jest.fn()}
        hint="Without the sign"
        testID="amount"
      />,
    );
    expect(screen.getByText('Without the sign')).toBeOnTheScreen();
    expect(screen.queryByTestId('amount-error')).toBeNull();
  });

  it('highlights the frame while focused', async () => {
    await renderWithTheme(<Field />);
    fireEvent(screen.getByTestId('amount'), 'focus');
    expect(screen.getByTestId('amount-frame')).toHaveStyle({ borderColor: colors.focus });
    fireEvent(screen.getByTestId('amount'), 'blur');
    expect(screen.getByTestId('amount-frame')).toHaveStyle({ borderColor: colors.borderStrong });
  });

  it('uses large tabular figures for the main amount of a screen', async () => {
    await renderWithTheme(
      <AmountInput
        label="Amount"
        currency="CHF"
        value="12"
        onChangeText={jest.fn()}
        size="large"
        testID="amount"
      />,
    );
    expect(screen.getByTestId('amount')).toHaveStyle({
      fontSize: typography.variants.title.fontSize,
      fontVariant: typography.tabularNumbers,
    });
  });

  it('can be read-only', async () => {
    await renderWithTheme(
      <AmountInput
        label="Amount"
        currency="CHF"
        value="12"
        onChangeText={jest.fn()}
        editable={false}
        testID="amount"
      />,
    );
    expect(screen.getByTestId('amount')).toHaveProp('editable', false);
    expect(screen.getByTestId('amount-frame')).toHaveStyle({
      backgroundColor: colors.surfaceMuted,
    });
  });
});
