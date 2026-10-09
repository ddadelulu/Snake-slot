/**
 * The send-pushes Edge Function's logic (supabase/functions/send-pushes/expo.ts) with a fake
 * fetch: messages per alert and device, batches of 100, ticket handling, forgetting unregistered
 * devices, repeated rounds and the scheduler's authorization. No database needed.
 */
import { describe, expect, it } from 'vitest';
import {
  CLAIM_LIMIT,
  type ClaimedPush,
  EXPO_PUSH_URL,
  type ExpoMessage,
  buildMessages,
  chunk,
  isAuthorized,
  readTickets,
  sendPushes,
  sendToExpo,
} from '../functions/send-pushes/expo';

const SUPABASE_URL = 'https://project.supabase.test/';
const SERVICE_KEY = 'service-key-for-tests';

function push(index: number, tokens: string[] | null = [`ExponentPushToken[${index}]`]) {
  return {
    alert_id: `alert-${index}`,
    user_id: `user-${index}`,
    type: 'category_80',
    title: '«Lebensmittel» fast aufgebraucht',
    body: '80 % von «Lebensmittel» sind weg. Noch CHF 40.00 übrig.',
    data: { alert_id: `alert-${index}`, type: 'category_80' },
    sound: true,
    tokens,
  } satisfies ClaimedPush;
}

interface Call {
  url: string;
  init: RequestInit;
  body: unknown;
}

/** A fake fetch: answers by URL with `handler`, records every call. */
function fakeFetch(handler: (url: string, body: unknown) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetch = async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    calls.push({ url, init, body });
    return handler(url, body);
  };
  return { fetch, calls };
}

const okTickets = (messages: unknown) =>
  Response.json({ data: (messages as unknown[]).map((_, i) => ({ status: 'ok', id: `t${i}` })) });

describe('buildMessages', () => {
  it('makes one message per alert and device, with sound only when the profile has it on', () => {
    const silent = { ...push(2, ['ExponentPushToken[a]', 'ExponentPushToken[b]']), sound: false };
    const messages = buildMessages([push(1), silent, push(3, null)]);
    expect(messages).toEqual([
      {
        to: 'ExponentPushToken[1]',
        title: push(1).title,
        body: push(1).body,
        data: push(1).data,
        sound: 'default',
        priority: 'high',
      },
      expect.objectContaining({ to: 'ExponentPushToken[a]', sound: null }),
      expect.objectContaining({ to: 'ExponentPushToken[b]', sound: null }),
    ]);
  });
});

describe('chunk', () => {
  it('splits into batches of at most the given size, in order', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 100)).toEqual([]);
    expect(() => chunk([1], 0)).toThrow();
  });
});

describe('readTickets', () => {
  const batch = buildMessages([push(1), push(2), push(3)]);

  it('counts ok tickets and collects unregistered devices', () => {
    expect(
      readTickets(batch, {
        data: [
          { status: 'ok', id: 'a' },
          {
            status: 'error',
            message: 'not registered',
            details: { error: 'DeviceNotRegistered' },
          },
          { status: 'error', message: 'too big', details: { error: 'MessageTooBig' } },
        ],
      }),
    ).toEqual({ sent: 1, failed: 2, unregistered: ['ExponentPushToken[2]'] });
  });

  it.each([null, {}, { data: 'x' }, { data: [{ status: 'ok', id: 'a' }] }])(
    'counts the whole batch as failed for an unreadable answer (%j)',
    (payload) => {
      expect(readTickets(batch, payload)).toEqual({ sent: 0, failed: 3, unregistered: [] });
    },
  );
});

describe('sendToExpo', () => {
  it('posts batches of 100 to the Expo push API, with the access token when given', async () => {
    const messages: ExpoMessage[] = buildMessages(Array.from({ length: 250 }, (_, i) => push(i)));
    const { fetch, calls } = fakeFetch((_url, body) => okTickets(body));
    const result = await sendToExpo(messages, { fetch, accessToken: 'expo-token' });
    expect(result).toEqual({ sent: 250, failed: 0, unregistered: [] });
    expect(calls.map((call) => (call.body as unknown[]).length)).toEqual([100, 100, 50]);
    expect(calls.every((call) => call.url === EXPO_PUSH_URL)).toBe(true);
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer expo-token');
    expect(headers['content-type']).toBe('application/json');
    expect((calls[2]?.body as ExpoMessage[])[49]?.to).toBe('ExponentPushToken[249]');
  });

  it('sends no authorization header without an access token, and nothing for no messages', async () => {
    const { fetch, calls } = fakeFetch((_url, body) => okTickets(body));
    await sendToExpo(buildMessages([push(1)]), { fetch });
    expect((calls[0]?.init.headers as Record<string, string>).authorization).toBeUndefined();
    expect(await sendToExpo([], { fetch })).toEqual({ sent: 0, failed: 0, unregistered: [] });
    expect(calls).toHaveLength(1);
  });

  it('counts a failed or rejected batch as failed and goes on with the next one', async () => {
    let call = 0;
    const { fetch } = fakeFetch((_url, body) => {
      call += 1;
      if (call === 1) return new Response('busy', { status: 503 });
      if (call === 2) throw new Error('network down');
      return okTickets(body);
    });
    const messages = buildMessages(Array.from({ length: 230 }, (_, i) => push(i)));
    expect(await sendToExpo(messages, { fetch })).toEqual({
      sent: 30,
      failed: 200,
      unregistered: [],
    });
  });
});

