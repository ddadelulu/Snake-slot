import { fireEvent, screen } from '@testing-library/react-native';
import { useState } from 'react';

import { lightTheme } from '@/theme';
import { renderWithTheme } from '@/theme/testUtils';

import { SearchField } from './SearchField';

function Search({ onChange }: { onChange: (text: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <SearchField
      value={value}
      onChangeText={(text) => {
        setValue(text);
        onChange(text);
      }}
      label="Search transactions"
      placeholder="Merchant or note"
      clearLabel="Clear search"
      testID="search"
    />
  );
}

describe('SearchField', () => {
  it('is a search box named by its label, with a placeholder', async () => {
    await renderWithTheme(<Search onChange={jest.fn()} />);
    const input = screen.getByLabelText('Search transactions');
    expect(input).toHaveProp('accessibilityRole', 'search');
    expect(input).toHaveProp('placeholder', 'Merchant or note');
    expect(input).toHaveProp('returnKeyType', 'search');
  });

  it('reports typing and offers a clear button once there is text', async () => {
    const onChange = jest.fn();
    await renderWithTheme(<Search onChange={onChange} />);
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull();
    fireEvent.changeText(screen.getByTestId('search'), 'manor');
    expect(onChange).toHaveBeenLastCalledWith('manor');

    const clear = screen.getByRole('button', { name: 'Clear search' });
    expect(screen.getByTestId('search-clear')).toHaveStyle({
      minWidth: lightTheme.sizes.minTouchTarget,
      minHeight: lightTheme.sizes.minTouchTarget,
    });
    fireEvent.press(clear);
    expect(onChange).toHaveBeenLastCalledWith('');
    expect(screen.getByTestId('search')).toHaveProp('value', '');
  });
});
