/**
 * The send-pushes Edge Function without I/O of its own: claims due alerts from the database
 * (`claim_pushes`, service role), turns them into Expo push messages, sends them to the Expo push
 * API in batches of 100 and forgets device tokens Expo reports as no longer registered
 * (`forget_push_tokens`). Every network call goes through the `fetch` passed in, so the module is
 * tested with a fake (supabase/tests/send-pushes.test.ts) and runs unchanged under Deno.
 *
 * Delivery is at most once: `claim_pushes` marks an alert as pushed before it is sent, so a
 * failed request is reported and not retried (a duplicate push is worse than a missing one; the
 * alert stays in the in-app inbox).
 */

/** One row of `claim_pushes` (docs/API.md, "Push"). */
export interface ClaimedPush {
  alert_id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  sound: boolean;
  tokens: string[] | null;
}

/** A message for https://exp.host/--/api/v2/push/send. */
export interface ExpoMessage {
  to: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  sound: 'default' | null;
  priority: 'high';
}

/** One ticket of the Expo response, in the order of the messages sent. */
export type ExpoTicket =
  { status: 'ok'; id: string } | { status: 'error'; message: string; details?: { error?: string } };

export type Fetch = (input: string, init: RequestInit) => Promise<Response>;

export interface SendSummary {
  /** Alerts claimed from the database. */
  claimed: number;
  /** Messages Expo accepted (one per alert and device). */
  sent: number;
  /** Messages that failed (error ticket, failed request or unreadable response). */
  failed: number;
  /** Device tokens removed because Expo reported them as not registered. */
  forgotten: number;
}

export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
export const EXPO_BATCH_SIZE = 100;
/** Alerts claimed per round; a run repeats while a round is full, at most MAX_ROUNDS times. */
export const CLAIM_LIMIT = 500;
export const MAX_ROUNDS = 10;

/** One message per alert and device, in claim order. */
export function buildMessages(pushes: readonly ClaimedPush[]): ExpoMessage[] {
  return pushes.flatMap((push) =>
    (push.tokens ?? []).map((token) => ({
      to: token,
      title: push.title,
      body: push.body,
      data: push.data,
      sound: push.sound ? ('default' as const) : null,
      priority: 'high' as const,
    })),
  );
}

/** Splits `items` into consecutive batches of at most `size`. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (!Number.isInteger(size) || size < 1) throw new Error(`invalid batch size: ${size}`);
  const batches: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    batches.push(items.slice(start, start + size));
  }
  return batches;
}

/**
 * Reads Expo's answer to one batch: how many messages were accepted and which tokens are no
 * longer registered. A response without one ticket per message counts the whole batch as failed.
 */
export function readTickets(
  batch: readonly ExpoMessage[],
  payload: unknown,
): { sent: number; failed: number; unregistered: string[] } {
  const tickets = (payload as { data?: unknown } | null)?.data;
  if (!Array.isArray(tickets) || tickets.length !== batch.length) {
    return { sent: 0, failed: batch.length, unregistered: [] };
  }
  let sent = 0;
  let failed = 0;
  const unregistered: string[] = [];
  tickets.forEach((ticket: ExpoTicket, index) => {
    if (ticket?.status === 'ok') {
      sent += 1;
      return;
    }
    failed += 1;
    const message = batch[index];
    if (ticket?.status === 'error' && ticket.details?.error === 'DeviceNotRegistered' && message) {
      unregistered.push(message.to);
    }
  });
  return { sent, failed, unregistered };
}

/** Sends the messages in batches of 100; never throws for a failed batch. */
export async function sendToExpo(
  messages: readonly ExpoMessage[],
  options: { fetch: Fetch; accessToken?: string | undefined },
): Promise<{ sent: number; failed: number; unregistered: string[] }> {
  const total = { sent: 0, failed: 0, unregistered: [] as string[] };
  for (const batch of chunk(messages, EXPO_BATCH_SIZE)) {
    const headers: Record<string, string> = {
      accept: 'application/json',
      'accept-encoding': 'gzip, deflate',
      'content-type': 'application/json',
    };
    if (options.accessToken) headers.authorization = `Bearer ${options.accessToken}`;
    let result: { sent: number; failed: number; unregistered: string[] };
    try {
      const response = await options.fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(batch),
      });
      result = response.ok
        ? readTickets(batch, await response.json())
        : { sent: 0, failed: batch.length, unregistered: [] };
    } catch {
      result = { sent: 0, failed: batch.length, unregistered: [] };
    }
    total.sent += result.sent;
    total.failed += result.failed;
    total.unregistered.push(...result.unregistered);
  }
  return total;
}

interface DatabaseOptions {
  supabaseUrl: string;
  serviceKey: string;
  fetch: Fetch;
}

async function callRpc(options: DatabaseOptions, name: string, args: object): Promise<unknown> {
  const response = await options.fetch(
    `${options.supabaseUrl.replace(/\/+$/, '')}/rest/v1/rpc/${name}`,
    {
      method: 'POST',
      headers: {
        apikey: options.serviceKey,
        authorization: `Bearer ${options.serviceKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(args),
    },
  );
  if (!response.ok) {
    throw new Error(`${name} failed with HTTP ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

/**
 * One run: claim, send and clean up until a round claims fewer than CLAIM_LIMIT alerts. Throws
 * when the database cannot be reached (nothing was claimed then, so nothing is lost).
 */
export async function sendPushes(
  options: DatabaseOptions & { accessToken?: string | undefined },
): Promise<SendSummary> {
  const summary: SendSummary = { claimed: 0, sent: 0, failed: 0, forgotten: 0 };
  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const claimed = (await callRpc(options, 'claim_pushes', {
      p_limit: CLAIM_LIMIT,
    })) as ClaimedPush[];
    summary.claimed += claimed.length;
    const result = await sendToExpo(buildMessages(claimed), options);
    summary.sent += result.sent;
    summary.failed += result.failed;
    if (result.unregistered.length > 0) {
      summary.forgotten += Number(
        await callRpc(options, 'forget_push_tokens', {
          p_tokens: [...new Set(result.unregistered)],
        }),
      );
    }
    if (claimed.length < CLAIM_LIMIT) break;
  }
  return summary;
}

/**
 * Only the scheduler may start a run: it sends the service role key as a bearer token. Compared
 * in constant time.
 */
export function isAuthorized(header: string | null, serviceKey: string): boolean {
  const expected = `Bearer ${serviceKey}`;
  if (!serviceKey || header === null || header.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= header.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}
