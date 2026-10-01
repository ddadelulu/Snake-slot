import * as SecureStore from 'expo-secure-store';

import {
  CHUNK_MAX_BYTES,
  createAuthStorage,
  createChunkedSecureStorage,
  createWebStorage,
  MAX_CHUNKS,
  sanitizeKey,
  splitIntoChunks,
  type SecureStoreLike,
} from './secureStorage';

/** The in-memory keychain jest.setup.ts installs in place of expo-secure-store. */
const keychain = (SecureStore as unknown as { __store: Map<string, string> }).__store;
const mocked = SecureStore as jest.Mocked<typeof SecureStore>;

const KEY = 'sb-abcdefghijklmnop-auth-token';
const BASE = sanitizeKey(KEY);

/** A realistic session-sized JSON document (~5 kB). */
function sessionLike(size = 5000): string {
  const filler = 'x'.repeat(size);
  return JSON.stringify({ access_token: filler, refresh_token: 'r', user: { id: 'u' } });
}

function chunkKeys(): string[] {
  return [...keychain.keys()].filter((key) => key.startsWith(`${BASE}_k`)).sort();
}

/** The jest-expo (iOS) environment has no localStorage; the web adapter tests need one. */
class MemoryStorage {
  private readonly items = new Map<string, string>();
  get length(): number {
    return this.items.size;
  }
  clear(): void {
    this.items.clear();
  }
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  key(index: number): string | null {
    return [...this.items.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.items.delete(key);
  }
  setItem(key: string, value: string): void {
    this.items.set(key, String(value));
  }
}

const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

beforeAll(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  });
});

afterAll(() => {
  if (originalLocalStorage) Object.defineProperty(globalThis, 'localStorage', originalLocalStorage);
  else Reflect.deleteProperty(globalThis, 'localStorage');
});

beforeEach(() => {
  keychain.clear();
  localStorage.clear();
  jest.clearAllMocks();
});

describe('sanitizeKey', () => {
  it('keeps SecureStore-safe characters', () => {
    expect(sanitizeKey('sb-abc.def-auth-token')).toBe('sb-abc.def-auth-token');
  });

  it('escapes everything else, including "_", without collisions', () => {
    expect(sanitizeKey('a_b')).toBe('a_005fb');
    expect(sanitizeKey('a:b')).toBe('a_003ab');
    expect(sanitizeKey('a b/ä')).toBe('a_0020b_002f_00e4');
    expect(sanitizeKey('a_b')).not.toBe(sanitizeKey('a:b'));
    expect(sanitizeKey('')).toBe('');
  });

  it('only produces keys SecureStore accepts', () => {
    for (const key of ['sb-x-auth-token-code-verifier', 'a:b', '😀', '_n', 'x y']) {
      expect(sanitizeKey(`${key}`) + '_n').toMatch(/^[\w.-]+$/);
    }
  });
});

describe('splitIntoChunks', () => {
  it('returns one empty chunk for an empty value', () => {
    expect(splitIntoChunks('')).toEqual(['']);
  });

  it('splits ASCII at the byte limit', () => {
    const chunks = splitIntoChunks('a'.repeat(CHUNK_MAX_BYTES * 2 + 1));
    expect(chunks.map((chunk) => chunk.length)).toEqual([CHUNK_MAX_BYTES, CHUNK_MAX_BYTES, 1]);
  });

  it('keeps every chunk within the byte limit for multi-byte text', () => {
    const value = 'ä€😀'.repeat(1000);
    const chunks = splitIntoChunks(value);
    expect(chunks.join('')).toBe(value);
    for (const chunk of chunks) {
      expect(new TextEncoder().encode(chunk).length).toBeLessThanOrEqual(CHUNK_MAX_BYTES);
      expect(chunk.length).toBeLessThanOrEqual(1800);
    }
  });

  it('never splits a surrogate pair', () => {
    // 1799 ASCII bytes leave 1 byte: the 4-byte emoji must move to the next chunk whole.
    const value = `${'a'.repeat(CHUNK_MAX_BYTES - 1)}😀b`;
    const chunks = splitIntoChunks(value);
    expect(chunks).toEqual(['a'.repeat(CHUNK_MAX_BYTES - 1), '😀b']);
  });
});

