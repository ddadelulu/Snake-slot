import type { SupportedStorage } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Session storage for supabase-js.
 *
 * Native (iOS/Android): the Keychain / Android Keystore through expo-secure-store. Sessions are
 * JSON documents of several kilobytes, and SecureStore warns that values above 2048 bytes may not
 * be stored reliably, so each value is split into chunks of at most CHUNK_MAX_BYTES of UTF-8
 * (never more than 1800 characters):
 *
 *   <base>_n    → "<count>:<generation>"                  (the chunk-count key)
 *   <base>_k0…  → "<generation>:<part of the value>"      (the chunks)
 *
 * Every write gets a fresh generation tag, so a value whose chunks come from two different writes
 * (an interrupted write, a crash) is detected and treated as absent instead of being handed back
 * as a corrupt session. Items use AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: readable for a background
 * token refresh once the phone has been unlocked after boot, and never copied into iCloud or
 * device backups or onto another device.
 *
 * Web: window.localStorage. The web build exists only for development and end-to-end tests; it is
 * not shipped to users, so the weaker storage is acceptable there.
 */

/** Upper bound for one chunk in UTF-8 bytes, well below SecureStore's 2048-byte warning. */
export const CHUNK_MAX_BYTES = 1800;
/** A guard against runaway values; at 1800 bytes per chunk this allows ~180 kB. */
export const MAX_CHUNKS = 100;

const SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

/**
 * Maps any key onto SecureStore's alphabet [A-Za-z0-9._-] without collisions: letters, digits,
 * "." and "-" stay as they are and every other UTF-16 unit (including "_") becomes "_" plus four
 * hex digits. An escape is always "_" followed by hex, so "_n" and "_k" suffixes can never be
 * part of a sanitized key.
 */
export function sanitizeKey(key: string): string {
  let result = '';
  for (let i = 0; i < key.length; i += 1) {
    const char = key.charAt(i);
    result += /[A-Za-z0-9.-]/.test(char)
      ? char
      : `_${key.charCodeAt(i).toString(16).padStart(4, '0')}`;
  }
  return result;
}

const countKey = (base: string) => `${base}_n`;
const chunkKey = (base: string, index: number) => `${base}_k${index}`;

/**
 * Splits a value into chunks of at most `maxBytes` UTF-8 bytes. Splits only between code points,
 * so a surrogate pair is never torn apart (a lone surrogate would not survive the native bridge).
 */
export function splitIntoChunks(value: string, maxBytes: number = CHUNK_MAX_BYTES): string[] {
  const chunks: string[] = [];
  let current = '';
  let currentBytes = 0;
  for (const char of value) {
    const codePoint = char.codePointAt(0) ?? 0;
    const bytes = codePoint < 0x80 ? 1 : codePoint < 0x800 ? 2 : codePoint < 0x10000 ? 3 : 4;
    if (currentBytes + bytes > maxBytes && current.length > 0) {
      chunks.push(current);
      current = '';
      currentBytes = 0;
    }
    current += char;
    currentBytes += bytes;
  }
  if (current.length > 0 || chunks.length === 0) chunks.push(current);
  return chunks;
}

let generationCounter = 0;

