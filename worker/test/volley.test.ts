import { describe, expect, it } from 'vitest';
import { isRoomCode } from '../../src/lib/volley-online/protocol';
import worker, { type Env } from '../index';

const ORIGIN = 'https://portfolio.test';

/** Records what reaches each room and answers /init like the Durable Object (201 once, then 409). */
function fakeRooms(initStatuses: number[] = []) {
  const calls: { name: string; url: string; method: string }[] = [];
  const created = new Set<string>();
  const ns = {
    idFromName: (name: string) => ({ name }),
    get: (id: { name: string }) => ({
      fetch: async (input: RequestInfo, init?: RequestInit) => {
        const req = input instanceof Request ? input : new Request(input, init);
        calls.push({ name: id.name, url: req.url, method: req.method });
        if (new URL(req.url).pathname === '/init') {
          const forced = initStatuses.shift();
          if (forced) return new Response(null, { status: forced });
          if (created.has(id.name)) return new Response(null, { status: 409 });
          created.add(id.name);
          return new Response(null, { status: 201 });
        }
        // Stand-in for the 101 upgrade (Node can't build one): proves the request was forwarded.
        return new Response('forwarded', { status: 200 });
      },
    }),
  };
  return { ns: ns as unknown as DurableObjectNamespace, calls };
}

const limiter = (allow: boolean): RateLimit => ({ limit: async () => ({ success: allow }) }) as RateLimit;

function call(env: Env, method: string, path: string, headers: Record<string, string> = {}) {
  const req = new Request(`${ORIGIN}${path}`, { method, headers });
  return worker.fetch(req as Request<unknown, IncomingRequestCfProperties>, env);
}

describe('POST /api/volley/rooms', () => {
  it('creates a room and returns its code', async () => {
    const { ns, calls } = fakeRooms();
    const res = await call({ VOLLEY_ROOMS: ns }, 'POST', '/api/volley/rooms', { Origin: ORIGIN });
    expect(res.status).toBe(201);
    const { code } = (await res.json()) as { code: string };
    expect(isRoomCode(code)).toBe(true);
    expect(calls).toEqual([{ name: code, url: 'https://volley-room/init', method: 'POST' }]);
  });

  it('draws another code when one is already taken', async () => {
    const { ns, calls } = fakeRooms([409, 409]);
    const res = await call({ VOLLEY_ROOMS: ns }, 'POST', '/api/volley/rooms', { Origin: ORIGIN });
    expect(res.status).toBe(201);
    expect(calls).toHaveLength(3);
  });

  it('refuses other sites, rate-limited IPs, and says unavailable without the binding (previews)', async () => {
    const { ns } = fakeRooms();
    expect(
      (await call({ VOLLEY_ROOMS: ns }, 'POST', '/api/volley/rooms', { Origin: 'https://evil.test' })).status,
    ).toBe(403);
    const limited = await call({ VOLLEY_ROOMS: ns, ROOM_LIMIT: limiter(false) }, 'POST', '/api/volley/rooms', {
      Origin: ORIGIN,
    });
    expect(limited.status).toBe(429);
    const preview = await call({}, 'POST', '/api/volley/rooms', { Origin: ORIGIN });
    expect(preview.status).toBe(503);
    expect(await preview.json()).toEqual({ error: 'unavailable' });
  });
});

describe('GET /api/volley/rooms/:code (WebSocket)', () => {
  const ws = { Upgrade: 'websocket', Origin: ORIGIN };

  it('forwards the upgrade to that room’s Durable Object', async () => {
    const { ns, calls } = fakeRooms();
    const res = await call({ VOLLEY_ROOMS: ns }, 'GET', '/api/volley/rooms/ABC23', ws);
    expect(await res.text()).toBe('forwarded');
    expect(calls).toEqual([{ name: 'ABC23', url: `${ORIGIN}/api/volley/rooms/ABC23`, method: 'GET' }]);
  });

  it('rejects malformed codes, other origins, and missing bindings', async () => {
    const { ns, calls } = fakeRooms();
    const env = { VOLLEY_ROOMS: ns };
    expect((await call(env, 'GET', '/api/volley/rooms/abc23', ws)).status).toBe(404);
    expect((await call(env, 'GET', '/api/volley/rooms/ABCO1', ws)).status).toBe(404);
    expect((await call(env, 'GET', '/api/volley/rooms/ABC23', { ...ws, Origin: 'https://evil.test' })).status).toBe(
      403,
    );
    expect((await call(env, 'GET', '/api/volley/rooms/ABC23', { Upgrade: 'websocket' })).status).toBe(403);
    expect(calls).toHaveLength(0);
    expect((await call({}, 'GET', '/api/volley/rooms/ABC23', ws)).status).toBe(503);
  });

  it('answers a plain GET with the room’s summary from its Durable Object (the page’s pre-check)', async () => {
    const { ns, calls } = fakeRooms();
    const res = await call({ VOLLEY_ROOMS: ns }, 'GET', '/api/volley/rooms/ABC23');
    expect(await res.text()).toBe('forwarded');
    expect(calls).toEqual([{ name: 'ABC23', url: 'https://volley-room/rooms/ABC23', method: 'GET' }]);
  });

  it('answers 404 for anything else under /api/volley', async () => {
    const { ns } = fakeRooms();
    expect((await call({ VOLLEY_ROOMS: ns }, 'GET', '/api/volley/rooms', {})).status).toBe(404);
    expect((await call({ VOLLEY_ROOMS: ns }, 'DELETE', '/api/volley/rooms/ABC23', ws)).status).toBe(404);
  });
});

describe('GET /api/volley/queue (quick match)', () => {
  const ws = { Upgrade: 'websocket', Origin: ORIGIN };

  it('forwards the upgrade to the one global queue', async () => {
    const rooms = fakeRooms();
    const queue = fakeRooms();
    const res = await call({ VOLLEY_ROOMS: rooms.ns, VOLLEY_QUEUE: queue.ns }, 'GET', '/api/volley/queue', ws);
    expect(await res.text()).toBe('forwarded');
    expect(queue.calls).toEqual([{ name: 'global', url: `${ORIGIN}/api/volley/queue`, method: 'GET' }]);
  });

  it('answers the pre-check without touching the queue', async () => {
    const queue = fakeRooms();
    const res = await call({ VOLLEY_ROOMS: fakeRooms().ns, VOLLEY_QUEUE: queue.ns }, 'GET', '/api/volley/queue');
    expect(res.status).toBe(204);
    expect(queue.calls).toHaveLength(0);
  });

  it('refuses other sites, rate-limited IPs, missing bindings and other methods', async () => {
    const env = { VOLLEY_ROOMS: fakeRooms().ns, VOLLEY_QUEUE: fakeRooms().ns };
    expect((await call(env, 'GET', '/api/volley/queue', { ...ws, Origin: 'https://evil.test' })).status).toBe(403);
    expect((await call({ ...env, QUEUE_LIMIT: limiter(false) }, 'GET', '/api/volley/queue')).status).toBe(429);
    expect((await call({ ...env, QUEUE_LIMIT: limiter(false) }, 'GET', '/api/volley/queue', ws)).status).toBe(429);
    expect((await call({ VOLLEY_ROOMS: env.VOLLEY_ROOMS }, 'GET', '/api/volley/queue')).status).toBe(503);
    expect((await call({}, 'GET', '/api/volley/queue', ws)).status).toBe(503);
    expect((await call(env, 'POST', '/api/volley/queue', ws)).status).toBe(404);
  });
});