describe('createChunkedSecureStorage', () => {
  it('round-trips a session larger than one keychain item', async () => {
    const storage = createChunkedSecureStorage();
    const value = sessionLike();
    await storage.setItem(KEY, value);

    expect(await storage.getItem(KEY)).toBe(value);
    expect(chunkKeys()).toHaveLength(Math.ceil(value.length / CHUNK_MAX_BYTES));
    for (const stored of keychain.values()) {
      expect(new TextEncoder().encode(stored).length).toBeLessThan(2048);
    }
  });

  it('round-trips small, empty and non-ASCII values', async () => {
    const storage = createChunkedSecureStorage();
    for (const value of ['v', '', '{"name":"Zoë 😀"}', 'ä'.repeat(2000)]) {
      await storage.setItem(KEY, value);
      expect(await storage.getItem(KEY)).toBe(value);
    }
  });

  it('stores every item device-only, after first unlock', async () => {
    const storage = createChunkedSecureStorage();
    await storage.setItem(KEY, sessionLike());
    await storage.getItem(KEY);
    await storage.removeItem(KEY);
    const options = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };
    for (const mock of [mocked.setItemAsync, mocked.getItemAsync, mocked.deleteItemAsync]) {
      expect(mock).toHaveBeenCalled();
      for (const call of mock.mock.calls) expect(call.at(-1)).toEqual(options);
    }
  });

  it('writes only sanitized keys', async () => {
    const storage = createChunkedSecureStorage();
    await storage.setItem('odd key:with/chars', sessionLike());
    for (const key of keychain.keys()) expect(key).toMatch(/^[\w.-]+$/);
    expect(await storage.getItem('odd key:with/chars')).toBe(sessionLike());
  });

  it('returns null for a key that was never written', async () => {
    expect(await createChunkedSecureStorage().getItem(KEY)).toBeNull();
  });

  it('keeps keys apart', async () => {
    const storage = createChunkedSecureStorage();
    await storage.setItem(KEY, 'session');
    await storage.setItem(`${KEY}-code-verifier`, 'verifier');
    expect(await storage.getItem(KEY)).toBe('session');
    expect(await storage.getItem(`${KEY}-code-verifier`)).toBe('verifier');
  });

  it('removes stale chunks when a value shrinks', async () => {
    const storage = createChunkedSecureStorage();
    await storage.setItem(KEY, sessionLike(9000));
    const before = chunkKeys().length;
    expect(before).toBeGreaterThan(4);

    await storage.setItem(KEY, 'short');
    expect(chunkKeys()).toEqual([`${BASE}_k0`]);
    expect(await storage.getItem(KEY)).toBe('short');
  });

  it('removes the count and every chunk', async () => {
    const storage = createChunkedSecureStorage();
    await storage.setItem(KEY, sessionLike());
    await storage.setItem('other', 'kept');
    await storage.removeItem(KEY);

    expect(await storage.getItem(KEY)).toBeNull();
    expect([...keychain.keys()].filter((key) => key.startsWith(BASE))).toEqual([]);
    expect(await storage.getItem('other')).toBe('kept');
  });

  it('removes every chunk even when one in the middle is gone', async () => {
    const storage = createChunkedSecureStorage();
    await storage.setItem(KEY, sessionLike(9000));
    keychain.delete(`${BASE}_k1`);
    await storage.removeItem(KEY);
    expect([...keychain.keys()].filter((key) => key.startsWith(BASE))).toEqual([]);
  });

  it('removing a missing key is a no-op', async () => {
    await expect(createChunkedSecureStorage().removeItem(KEY)).resolves.toBeUndefined();
  });

  it('treats a missing chunk as no value and cleans up', async () => {
    const storage = createChunkedSecureStorage();
    await storage.setItem(KEY, sessionLike());
    keychain.delete(`${BASE}_k1`);

    expect(await storage.getItem(KEY)).toBeNull();
    expect([...keychain.keys()].filter((key) => key.startsWith(BASE))).toEqual([]);
  });

  it('detects chunks left over from another write', async () => {
    const storage = createChunkedSecureStorage();
    await storage.setItem(KEY, sessionLike());
    const firstChunk = keychain.get(`${BASE}_k0`);
    await storage.setItem(KEY, sessionLike(5001));
    // Simulate a crash that left one chunk of the previous write behind.
    keychain.set(`${BASE}_k0`, firstChunk ?? '');

    expect(await storage.getItem(KEY)).toBeNull();
    expect(keychain.has(`${BASE}_n`)).toBe(false);
  });

  it.each(['', 'abc', '0:gen', `${MAX_CHUNKS + 1}:gen`, '2:', '2:GEN!', '-1:gen'])(
    'treats the corrupt count %j as no value and cleans up',
    async (count) => {
      const storage = createChunkedSecureStorage();
      await storage.setItem(KEY, sessionLike());
      keychain.set(`${BASE}_n`, count);

      expect(await storage.getItem(KEY)).toBeNull();
      expect([...keychain.keys()].filter((key) => key.startsWith(BASE))).toEqual([]);
    },
  );

  it('refuses values beyond the chunk limit without touching the stored one', async () => {
    const storage = createChunkedSecureStorage();
    await storage.setItem(KEY, 'existing');
    await expect(
      storage.setItem(KEY, 'a'.repeat(CHUNK_MAX_BYTES * MAX_CHUNKS + 1)),
    ).rejects.toThrow(/too large/);
    expect(await storage.getItem(KEY)).toBe('existing');
  });

  it('runs operations on one key in order', async () => {
    const storage = createChunkedSecureStorage();
    const writes = [
      storage.setItem(KEY, sessionLike(4000)),
      storage.removeItem(KEY),
      storage.setItem(KEY, sessionLike(6000)),
    ];
    const read = storage.getItem(KEY);
    await Promise.all(writes);
    expect(await read).toBe(sessionLike(6000));
  });

  it('keeps working after a failed operation', async () => {
    let failNext = true;
    const store: SecureStoreLike = {
      getItemAsync: jest.fn(async (key: string) => keychain.get(key) ?? null),
      setItemAsync: jest.fn(async (key: string, value: string) => {
        if (failNext) {
          failNext = false;
          throw new Error('keychain busy');
        }
        keychain.set(key, value);
      }),
      deleteItemAsync: jest.fn(async (key: string) => {
        keychain.delete(key);
      }),
    };
    const storage = createChunkedSecureStorage(store);
    await expect(storage.setItem(KEY, 'one')).rejects.toThrow('keychain busy');
    await storage.setItem(KEY, 'two');
    expect(await storage.getItem(KEY)).toBe('two');
  });

  it('passes keychain read errors on instead of reporting "no session"', async () => {
    const storage = createChunkedSecureStorage();
    await storage.setItem(KEY, sessionLike());
    mocked.getItemAsync.mockRejectedValueOnce(new Error('User interaction is not allowed.'));

    await expect(storage.getItem(KEY)).rejects.toThrow('User interaction is not allowed.');
    // Nothing was cleaned up: the session is still there once the keychain is readable.
    expect(await storage.getItem(KEY)).toBe(sessionLike());
  });
});

