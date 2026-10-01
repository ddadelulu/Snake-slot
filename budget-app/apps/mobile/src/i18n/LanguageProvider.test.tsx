import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { i18n } from './i18n';
import { LANGUAGE_STORAGE_KEY, LanguageProvider, useLanguage } from './LanguageProvider';

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'en' }] }));

const wrapper = ({ children }: { children: ReactNode }) => (
  <LanguageProvider>{children}</LanguageProvider>
);

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('LanguageProvider', () => {
  it('starts with the phone language when nothing was picked', async () => {
    const { result } = renderHook(() => useLanguage(), { wrapper });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current).toMatchObject({ language: 'en', explicit: false });
  });

  it('restores a language picked earlier on this device', async () => {
    await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, 'de');
    const { result } = renderHook(() => useLanguage(), { wrapper });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current).toMatchObject({ language: 'de', explicit: true });
    await waitFor(() => expect(i18n.language).toBe('de'));
  });

  it('ignores an unknown stored value', async () => {
    await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, 'tlh');
    const { result } = renderHook(() => useLanguage(), { wrapper });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current).toMatchObject({ language: 'en', explicit: false });
  });

  it('setLanguage applies, marks and saves the choice', async () => {
    const { result } = renderHook(() => useLanguage(), { wrapper });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    await act(() => result.current.setLanguage('de'));
    expect(result.current).toMatchObject({ language: 'de', explicit: true });
    expect(await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('de');
    await waitFor(() => expect(i18n.language).toBe('de'));
  });

  it('adoptLanguage follows the account only while nothing was picked here', async () => {
    const { result } = renderHook(() => useLanguage(), { wrapper });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    act(() => result.current.adoptLanguage('de'));
    expect(result.current).toMatchObject({ language: 'de', explicit: false });

    await act(() => result.current.setLanguage('en'));
    act(() => result.current.adoptLanguage('de'));
    expect(result.current).toMatchObject({ language: 'en', explicit: true });
  });

  it('useLanguage outside the provider explains itself', () => {
    expect(() => renderHook(() => useLanguage())).toThrow(/LanguageProvider/);
  });
});
