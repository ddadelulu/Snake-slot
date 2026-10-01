import type { QueryClient } from '@tanstack/react-query';
import type { AppStateStatus } from 'react-native';

import {
  createQueryClient as createAppQueryClient,
  QUERY_GC_TIME_MS,
  QUERY_STALE_TIME_MS,
  shouldRetryQuery,
} from './queryClient';
import { isClientError, RequestError, toRequestError } from './requestError';

describe('RequestError', () => {
  it('keeps status and code and flags network failures', () => {
    const error = new RequestError('boom', 0, '');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('RequestError');
    expect(error.isNetworkError).toBe(true);
    expect(new RequestError('denied', 403, '42501').isNetworkError).toBe(false);
  });

  it('wraps a postgrest-js failure', () => {
    const error = toRequestError({
      error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' },
      status: 406,
    });
    expect(error).toMatchObject({ status: 406, code: 'PGRST116' });
    expect(toRequestError({ error: null, status: 500 })).toMatchObject({
      message: 'Request failed',
      status: 500,
      code: '',
    });
  });
});

describe('isClientError', () => {
  it.each([
    [new RequestError('x', 400, ''), true],
    [new RequestError('x', 401, ''), true],
    [new RequestError('x', 404, ''), true],
    [new RequestError('x', 406, 'PGRST116'), true],
    [{ status: 422 }, true],
    [new RequestError('x', 408, ''), false],
    [new RequestError('x', 429, ''), false],
    [new RequestError('x', 0, ''), false],
    [new RequestError('x', 500, ''), false],
    [new RequestError('x', 503, ''), false],
    [new Error('x'), false],
    [{ status: '404' }, false],
    [null, false],
    ['404', false],
  ])('%p → %s', (error, expected) => {
    expect(isClientError(error)).toBe(expected);
  });
});

describe('shouldRetryQuery', () => {
  it('retries network and server failures twice', () => {
    const offline = new RequestError('offline', 0, '');
    expect(shouldRetryQuery(0, offline)).toBe(true);
    expect(shouldRetryQuery(1, offline)).toBe(true);
    expect(shouldRetryQuery(2, offline)).toBe(false);
    expect(shouldRetryQuery(0, new RequestError('down', 503, ''))).toBe(true);
    expect(shouldRetryQuery(0, new Error('unknown'))).toBe(true);
  });

  it('does not retry 4xx answers', () => {
    expect(shouldRetryQuery(0, new RequestError('rls', 403, '42501'))).toBe(false);
    expect(shouldRetryQuery(0, new RequestError('missing', 404, ''))).toBe(false);
  });

  it('retries rate limits and timeouts', () => {
    expect(shouldRetryQuery(0, new RequestError('slow down', 429, ''))).toBe(true);
    expect(shouldRetryQuery(0, new RequestError('timeout', 408, ''))).toBe(true);
  });
});

describe('createQueryClient', () => {
  // Cached queries hold five-minute garbage-collection timers; clear them so Jest can exit.
  const clients: QueryClient[] = [];
  const createQueryClient = () => {
    const client = createAppQueryClient();
    clients.push(client);
    return client;
  };
  afterEach(() => {
    clients.splice(0).forEach((client) => client.clear());
    jest.restoreAllMocks();
  });

  it('uses mobile defaults', () => {
    const client = createQueryClient();
    const { queries, mutations } = client.getDefaultOptions();
    expect(queries?.staleTime).toBe(QUERY_STALE_TIME_MS);
    expect(QUERY_STALE_TIME_MS).toBe(30_000);
    expect(queries?.gcTime).toBe(QUERY_GC_TIME_MS);
    expect(queries?.retry).toBe(shouldRetryQuery);
    expect(mutations?.retry).toBe(false);
  });

  it('creates independent clients', () => {
    expect(createQueryClient()).not.toBe(createQueryClient());
  });

  it('stops retrying a query after two retries, and never retries a 4xx', async () => {
    const client = createQueryClient();
    client.setDefaultOptions({
      ...client.getDefaultOptions(),
      queries: { ...client.getDefaultOptions().queries, retryDelay: 0 },
    });

    const offline = jest.fn(async () => {
      throw new RequestError('offline', 0, '');
    });
    await expect(client.fetchQuery({ queryKey: ['offline'], queryFn: offline })).rejects.toThrow(
      'offline',
    );
    expect(offline).toHaveBeenCalledTimes(3);

    const forbidden = jest.fn(async () => {
      throw new RequestError('forbidden', 403, '42501');
    });
    await expect(
      client.fetchQuery({ queryKey: ['forbidden'], queryFn: forbidden }),
    ).rejects.toThrow('forbidden');
    expect(forbidden).toHaveBeenCalledTimes(1);
  });

  /** A fresh module registry: the AppState wiring happens once per app (module instance). */
  function loadFresh(os: 'ios' | 'web') {
    jest.resetModules();
    // A fresh registry needs require(): dynamic import() would need Jest's experimental ESM mode.
    /* eslint-disable @typescript-eslint/no-require-imports */
    const ReactNative = require('react-native') as typeof import('react-native');
    Object.defineProperty(ReactNative.Platform, 'OS', {
      value: os,
      configurable: true,
      writable: true,
    });
    const listeners: ((state: AppStateStatus) => void)[] = [];
    const remove = jest.fn();
    jest.spyOn(ReactNative.AppState, 'addEventListener').mockImplementation((_type, listener) => {
      listeners.push(listener as (state: AppStateStatus) => void);
      return { remove };
    });
    const query = require('@tanstack/react-query') as typeof import('@tanstack/react-query');
    const mod = require('./queryClient') as typeof import('./queryClient');
    /* eslint-enable @typescript-eslint/no-require-imports */
    const create = () => {
      const client = mod.createQueryClient();
      clients.push(client);
      return client;
    };
    return { create, focusManager: query.focusManager, listeners, remove };
  }

  it('treats the app coming to the foreground as focus on native', () => {
    const { create, focusManager: freshFocusManager, listeners } = loadFresh('ios');
    create();
    create();
    expect(listeners).toHaveLength(1);

    listeners[0]?.('background');
    expect(freshFocusManager.isFocused()).toBe(false);
    listeners[0]?.('active');
    expect(freshFocusManager.isFocused()).toBe(true);
  });

  it('keeps the browser focus handling on web', () => {
    const { create, listeners } = loadFresh('web');
    create();
    expect(listeners).toHaveLength(0);
  });
});