describe('createWebStorage', () => {
  it('uses localStorage', async () => {
    const storage = createWebStorage();
    await storage.setItem(KEY, 'value');
    expect(localStorage.getItem(KEY)).toBe('value');
    expect(await storage.getItem(KEY)).toBe('value');
    await storage.removeItem(KEY);
    expect(await storage.getItem(KEY)).toBeNull();
  });

  it('behaves as empty storage where localStorage does not exist', async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      value: undefined,
      configurable: true,
      writable: true,
    });
    try {
      const storage = createWebStorage();
      await storage.setItem(KEY, 'value');
      expect(await storage.getItem(KEY)).toBeNull();
      await expect(Promise.resolve(storage.removeItem(KEY))).resolves.toBeUndefined();
    } finally {
      if (original) Object.defineProperty(globalThis, 'localStorage', original);
    }
  });
});

describe('createAuthStorage', () => {
  it('uses the keychain on iOS and Android', async () => {
    for (const os of ['ios', 'android']) {
      keychain.clear();
      const storage = createAuthStorage(os);
      await storage.setItem(KEY, 'native');
      expect(keychain.size).toBeGreaterThan(0);
      expect(localStorage.getItem(KEY)).toBeNull();
    }
  });

  it('uses localStorage on web', async () => {
    const storage = createAuthStorage('web');
    await storage.setItem(KEY, 'web');
    expect(localStorage.getItem(KEY)).toBe('web');
    expect(keychain.size).toBe(0);
  });
});
