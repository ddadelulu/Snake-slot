import Constants from 'expo-constants';

/**
 * Runtime configuration. Only public values live here: the Supabase project URL and its
 * publishable key (or the legacy anon key). Both ship inside the app bundle by design; row-level
 * security is what protects the data. A secret or service-role key must never be configured
 * here, and readEnv() refuses to start with one.
 */

export const APP_ENVS = ['development', 'staging', 'production'] as const;
export type AppEnv = (typeof APP_ENVS)[number];

export type EnvInput = {
  supabaseUrl: string | undefined;
  supabaseKey: string | undefined;
  /** `expo.extra.appEnv` from app.config.ts. */
  appEnv: unknown;
};

export type Env =
  | { ok: true; supabaseUrl: string; supabaseKey: string; appEnv: AppEnv }
  | { ok: false; problems: string[] };

/**
 * The raw values. Expo inlines EXPO_PUBLIC_* variables at build time only when they are read with
 * a literal `process.env.EXPO_PUBLIC_…` member expression, so keep these two accesses exactly so.
 */
export function readRawEnv(): EnvInput {
  return {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseKey: process.env.EXPO_PUBLIC_SUPABASE_KEY,
    appEnv: Constants.expoConfig?.extra?.appEnv,
  };
}

/**
 * Validates the configuration. Problems are written for the developer reading the configuration
 * error screen; they never repeat the key.
 *
 * A missing appEnv is treated as 'production' (the strictest rules) rather than as an error,
 * because app.config.ts always sets it and an absent manifest should not loosen anything.
 */
export function readEnv(input: EnvInput = readRawEnv()): Env {
  const problems: string[] = [];

  let appEnv: AppEnv = 'production';
  if (input.appEnv !== undefined && input.appEnv !== null) {
    if (isAppEnv(input.appEnv)) appEnv = input.appEnv;
    else problems.push('expo.extra.appEnv must be development, staging or production.');
  }

  const supabaseUrl = checkUrl(input.supabaseUrl?.trim(), appEnv, problems);
  const supabaseKey = checkKey(input.supabaseKey?.trim(), problems);

  if (problems.length > 0 || supabaseUrl === null || supabaseKey === null) {
    return { ok: false, problems };
  }
  return { ok: true, supabaseUrl, supabaseKey, appEnv };
}

function isAppEnv(value: unknown): value is AppEnv {
  return typeof value === 'string' && (APP_ENVS as readonly string[]).includes(value);
}

/** scheme://host[:port][/] and nothing else: no credentials, path, query or fragment. */
const URL_PATTERN = /^(https?):\/\/([A-Za-z0-9.-]+)(?::(\d{1,5}))?\/?$/;

function checkUrl(value: string | undefined, appEnv: AppEnv, problems: string[]): string | null {
  if (!value) {
    problems.push('EXPO_PUBLIC_SUPABASE_URL is not set.');
    return null;
  }
  const match = URL_PATTERN.exec(value);
  const scheme = match?.[1];
  const host = match?.[2]?.toLowerCase();
  if (!scheme || !host || host.startsWith('.') || host.endsWith('.') || host.includes('..')) {
    problems.push(
      'EXPO_PUBLIC_SUPABASE_URL must be the project URL, e.g. https://<project-ref>.supabase.co.',
    );
    return null;
  }
  const port = match[3];
  if (port !== undefined && (Number(port) < 1 || Number(port) > 65535)) {
    problems.push('EXPO_PUBLIC_SUPABASE_URL has an invalid port.');
    return null;
  }
  if (scheme === 'http') {
    if (appEnv !== 'development') {
      problems.push(`EXPO_PUBLIC_SUPABASE_URL must use https in ${appEnv} builds.`);
      return null;
    }
    if (!isLocalDevelopmentHost(host)) {
      problems.push(
        'EXPO_PUBLIC_SUPABASE_URL may use http only for localhost, 127.0.0.1, 10.0.2.2 or a private LAN address.',
      );
      return null;
    }
  }
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

/**
 * Hosts a local Supabase stack can be reached on during development: this machine, the Android
 * emulator's alias for it (10.0.2.2) and private IPv4 ranges (a phone on the same Wi-Fi).
 */
export function isLocalDevelopmentHost(host: string): boolean {
  if (host === 'localhost' || host === '10.0.2.2') return true;
  const octets = host.split('.');
  if (octets.length !== 4 || !octets.every((part) => /^\d{1,3}$/.test(part))) return false;
  const [a, b] = octets.map(Number) as [number, number, number, number];
  if (octets.some((part) => Number(part) > 255)) return false;
  return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function checkKey(value: string | undefined, problems: string[]): string | null {
  if (!value) {
    problems.push('EXPO_PUBLIC_SUPABASE_KEY is not set.');
    return null;
  }
  if (value.startsWith('sb_secret_') || jwtRole(value) === 'service_role') {
    problems.push(
      'EXPO_PUBLIC_SUPABASE_KEY is a secret key. Only the publishable (or legacy anon) key may ship in the app; rotate the exposed key.',
    );
    return null;
  }
  return value;
}

/** The `role` claim of a legacy JWT API key, or null when the value is not a readable JWT. */
function jwtRole(value: string): string | null {
  const parts = value.split('.');
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const payload: unknown = JSON.parse(globalThis.atob(padded));
    if (typeof payload === 'object' && payload !== null && 'role' in payload) {
      return typeof payload.role === 'string' ? payload.role : null;
    }
    return null;
  } catch {
    return null;
  }
}
