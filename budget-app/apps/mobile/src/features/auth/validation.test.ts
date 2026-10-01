import {
  countCharacters,
  EMAIL_MAX_LENGTH,
  normalizeEmail,
  PASSWORD_MAX_BYTES,
  PASSWORD_MIN_LENGTH,
  utf8ByteLength,
  validateEmail,
  validatePassword,
  VALIDATION_ERROR_CODES,
} from './validation';

describe('normalizeEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmail('  Anna.Muster@Example.CH \n')).toBe('anna.muster@example.ch');
  });
});

describe('validateEmail', () => {
  it.each(['', '   ', '\t'])('requires a value (%j)', (value) => {
    expect(validateEmail(value)).toBe('email_required');
  });

  it.each([
    'anna@example.ch',
    '  anna@example.ch  ',
    'Anna.Muster+budget@sub.example.co.uk',
    'a@b.io',
    'zoë@bücher.ch',
  ])('accepts %j', (value) => {
    expect(validateEmail(value)).toBeNull();
  });

  it.each([
    'anna',
    'anna@',
    '@example.ch',
    'anna@example',
    'anna@example.c',
    'anna@@example.ch',
    'an na@example.ch',
    'anna@exa mple.ch',
    'anna@.example.ch',
    'anna@example..ch',
    'anna@example.ch.',
  ])('rejects %j', (value) => {
    expect(validateEmail(value)).toBe('email_invalid');
  });

  it('rejects addresses longer than an SMTP path allows', () => {
    const local = 'a'.repeat(EMAIL_MAX_LENGTH);
    expect(validateEmail(`${local}@example.ch`)).toBe('email_invalid');
    const fits = `${'a'.repeat(EMAIL_MAX_LENGTH - '@example.ch'.length)}@example.ch`;
    expect(validateEmail(fits)).toBeNull();
  });
});

describe('validatePassword', () => {
  it('requires a value', () => {
    expect(validatePassword('')).toBe('password_required');
  });

  it(`needs at least ${PASSWORD_MIN_LENGTH} characters`, () => {
    expect(validatePassword('a'.repeat(PASSWORD_MIN_LENGTH - 1))).toBe('password_too_short');
    expect(validatePassword('a'.repeat(PASSWORD_MIN_LENGTH))).toBeNull();
  });

  it('counts an emoji as one character, not two UTF-16 units', () => {
    // 9 characters but 10 UTF-16 code units.
    expect(validatePassword('😀abcdefgh')).toBe('password_too_short');
  });

  it('does not trim: spaces are characters', () => {
    expect(validatePassword('          ')).toBeNull();
  });

  it(`allows at most ${PASSWORD_MAX_BYTES} bytes of UTF-8`, () => {
    expect(validatePassword('a'.repeat(PASSWORD_MAX_BYTES))).toBeNull();
    expect(validatePassword('a'.repeat(PASSWORD_MAX_BYTES + 1))).toBe('password_too_long');
    // 36 × "ä" is 36 characters but 72 bytes; one more is 74 bytes.
    expect(validatePassword('ä'.repeat(36))).toBeNull();
    expect(validatePassword('ä'.repeat(37))).toBe('password_too_long');
    // 18 emoji are 72 bytes.
    expect(validatePassword('😀'.repeat(18))).toBeNull();
    expect(validatePassword('😀'.repeat(19))).toBe('password_too_long');
  });

  it('has no composition rules', () => {
    expect(validatePassword('correcthorsebattery')).toBeNull();
  });
});

describe('helpers', () => {
  it('counts code points', () => {
    expect(countCharacters('abc')).toBe(3);
    expect(countCharacters('😀ä')).toBe(2);
  });

  it('measures UTF-8 like TextEncoder', () => {
    for (const value of ['', 'abc', 'äöü', '€', '😀', 'aࠀb', '\ud800']) {
      expect(utf8ByteLength(value)).toBe(new TextEncoder().encode(value).length);
    }
  });

  it('lists every validation code once', () => {
    expect(new Set(VALIDATION_ERROR_CODES).size).toBe(VALIDATION_ERROR_CODES.length);
    expect(VALIDATION_ERROR_CODES).toEqual([
      'email_required',
      'email_invalid',
      'password_required',
      'password_too_short',
      'password_too_long',
    ]);
  });
});