describe('sendPushes', () => {
  it('claims with the service key, sends, and forgets unregistered devices', async () => {
    const claimed = [push(1), push(2, ['ExponentPushToken[gone]'])];
    const { fetch, calls } = fakeFetch((url, body) => {
      if (url.endsWith('/rpc/claim_pushes')) return Response.json(claimed);
      if (url.endsWith('/rpc/forget_push_tokens')) return Response.json(1);
      const messages = body as ExpoMessage[];
      return Response.json({
        data: messages.map((m) =>
          m.to === 'ExponentPushToken[gone]'
            ? { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } }
            : { status: 'ok', id: m.to },
        ),
      });
    });
    const summary = await sendPushes({ supabaseUrl: SUPABASE_URL, serviceKey: SERVICE_KEY, fetch });
    expect(summary).toEqual({ claimed: 2, sent: 1, failed: 1, forgotten: 1 });
    expect(calls.map((call) => call.url)).toEqual([
      'https://project.supabase.test/rest/v1/rpc/claim_pushes',
      EXPO_PUSH_URL,
      'https://project.supabase.test/rest/v1/rpc/forget_push_tokens',
    ]);
    expect(calls[0]?.body).toEqual({ p_limit: CLAIM_LIMIT });
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers.apikey).toBe(SERVICE_KEY);
    expect(headers.authorization).toBe(`Bearer ${SERVICE_KEY}`);
    expect(calls[2]?.body).toEqual({ p_tokens: ['ExponentPushToken[gone]'] });
  });

  it('claims again while a round is full, and stops after a short one', async () => {
    let round = 0;
    const { fetch, calls } = fakeFetch((url, body) => {
      if (url.endsWith('/rpc/claim_pushes')) {
        round += 1;
        const size = round === 1 ? CLAIM_LIMIT : 3;
        return Response.json(Array.from({ length: size }, (_, i) => push(round * 1000 + i)));
      }
      return okTickets(body);
    });
    const summary = await sendPushes({ supabaseUrl: SUPABASE_URL, serviceKey: SERVICE_KEY, fetch });
    expect(summary).toEqual({
      claimed: CLAIM_LIMIT + 3,
      sent: CLAIM_LIMIT + 3,
      failed: 0,
      forgotten: 0,
    });
    expect(calls.filter((call) => call.url.endsWith('/rpc/claim_pushes'))).toHaveLength(2);
  });

  it('does not call Expo when nothing is due', async () => {
    const { fetch, calls } = fakeFetch(() => Response.json([]));
    expect(await sendPushes({ supabaseUrl: SUPABASE_URL, serviceKey: SERVICE_KEY, fetch })).toEqual(
      { claimed: 0, sent: 0, failed: 0, forgotten: 0 },
    );
    expect(calls).toHaveLength(1);
  });

  it('throws when the database refuses the claim', async () => {
    const { fetch } = fakeFetch(() => new Response('permission denied', { status: 403 }));
    await expect(
      sendPushes({ supabaseUrl: SUPABASE_URL, serviceKey: SERVICE_KEY, fetch }),
    ).rejects.toThrow('claim_pushes failed with HTTP 403');
  });
});

describe('isAuthorized', () => {
  it('accepts exactly the service key as bearer token', () => {
    expect(isAuthorized(`Bearer ${SERVICE_KEY}`, SERVICE_KEY)).toBe(true);
    expect(isAuthorized(`Bearer ${SERVICE_KEY}x`, SERVICE_KEY)).toBe(false);
    expect(isAuthorized('Bearer anon-key-for-test', SERVICE_KEY)).toBe(false);
    expect(isAuthorized(null, SERVICE_KEY)).toBe(false);
    expect(isAuthorized('Bearer ', '')).toBe(false);
  });
});
