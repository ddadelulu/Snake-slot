import { decideLanguageSync } from './ProfileLanguageSync';

const created = '2026-10-01T12:00:00.000000+00:00';
const later = '2026-10-02T08:30:00.000000+00:00';

describe('decideLanguageSync', () => {
  it('does nothing without a profile or when the languages already match', () => {
    expect(decideLanguageSync({ profile: undefined, language: 'en', explicit: true })).toEqual({
      action: 'none',
    });
    expect(
      decideLanguageSync({
        profile: { language: 'en', created_at: created, updated_at: later },
        language: 'en',
        explicit: false,
      }),
    ).toEqual({ action: 'none' });
  });

  it('writes a language picked on this device to the account', () => {
    expect(
      decideLanguageSync({
        profile: { language: 'de', created_at: created, updated_at: later },
        language: 'en',
        explicit: true,
      }),
    ).toEqual({ action: 'update-profile', language: 'en' });
  });

  it('gives a never-changed account the language on screen (Google/Apple sign-ups)', () => {
    expect(
      decideLanguageSync({
        profile: { language: 'de', created_at: created, updated_at: created },
        language: 'en',
        explicit: false,
      }),
    ).toEqual({ action: 'update-profile', language: 'en' });
  });

  it('lets a new device follow the account', () => {
    expect(
      decideLanguageSync({
        profile: { language: 'de', created_at: created, updated_at: later },
        language: 'en',
        explicit: false,
      }),
    ).toEqual({ action: 'adopt', language: 'de' });
  });
});