/** Distinguishes one write from the next. Not a secret: only needs to differ between writes. */
function nextGeneration(): string {
  generationCounter = (generationCounter + 1) % 1_679_616; // 36^4
  return `${Date.now().toString(36)}${generationCounter.toString(36)}${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function parseCount(raw: string): { count: number; generation: string } | null {
  const match = /^(\d{1,3}):([a-z0-9]{1,40})$/.exec(raw);
  if (!match?.[1] || !match[2]) return null;
  const count = Number(match[1]);
  if (count < 1 || count > MAX_CHUNKS) return null;
  return { count, generation: match[2] };
}

/** Minimal surface of expo-secure-store used here; injectable for tests. */
export type SecureStoreLike = {
  getItemAsync(key: string, options?: SecureStore.SecureStoreOptions): Promise<string | null>;
  setItemAsync(key: string, value: string, options?: SecureStore.SecureStoreOptions): Promise<void>;
  deleteItemAsync(key: string, options?: SecureStore.SecureStoreOptions): Promise<void>;
};

/**
 * A SupportedStorage over SecureStore with chunking. Operations on the same key run one after the
 * other, so a sign-out racing a token refresh cannot interleave their chunk writes.
 *
 * Errors from the keychain itself (for example when it is unavailable before the first unlock)
 * are passed on rather than turned into "no session": supabase-js then keeps the stored session
 * and tries again later, instead of signing the user out.
 */
export function createChunkedSecureStorage(store: SecureStoreLike = SecureStore): SupportedStorage {
  const queues = new Map<string, Promise<unknown>>();

  function serialized<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = queues.get(key) ?? Promise.resolve();
    const run = previous.then(operation, operation);
    const settled = run.then(
      () => undefined,
      () => undefined,
    );
    queues.set(key, settled);
    void settled.then(() => {
      if (queues.get(key) === settled) queues.delete(key);
    });
    return run;
  }

  /** Deletes chunks from `start` until the first one that does not exist. */
  async function deleteChunksFrom(base: string, start: number): Promise<void> {
    for (let index = start; index < MAX_CHUNKS; index += 1) {
      const key = chunkKey(base, index);
      if ((await store.getItemAsync(key, SECURE_STORE_OPTIONS)) === null) return;
      await store.deleteItemAsync(key, SECURE_STORE_OPTIONS);
    }
  }

  /**
   * Deletes the count and the chunks. The first `knownCount` chunks are deleted unconditionally
   * (one of them may be the missing one that made a value unreadable); beyond that, deletion
   * continues until a chunk is absent.
   */
  async function removeAll(base: string, knownCount: number): Promise<void> {
    await store.deleteItemAsync(countKey(base), SECURE_STORE_OPTIONS);
    for (let index = 0; index < knownCount; index += 1) {
      await store.deleteItemAsync(chunkKey(base, index), SECURE_STORE_OPTIONS);
    }
    await deleteChunksFrom(base, knownCount);
  }

  async function readCount(base: string) {
    const raw = await store.getItemAsync(countKey(base), SECURE_STORE_OPTIONS);
    return raw === null ? null : (parseCount(raw) ?? 'corrupt');
  }

  async function read(base: string): Promise<string | null> {
    const meta = await readCount(base);
    if (meta === null) return null;
    if (meta === 'corrupt') {
      await removeAll(base, 0);
      return null;
    }
    const chunks = await Promise.all(
      Array.from({ length: meta.count }, (_, index) =>
        store.getItemAsync(chunkKey(base, index), SECURE_STORE_OPTIONS),
      ),
    );
    const prefix = `${meta.generation}:`;
    if (chunks.some((chunk) => chunk === null || !chunk.startsWith(prefix))) {
      await removeAll(base, meta.count);
      return null;
    }
    return chunks.map((chunk) => (chunk ?? '').slice(prefix.length)).join('');
  }

  async function remove(base: string): Promise<void> {
    const meta = await readCount(base);
    await removeAll(base, meta === null || meta === 'corrupt' ? 0 : meta.count);
  }

  async function write(base: string, value: string): Promise<void> {
    const chunks = splitIntoChunks(value);
    if (chunks.length > MAX_CHUNKS) {
      throw new Error(`Value is too large for secure storage (${chunks.length} chunks).`);
    }
    const generation = nextGeneration();
    for (const [index, chunk] of chunks.entries()) {
      await store.setItemAsync(
        chunkKey(base, index),
        `${generation}:${chunk}`,
        SECURE_STORE_OPTIONS,
      );
    }
    // The count is written last: until it is, readers still see the previous value's count with a
    // mismatching generation, which reads as "absent" rather than as half old, half new data.
    await store.setItemAsync(
      countKey(base),
      `${chunks.length}:${generation}`,
      SECURE_STORE_OPTIONS,
    );
    await deleteChunksFrom(base, chunks.length);
  }

  return {
    getItem: (key) => {
      const base = sanitizeKey(key);
      return serialized(base, () => read(base));
    },
    setItem: (key, value) => {
      const base = sanitizeKey(key);
      return serialized(base, () => write(base, value));
    },
    removeItem: (key) => {
      const base = sanitizeKey(key);
      return serialized(base, () => remove(base));
    },
  };
}

/** localStorage for the web build (development and end-to-end tests only, see above). */
export function createWebStorage(): SupportedStorage {
  const storage = (): Storage | null =>
    typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage;
  return {
    getItem: (key) => storage()?.getItem(key) ?? null,
    setItem: (key, value) => storage()?.setItem(key, value),
    removeItem: (key) => storage()?.removeItem(key),
  };
}

export function createAuthStorage(os: string = Platform.OS): SupportedStorage {
  return os === 'web' ? createWebStorage() : createChunkedSecureStorage();
}

/** The storage the app's Supabase client persists its session (and PKCE verifiers) in. */
export const secureStorage: SupportedStorage = createAuthStorage();
