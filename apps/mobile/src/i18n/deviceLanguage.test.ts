import { getLocales } from 'expo-localization';

import { deviceLanguage } from './i18n';

jest.mock('expo-localization', () => ({ getLocales: jest.fn(() => []) }));

type Locales = ReturnType<typeof getLocales>;
const locales = (...codes: (string | null)[]) =>
  codes.map((languageCode) => ({ languageCode })) as unknown as Locales;

describe('deviceLanguage', () => {
  it('takes the first supported language from the phone settings', () => {
    jest.mocked(getLocales).mockReturnValue(locales('fr', 'en', 'de'));
    expect(deviceLanguage()).toBe('en');
    jest.mocked(getLocales).mockReturnValue(locales('de', 'en'));
    expect(deviceLanguage()).toBe('de');
  });

  it('falls back to German for unsupported or missing locales', () => {
    jest.mocked(getLocales).mockReturnValue(locales('it', null));
    expect(deviceLanguage()).toBe('de');
    jest.mocked(getLocales).mockImplementation(() => {
      throw new Error('no locales');
    });
    expect(deviceLanguage()).toBe('de');
  });
});
