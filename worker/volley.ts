import { isRoomCode, newRoomCode } from '../src/lib/volley-online/protocol';

/**
 * HTTP side of the online volleyball (docs/volei-online.md, "API"):
 *
 *   POST /api/volley/rooms        → 201 { code }   a new room (its Durable Object is initialised)
 *   GET  /api/volley/rooms/:code  → 101            WebSocket into that room's Durable Object
 *                                 → 200 { code, phase, players } / 404   without the upgrade (a pre-check)
 *   GET  /api/volley/queue        → 101            WebSocket into the quick-match queue
 *                                 → 204            without the upgrade (a pre-check: online is up, not rate-limited)
 *
 * Everything after the upgrade happens inside the room (worker/volley-room.ts)
 * or the queue (worker/volley-queue.ts).
 */

export interface VolleyEnv {
  /** Absent on preview deployments (see wrangler.jsonc): the API answers 503 and the UI says online is unavailable. */
  VOLLEY_ROOMS?: DurableObjectNamespace;
  /** The quick-match queue: one Durable Object for everyone (`idFromName('global')`). */
  VOLLEY_QUEUE?: DurableObjectNamespace;
  ROOM_LIMIT?: RateLimit;
  QUEUE_LIMIT?: RateLimit;
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
  if (url.pathname === '/api/volley/queue') {
    if (request.method !== 'GET') return fail('not_found', 404);
    return joinQueue(request, url, env);
  }
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
  const code = await openRoom(rooms);
  return code ? json({ code }, 201) : fail('unavailable', 503);
}

/** Initialises a room under a fresh code (also used by the quick-match queue). Null if none could be opened. */
export async function openRoom(rooms: DurableObjectNamespace): Promise<string | null> {
  // 28.6 million codes: a collision with a live room is rare; retry a few times anyway.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newRoomCode(secureRandom);
    const res = await rooms.get(rooms.idFromName(code)).fetch('https://volley-room/init', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
    if (res.status === 201) return code;
  }
  return null;
}

/**
 * Quick match. The pre-check and the upgrade both count against QUEUE_LIMIT, so
 * the page learns about a 429 before opening a socket (a refused handshake can't say why).
 */
async function joinQueue(request: Request, url: URL, env: VolleyEnv): Promise<Response> {
  const upgrade = request.headers.get('Upgrade')?.toLowerCase() === 'websocket';
  if (upgrade && request.headers.get('Origin') !== url.origin) return fail('forbidden', 403);
  if (env.QUEUE_LIMIT) {
    const { success } = await env.QUEUE_LIMIT.limit({ key: request.headers.get('CF-Connecting-IP') ?? 'unknown' });
    if (!success) return fail('rate_limited', 429);
  }
  const queue = env.VOLLEY_QUEUE;
  if (!queue || !env.VOLLEY_ROOMS) return fail('unavailable', 503);
  if (!upgrade) return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  return queue.get(queue.idFromName('global')).fetch(request);
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
