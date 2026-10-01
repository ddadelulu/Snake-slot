import { isLocalDevelopmentHost, readEnv, readRawEnv, type EnvInput } from './env';

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { appEnv: 'staging' } } },
}));

const PUBLISHABLE = 'sb_publishable_abc123DEF456';

/** A legacy JWT API key with the given role claim (signature irrelevant for these checks). */
function legacyKey(role: string): string {
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ iss: 'supabase', role })}.c2lnbmF0dXJl`;
}

function input(overrides: Partial<EnvInput> = {}): EnvInput {
  return {
    supabaseUrl: 'https://abcdefghijklmnop.supabase.co',
    supabaseKey: PUBLISHABLE,
    appEnv: 'production',
    ...overrides,
  };
}

describe('readEnv', () => {
  it('accepts a complete production configuration', () => {
    expect(readEnv(input())).toEqual({
      ok: true,
      supabaseUrl: 'https://abcdefghijklmnop.supabase.co',
      supabaseKey: PUBLISHABLE,
      appEnv: 'production',
    });
  });

  it('trims values and drops a trailing slash', () => {
    const env = readEnv(
      input({ supabaseUrl: ' https://abc.supabase.co/ ', supabaseKey: ` ${PUBLISHABLE}\n` }),
    );
    expect(env).toMatchObject({
      ok: true,
      supabaseUrl: 'https://abc.supabase.co',
      supabaseKey: PUBLISHABLE,
    });
  });

  it('accepts a legacy anon JWT key', () => {
    const anon = legacyKey('anon');
    expect(readEnv(input({ supabaseKey: anon }))).toMatchObject({ ok: true, supabaseKey: anon });
  });

  it('accepts an https URL with a port', () => {
    expect(readEnv(input({ supabaseUrl: 'https://supabase.example.ch:8443' }))).toMatchObject({
      ok: true,
    });
  });

  it('reports every missing value at once', () => {
    const env = readEnv({ supabaseUrl: undefined, supabaseKey: '   ', appEnv: 'development' });
    expect(env).toEqual({
      ok: false,
      problems: ['EXPO_PUBLIC_SUPABASE_URL is not set.', 'EXPO_PUBLIC_SUPABASE_KEY is not set.'],
    });
  });

  it.each([
    'abc.supabase.co',
    'ftp://abc.supabase.co',
    'https://',
    'https://abc.supabase.co/rest/v1',
    'https://abc.supabase.co?x=1',
    'https://abc.supabase.co#x',
    'https://user:pass@abc.supabase.co',
    'https://.supabase.co',
    'https://abc..supabase.co',
    'HTTPS://abc.supabase.co',
    'https://abc.supabase.co:abc',
  ])('rejects the malformed URL %j', (supabaseUrl) => {
    const env = readEnv(input({ supabaseUrl }));
    expect(env.ok).toBe(false);
    expect(!env.ok && env.problems[0]).toMatch(/EXPO_PUBLIC_SUPABASE_URL must be the project URL/);
  });

  it.each(['https://abc.supabase.co:0', 'https://abc.supabase.co:70000'])(
    'rejects the out-of-range port in %j',
    (supabaseUrl) => {
      expect(readEnv(input({ supabaseUrl }))).toEqual({
        ok: false,
        problems: ['EXPO_PUBLIC_SUPABASE_URL has an invalid port.'],
      });
    },
  );

  it.each(['production', 'staging'] as const)('requires https in %s', (appEnv) => {
    expect(readEnv(input({ appEnv, supabaseUrl: 'http://127.0.0.1:54321' }))).toEqual({
      ok: false,
      problems: [`EXPO_PUBLIC_SUPABASE_URL must use https in ${appEnv} builds.`],
    });
  });

  it.each([
    'http://localhost:54321',
    'http://127.0.0.1:54321',
    'http://10.0.2.2:54321',
    'http://192.168.1.20:54321',
    'http://10.1.2.3:54321',
    'http://172.16.0.5:54321',
    'http://172.31.255.255:54321',
  ])('allows http to the local stack in development: %s', (supabaseUrl) => {
    expect(readEnv(input({ appEnv: 'development', supabaseUrl }))).toMatchObject({
      ok: true,
      supabaseUrl,
      appEnv: 'development',
    });
  });

  it.each(['http://abc.supabase.co', 'http://172.32.0.1:54321', 'http://8.8.8.8'])(
    'refuses http to a public host even in development: %s',
    (supabaseUrl) => {
      const env = readEnv(input({ appEnv: 'development', supabaseUrl }));
      expect(env.ok).toBe(false);
      expect(!env.ok && env.problems[0]).toMatch(/may use http only for localhost/);
    },
  );

  it('treats a missing appEnv as production', () => {
    expect(readEnv(input({ appEnv: undefined }))).toMatchObject({ ok: true, appEnv: 'production' });
    expect(readEnv(input({ appEnv: null, supabaseUrl: 'http://localhost:54321' })).ok).toBe(false);
  });

  it('rejects an unknown appEnv', () => {
    expect(readEnv(input({ appEnv: 'prod' }))).toEqual({
      ok: false,
      problems: ['expo.extra.appEnv must be development, staging or production.'],
    });
    expect(readEnv(input({ appEnv: 3 })).ok).toBe(false);
  });

  it.each([
    ['a new-style secret key', 'sb_secret_abc123'],
    ['a legacy service_role key', legacyKey('service_role')],
  ])('refuses %s without echoing it', (_label, supabaseKey) => {
    const env = readEnv(input({ supabaseKey }));
    expect(env.ok).toBe(false);
    if (env.ok) return;
    expect(env.problems).toHaveLength(1);
    expect(env.problems[0]).toMatch(/is a secret key/);
    expect(env.problems.join(' ')).not.toContain(supabaseKey);
  });

  it('passes on keys that only look like JWTs', () => {
    expect(readEnv(input({ supabaseKey: 'a.b.c' })).ok).toBe(true);
    expect(readEnv(input({ supabaseKey: 'a..c' })).ok).toBe(true);
    const noRole = `${btoa('{}')}.${btoa(JSON.stringify({ role: 7 }))}.x`;
    expect(readEnv(input({ supabaseKey: noRole })).ok).toBe(true);
  });
});

describe('readRawEnv', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('reads the EXPO_PUBLIC_ variables and the app environment from the Expo config', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://abc.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_KEY = PUBLISHABLE;
    expect(readRawEnv()).toEqual({
      supabaseUrl: 'https://abc.supabase.co',
      supabaseKey: PUBLISHABLE,
      appEnv: 'staging',
    });
  });

  it('is what readEnv uses by default', () => {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    delete process.env.EXPO_PUBLIC_SUPABASE_KEY;
    expect(readEnv()).toEqual({
      ok: false,
      problems: ['EXPO_PUBLIC_SUPABASE_URL is not set.', 'EXPO_PUBLIC_SUPABASE_KEY is not set.'],
    });
  });
});

describe('isLocalDevelopmentHost', () => {
  it.each([
    ['localhost', true],
    ['10.0.2.2', true],
    ['127.0.0.1', true],
    ['192.168.0.1', true],
    ['192.169.0.1', false],
    ['172.15.0.1', false],
    ['256.1.1.1', false],
    ['10.0.0', false],
    ['example.local', false],
  ])('%s → %s', (host, expected) => {
    expect(isLocalDevelopmentHost(host)).toBe(expected);
  });
});
