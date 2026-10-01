import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react-native';
import { Component, type ReactNode } from 'react';
import { Text, useColorScheme } from 'react-native';

import { renderWithTheme } from './testUtils';
import {
  APPEARANCE_STORAGE_KEY,
  ThemeProvider,
  isAppearancePreference,
  resolveColorScheme,
  useAppearance,
  useTheme,
} from './ThemeProvider';
import { darkTheme, lightTheme } from './tokens';

const mockedColorScheme = jest.mocked(useColorScheme);

/** Shows the message of an error thrown while rendering its children. */
class ErrorMessage extends Component<{ children: ReactNode }, { message: string | null }> {
  override state = { message: null as string | null };

  static getDerivedStateFromError(error: Error) {
    return { message: error.message };
  }

  override render() {
    return this.state.message === null ? this.props.children : <Text>{this.state.message}</Text>;
  }
}

function wrapper({ children }: { children: ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}

async function renderAppearance() {
  const hook = renderHook(() => useAppearance(), { wrapper });
  await waitFor(() => expect(hook.result.current.loaded).toBe(true));
  return hook;
}

beforeEach(async () => {
  await AsyncStorage.clear();
  mockedColorScheme.mockReturnValue('light');
});

afterEach(() => {
  mockedColorScheme.mockReturnValue('light');
  jest.restoreAllMocks();
});

describe('resolveColorScheme', () => {
  it('follows the system for "system" and falls back to light when the system says nothing', () => {
    expect(resolveColorScheme('system', 'dark')).toBe('dark');
    expect(resolveColorScheme('system', 'light')).toBe('light');
    expect(resolveColorScheme('system', 'unspecified')).toBe('light');
    expect(resolveColorScheme('system', null)).toBe('light');
  });

  it('lets an explicit choice override the system', () => {
    expect(resolveColorScheme('light', 'dark')).toBe('light');
    expect(resolveColorScheme('dark', 'light')).toBe('dark');
  });
});

describe('isAppearancePreference', () => {
  it('accepts only the three known values', () => {
    expect(['system', 'light', 'dark'].every(isAppearancePreference)).toBe(true);
    expect(isAppearancePreference('auto')).toBe(false);
    expect(isAppearancePreference(null)).toBe(false);
    expect(isAppearancePreference(1)).toBe(false);
  });
});

describe('ThemeProvider', () => {
  it('starts on "system" and resolves the light system scheme', async () => {
    const { result } = await renderAppearance();
    expect(result.current.preference).toBe('system');
    expect(result.current.scheme).toBe('light');
    expect(result.current.theme).toBe(lightTheme);
  });

  it('resolves the dark system scheme', async () => {
    mockedColorScheme.mockReturnValue('dark');
    const { result } = await renderAppearance();
    expect(result.current.scheme).toBe('dark');
    expect(result.current.theme).toBe(darkTheme);
  });

  it('follows the system when it switches while the preference is "system"', async () => {
    const { result, rerender } = await renderAppearance();
    expect(result.current.scheme).toBe('light');
    mockedColorScheme.mockReturnValue('dark');
    rerender({});
    expect(result.current.scheme).toBe('dark');
    expect(result.current.theme).toBe(darkTheme);
  });

  it('loads a saved preference on mount', async () => {
    await AsyncStorage.setItem(APPEARANCE_STORAGE_KEY, 'dark');
    const { result } = await renderAppearance();
    expect(AsyncStorage.getItem).toHaveBeenCalledWith(APPEARANCE_STORAGE_KEY);
    expect(result.current.preference).toBe('dark');
    expect(result.current.scheme).toBe('dark');
  });

  it('treats an invalid saved value as "system"', async () => {
    await AsyncStorage.setItem(APPEARANCE_STORAGE_KEY, 'sepia');
    mockedColorScheme.mockReturnValue('dark');
    const { result } = await renderAppearance();
    expect(result.current.preference).toBe('system');
    expect(result.current.scheme).toBe('dark');
  });

  it('treats unreadable storage as "system"', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('disk full'));
    const { result } = await renderAppearance();
    expect(result.current.preference).toBe('system');
    expect(result.current.loaded).toBe(true);
  });

  it('applies and persists a new preference, overriding the system scheme', async () => {
    mockedColorScheme.mockReturnValue('dark');
    const { result } = await renderAppearance();

    await act(() => result.current.setPreference('light'));
    expect(result.current.preference).toBe('light');
    expect(result.current.scheme).toBe('light');
    expect(await AsyncStorage.getItem(APPEARANCE_STORAGE_KEY)).toBe('light');

    await act(() => result.current.setPreference('system'));
    expect(result.current.scheme).toBe('dark');
    expect(await AsyncStorage.getItem(APPEARANCE_STORAGE_KEY)).toBe('system');
  });

  it('keeps the new preference for the session when saving fails', async () => {
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('disk full'));
    const { result } = await renderAppearance();
    await act(() => result.current.setPreference('dark'));
    expect(result.current.preference).toBe('dark');
    expect(result.current.theme).toBe(darkTheme);
  });

  it('rejects unknown preference values', async () => {
    const { result } = await renderAppearance();
    await expect(
      result.current.setPreference(
        'sepia' as unknown as Parameters<typeof result.current.setPreference>[0],
      ),
    ).rejects.toThrow('Unknown appearance preference "sepia"');
    expect(result.current.preference).toBe('system');
  });

  it('lets a choice made during the initial load win over the saved value', async () => {
    await AsyncStorage.setItem(APPEARANCE_STORAGE_KEY, 'dark');
    let releaseLoad: (value: string | null) => void = () => {};
    jest.spyOn(AsyncStorage, 'getItem').mockImplementationOnce(
      () =>
        new Promise<string | null>((resolve) => {
          releaseLoad = resolve;
        }),
    );
    const { result } = renderHook(() => useAppearance(), { wrapper });
    expect(result.current.loaded).toBe(false);

    await act(() => result.current.setPreference('light'));
    await act(async () => {
      releaseLoad('dark');
    });

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.preference).toBe('light');
  });

  it('gives children the theme through useTheme()', async () => {
    function Probe() {
      const theme = useTheme();
      return <Text>{`scheme:${theme.scheme}`}</Text>;
    }
    await renderWithTheme(<Probe />);
    expect(screen.getByText('scheme:light')).toBeOnTheScreen();
  });

  it('throws a clear error when a hook is used outside the provider', () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    function ThemeProbe() {
      useTheme();
      return null;
    }
    function AppearanceProbe() {
      useAppearance();
      return null;
    }
    render(
      <ErrorMessage>
        <ThemeProbe />
      </ErrorMessage>,
    );
    expect(
      screen.getByText('useTheme() must be used inside <ThemeProvider>. Wrap the app root in it.'),
    ).toBeOnTheScreen();
    render(
      <ErrorMessage>
        <AppearanceProbe />
      </ErrorMessage>,
    );
    expect(
      screen.getByText(/^useAppearance\(\) must be used inside <ThemeProvider>/),
    ).toBeOnTheScreen();
  });
});
