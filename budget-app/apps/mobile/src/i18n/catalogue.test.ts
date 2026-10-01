import { LANGUAGES } from '@budget/core';

import { AUTH_ERROR_CODES } from '@/features/auth/errors';
import { VALIDATION_ERROR_CODES } from '@/features/auth/validation';
import { APPEARANCE_PREFERENCES } from '@/theme';

import { de } from './de';
import { en } from './en';
import { resources } from './i18n';

type Tree = { readonly [key: string]: string | Tree };

function leaves(tree: Tree, prefix = ''): Map<string, string> {
  const result = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') result.set(path, value);
    else for (const [p, v] of leaves(value, path)) result.set(p, v);
  }
  return result;
}

const placeholders = (text: string) =>
  [...text.matchAll(/{{\s*(\w+)\s*}}/g)].map((m) => m[1]).sort();

describe('translation catalogues', () => {
  const english = leaves(en);
  const german = leaves(de);

  it('has a catalogue for every supported language', () => {
    expect(Object.keys(resources).sort()).toEqual([...LANGUAGES].sort());
  });

  it('German and English have exactly the same keys', () => {
    expect([...german.keys()].sort()).toEqual([...english.keys()].sort());
  });

  it('has no empty strings', () => {
    for (const [path, text] of [...english, ...german]) {
      expect({ path, empty: text.trim() === '' }).toEqual({ path, empty: false });
    }
  });

  it('uses the same placeholders in both languages', () => {
    for (const [path, text] of english) {
      expect({ path, placeholders: placeholders(german.get(path) ?? '') }).toEqual({
        path,
        placeholders: placeholders(text),
      });
    }
  });

  it('uses Swiss spelling (no ß) in German', () => {
    for (const [path, text] of german)
      expect({ path, eszett: text.includes('ß') }).toEqual({ path, eszett: false });
  });

  it('covers every auth error and validation code', () => {
    for (const code of AUTH_ERROR_CODES) {
      expect(english.has(`auth.errors.${code}`)).toBe(true);
    }
    for (const code of VALIDATION_ERROR_CODES) {
      expect(english.has(`auth.validation.${code}`)).toBe(true);
    }
  });

  it('names every language and appearance option', () => {
    for (const language of LANGUAGES) expect(english.has(`languageNames.${language}`)).toBe(true);
    for (const option of APPEARANCE_PREFERENCES) {
      expect(english.has(`settings.appearanceOptions.${option}`)).toBe(true);
    }
  });
});
