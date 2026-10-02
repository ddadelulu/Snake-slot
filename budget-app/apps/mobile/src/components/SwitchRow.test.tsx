import { fireEvent, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { useColorScheme } from 'react-native';

import { darkTheme, lightTheme } from '@/theme';
import { renderWithTheme } from '@/theme/testUtils';

import { SwitchRow } from './SwitchRow';

function QuietHours({ onValueChange }: { onValueChange: jest.Mock }) {
  const [value, setValue] = useState(false);
  return (
    <SwitchRow
      label="Quiet hours"
      hint="No alerts at night"
      value={value}
      onValueChange={(next) => {
        setValue(next);
        onValueChange(next);
      }}
      testID="quiet"
    />
  );
}

describe('SwitchRow', () => {
  it('is one switch named by its label and hint', async () => {
    await renderWithTheme(<QuietHours onValueChange={jest.fn()} />);

    // The drawn switch is hidden, so screen readers meet exactly one switch: the row.
    const switches = screen.getAllByRole('switch');
    expect(switches).toHaveLength(1);
    expect(switches[0]).toBe(screen.getByTestId('quiet'));
    expect(switches[0]).toHaveAccessibleName('Quiet hours, No alerts at night');
    expect(switches[0]).not.toBeChecked();
    expect(screen.getByText('No alerts at night')).toHaveStyle({
      color: lightTheme.colors.textSecondary,
    });
  });

  it('toggles from a press anywhere on the row and reports the new value', async () => {
    const onValueChange = jest.fn();
    await renderWithTheme(<QuietHours onValueChange={onValueChange} />);

    fireEvent.press(screen.getByRole('switch', { name: 'Quiet hours, No alerts at night' }));
    expect(onValueChange).toHaveBeenLastCalledWith(true);
    expect(screen.getByRole('switch')).toBeChecked();
    expect(screen.getByTestId('quiet-switch', { includeHiddenElements: true })).toHaveProp(
      'value',
      true,
    );

    fireEvent.press(screen.getByRole('switch'));
    expect(onValueChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole('switch')).not.toBeChecked();
  });

  it('leaves touches to the row: the drawn switch takes none of its own', async () => {
    await renderWithTheme(<QuietHours onValueChange={jest.fn()} />);
    let node = screen.getByTestId('quiet-switch', { includeHiddenElements: true }).parent;
    while (node && node.props.pointerEvents === undefined) node = node.parent;
    expect(node?.props.pointerEvents).toBe('none');
  });

  it('draws the switch in the token colours', async () => {
    await renderWithTheme(
      <SwitchRow label="Alerts" value onValueChange={jest.fn()} testID="alerts" />,
    );
    const { colors } = lightTheme;
    const drawn = screen.getByTestId('alerts-switch', { includeHiddenElements: true });
    expect(drawn).toHaveProp('onTintColor', colors.switchTrackOn);
    expect(drawn).toHaveProp('tintColor', colors.switchTrackOff);
    expect(drawn).toHaveProp('thumbTintColor', colors.switchThumb);
    // iOS paints the "off" track from ios_backgroundColor.
    expect(drawn).toHaveStyle({ backgroundColor: colors.switchTrackOff });
  });

  it('switches to the dark colours with the system', async () => {
    jest.mocked(useColorScheme).mockReturnValue('dark');
    try {
      await renderWithTheme(
        <SwitchRow label="Alerts" value={false} onValueChange={jest.fn()} testID="alerts" />,
      );
      const { colors } = darkTheme;
      const drawn = screen.getByTestId('alerts-switch', { includeHiddenElements: true });
      expect(drawn).toHaveProp('onTintColor', colors.switchTrackOn);
      expect(drawn).toHaveProp('tintColor', colors.switchTrackOff);
      expect(drawn).toHaveProp('thumbTintColor', colors.switchThumb);
    } finally {
      jest.mocked(useColorScheme).mockReturnValue('light');
    }
  });

  it('ignores presses and reports the state when disabled', async () => {
    const onValueChange = jest.fn();
    await renderWithTheme(
      <SwitchRow label="Bank sync" value onValueChange={onValueChange} disabled testID="sync" />,
    );

    const row = screen.getByRole('switch', { name: 'Bank sync' });
    expect(row).toBeDisabled();
    expect(row).toBeChecked();
    expect(screen.getByText('Bank sync')).toHaveStyle({ color: lightTheme.colors.textDisabled });
    expect(screen.getByTestId('sync-switch', { includeHiddenElements: true })).toHaveProp(
      'disabled',
      true,
    );
    fireEvent.press(row);
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('is a full-height row without a hint', async () => {
    await renderWithTheme(
      <SwitchRow label="Alerts" value={false} onValueChange={jest.fn()} testID="alerts" />,
    );
    expect(screen.getByRole('switch', { name: 'Alerts' })).toHaveStyle({
      minHeight: lightTheme.sizes.rowHeight,
    });
  });
});
