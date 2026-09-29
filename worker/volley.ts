import { isRoomCode, newRoomCode } from '../src/lib/volley-online/protocol';

/**
 * HTTP side of the online volleyball (docs/volei-online.md, "API"):
 *
 *   POST /api/volley/rooms        → 201 { code }   a new room (its Durable Object is initialised)
 *   GET  /api/volley/rooms/:code  → 101            WebSocket into that room's Durable Object
 *                                 → 200 { code, phase, players } / 404   without the upgrade (a pre-check)
 *
 * Everything after the upgrade happens inside the room (worker/volley-room.ts).
 */

export interface VolleyEnv {
  /** Absent on preview deployments (see wrangler.jsonc): the API answers 503 and the UI says online is unavailable. */
  VOLLEY_ROOMS?: DurableObjectNamespace;
  ROOM_LIMIT?: RateLimit;
}

type VolleyError = 'not_found' | 'forbidden' | 'rate_limited' | 'unavailable';

const ROOM_PATH = /^\/api\/volley\/rooms\/([^/]+)$/;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

const fail = (error: VolleyError, status: number) => json({ error }, status);

/** Uniform [0, 1) from the platform's CSPRNG (codes shouldn't be predictable). */
const secureRandom = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;

export async function handleVolley(request: Request, url: URL, env: VolleyEnv): Promise<Response> {
  if (url.pathname === '/api/volley/rooms') {
    if (request.method !== 'POST') return fail('not_found', 404);
    return createRoom(request, url, env);
  }
  const code = ROOM_PATH.exec(url.pathname)?.[1];
  if (code !== undefined && request.method === 'GET') return joinRoom(request, url, env, code);
  return fail('not_found', 404);
}

async function createRoom(request: Request, url: URL, env: VolleyEnv): Promise<Response> {
  // Browsers always send Origin on a cross-site POST: another site can't mint rooms from its pages.
  const origin = request.headers.get('Origin');
  if (origin !== null && origin !== url.origin) return fail('forbidden', 403);
  if (env.ROOM_LIMIT) {
    const { success } = await env.ROOM_LIMIT.limit({ key: request.headers.get('CF-Connecting-IP') ?? 'unknown' });
    if (!success) return fail('rate_limited', 429);
  }
  const rooms = env.VOLLEY_ROOMS;
  if (!rooms) return fail('unavailable', 503);

  // 28.6 million codes: a collision with a live room is rare; retry a few times anyway.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newRoomCode(secureRandom);
    const res = await rooms.get(rooms.idFromName(code)).fetch('https://volley-room/init', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
    if (res.status === 201) return json({ code }, 201);
  }
  return fail('unavailable', 503);
}

/** WebSocket upgrade → the room; plain GET → the room's summary ({ code, phase, players } or 404). */
function joinRoom(request: Request, url: URL, env: VolleyEnv, code: string): Response | Promise<Response> {
  if (!isRoomCode(code)) return fail('not_found', 404);
  const upgrade = request.headers.get('Upgrade')?.toLowerCase() === 'websocket';
  // A WebSocket isn't bound by CORS: without this, any page could open one on a visitor's behalf.
  if (upgrade && request.headers.get('Origin') !== url.origin) return fail('forbidden', 403);
  const rooms = env.VOLLEY_ROOMS;
  if (!rooms) return fail('unavailable', 503);
  const stub = rooms.get(rooms.idFromName(code));
  return upgrade ? stub.fetch(request) : stub.fetch(`https://volley-room/rooms/${code}`);
}
