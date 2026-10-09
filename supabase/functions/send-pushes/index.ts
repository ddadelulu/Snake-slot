/**
 * Edge Function send-pushes (Deno): delivers due alerts as push notifications through the Expo
 * push API. Scheduled every 5 minutes (docs/DATA_MODEL.md, "Push delivery"). All logic lives in
 * ./expo.ts (unit-tested); this file only reads the environment and answers the request.
 *
 * Environment (never in the repository):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  set by Supabase for every Edge Function
 *   EXPO_ACCESS_TOKEN                        optional, when "enhanced push security" is on in Expo
 */
import { isAuthorized, sendPushes } from './expo.ts';

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): unknown;
};

Deno.serve(async (request) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    return Response.json({ error: 'not_configured' }, { status: 500 });
  }
  if (request.method !== 'POST') {
    return Response.json({ error: 'method_not_allowed' }, { status: 405 });
  }
  if (!isAuthorized(request.headers.get('authorization'), serviceKey)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const summary = await sendPushes({
      supabaseUrl,
      serviceKey,
      accessToken: Deno.env.get('EXPO_ACCESS_TOKEN'),
      fetch: (input, init) => fetch(input, init),
    });
    return Response.json(summary);
  } catch (error) {
    console.error('send-pushes failed', error);
    return Response.json({ error: 'database_unavailable' }, { status: 502 });
  }
});
