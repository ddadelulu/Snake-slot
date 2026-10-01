/**
 * Input validation for the auth forms. Pure functions: screens call them for inline field errors,
 * and authApi calls them again before every request.
 *
 * Password policy (product decision): at least 10 characters and at most 72 bytes of UTF-8, the
 * bcrypt input limit the auth server hashes with. No composition rules.
 */

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_BYTES = 72;

/** Longest address SMTP can deliver to (RFC 5321 path limit minus the angle brackets). */
export const EMAIL_MAX_LENGTH = 254;

export const EMAIL_ERROR_CODES = ['email_required', 'email_invalid'] as const;
export type EmailErrorCode = (typeof EMAIL_ERROR_CODES)[number];

export const PASSWORD_ERROR_CODES = [
  'password_required',
  'password_too_short',
  'password_too_long',
] as const;
export type PasswordErrorCode = (typeof PASSWORD_ERROR_CODES)[number];

/** Every field-level code, for checking the i18n catalogue (`auth.validation.<code>`). */
export const VALIDATION_ERROR_CODES = [...EMAIL_ERROR_CODES, ...PASSWORD_ERROR_CODES] as const;
export type ValidationErrorCode = (typeof VALIDATION_ERROR_CODES)[number];

/**
 * Pragmatic, not RFC 5322: something without spaces or "@", an "@", then dot-separated domain
 * labels ending in a label of at least two characters. The server has the final word.
 */
const EMAIL_PATTERN = /^[^\s@]+@(?:[^\s@.]+\.)+[^\s@.]{2,}$/;

/** Trims and lowercases, the form the auth server stores addresses in. */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function validateEmail(value: string): EmailErrorCode | null {
  const email = value.trim();
  if (email.length === 0) return 'email_required';
  if (email.length > EMAIL_MAX_LENGTH || !EMAIL_PATTERN.test(email)) return 'email_invalid';
  return null;
}

/** Validates a new password (sign-up, reset). Not trimmed: spaces are legitimate characters. */
export function validatePassword(value: string): PasswordErrorCode | null {
  if (value.length === 0) return 'password_required';
  if (countCharacters(value) < PASSWORD_MIN_LENGTH) return 'password_too_short';
  if (utf8ByteLength(value) > PASSWORD_MAX_BYTES) return 'password_too_long';
  return null;
}

/** Characters as a person counts them: code points, so an emoji is one character, not two. */
export function countCharacters(value: string): number {
  return Array.from(value).length;
}

/** UTF-8 encoded length. A lone surrogate counts as U+FFFD (3 bytes), as TextEncoder encodes it. */
export function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const char of value) {
    const codePoint = char.codePointAt(0) ?? 0;
    if (codePoint < 0x80) bytes += 1;
    else if (codePoint < 0x800) bytes += 2;
    else if (codePoint < 0x10000) bytes += 3;
    else bytes += 4;
  }
  return bytes;
}
