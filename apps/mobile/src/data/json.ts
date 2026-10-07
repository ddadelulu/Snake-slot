import { isLocalDate, isRappen, type LocalDate, type Rappen } from '@budget/core';

/**
 * Readers for JSON that database functions return. Each checks one value and names the field when
 * it is not what the contract (docs/API.md) promises, so a server/app mismatch shows up as a
 * clear error instead of a wrong number on screen.
 */

export class ResponseFormatError extends Error {
  constructor(source: string, field: string) {
    super(`${source} returned an unexpected value for ${field}`);
    this.name = 'ResponseFormatError';
  }
}

export type JsonObject = Record<string, unknown>;

export function jsonReader(source: string) {
  const fail = (field: string): never => {
    throw new ResponseFormatError(source, field);
  };

  const object = (value: unknown, field: string): JsonObject =>
    typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as JsonObject)
      : fail(field);

  const array = (value: unknown, field: string): unknown[] =>
    Array.isArray(value) ? value : fail(field);

  const text = (value: unknown, field: string): string =>
    typeof value === 'string' ? value : fail(field);

  const optionalText = (value: unknown, field: string): string | null =>
    value === null || value === undefined ? null : text(value, field);

  const integer = (value: unknown, field: string): number =>
    typeof value === 'number' && Number.isSafeInteger(value) ? value : fail(field);

  const optionalInteger = (value: unknown, field: string): number | null =>
    value === null || value === undefined ? null : integer(value, field);

  const rappen = (value: unknown, field: string): Rappen => (isRappen(value) ? value : fail(field));

  const boolean = (value: unknown, field: string): boolean =>
    typeof value === 'boolean' ? value : fail(field);

  const date = (value: unknown, field: string): LocalDate =>
    isLocalDate(value) ? value : fail(field);

  function oneOf<T extends string>(values: readonly T[], value: unknown, field: string): T {
    return typeof value === 'string' && (values as readonly string[]).includes(value)
      ? (value as T)
      : fail(field);
  }

  return {
    fail,
    object,
    array,
    text,
    optionalText,
    integer,
    optionalInteger,
    rappen,
    boolean,
    date,
    oneOf,
  };
}
