import type { Side } from '../src/components/volleyball/engine/types';
import { NET } from '../src/lib/volley-online/protocol';
import {
  newRoom,
  RoomCore,
  type Conn,
  type PersistedRoom,
  type RoomHost,
  type TimerName,
} from '../src/lib/volley-online/room';
import { publishLive } from './live';
import { ratingOf, recordResult } from './ratings';
import type { VolleyEnv } from './volley';

/**
 * One online volleyball room = one Durable Object (docs/volei-online.md).
 *
 * A thin adapter: the room's rules live in RoomCore (pure, unit-tested in
 * Node); this class plugs it into the Workers runtime:
 *
 * - WebSockets use the Hibernation API (`ctx.acceptWebSocket`): while a room
 *   sits in the lobby with nothing going on, the object can be evicted from
 *   memory without dropping the sockets, and pays nothing for idle time.
 *   Each socket carries its seat in a serialized attachment, and the lobby is
 *   in storage, so a woken object rebuilds the room exactly.
 * - During a match a 60 Hz interval drives the physics (RoomCore.loop runs
 *   the 120 Hz fixed steps); an active timer keeps the object in memory.
 * - A storage alarm deletes rooms nobody is connected to after their TTL.
 */

interface Attachment {
  id: string;
  /** The seat this socket holds, 'watch' for a spectator, null before its hello. */
  side: Side | 'watch' | null;
  /** The client's address (CF-Connecting-IP), so one person can't farm rating off two tabs. */
  ip?: string;
}

const STORAGE_KEY = 'room';

function hex(bytes: Uint8Array) {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export class VolleyRoom implements DurableObject {
  private core: RoomCore | null = null;
  private readonly conns = new Map<WebSocket, Conn>();
  private readonly timers = new Map<TimerName, ReturnType<typeof setTimeout>>();
  private loop: ReturnType<typeof setTimeout> | null = null;
  /** Showcase writes, one after the other. */
  private liveWrites: Promise<void> = Promise.resolve();
  /** The match loop is wanted (setLoop(true)); the timer re-arms itself while it is. */
  private looping = false;

  private readonly host: RoomHost = {
    now: () => Date.now(),
    randomToken: () => hex(crypto.getRandomValues(new Uint8Array(16))),
    random: () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32,
    setTimer: (name, ms) => {
      const running = this.timers.get(name);
      if (running !== undefined) clearTimeout(running);
      this.timers.delete(name);
      if (ms === null) return;
      this.timers.set(
        name,
        setTimeout(() => {
          this.timers.delete(name);
          this.core?.timer(name);
        }, ms),
      );
    },
    // The loop sleeps exactly until the next snapshot tick is due (RoomCore.loop says how long), so a
    // snapshot leaves as soon as its tick is simulated instead of up to a 60 Hz interval later.
    setLoop: (running) => {
      this.looping = running;
      if (running && !this.loop) this.schedule(0);
      else if (!running && this.loop) {
        clearTimeout(this.loop);
        this.loop = null;
      }
    },
    // Storage writes are ordered and coalesced by the runtime; no need to await each one.
    persist: (state) => void this.ctx.storage.put(STORAGE_KEY, state),
    // Without the database (previews) nothing is rated: lookups say "new player", results aren't saved.
    rating: (pid) => (this.env.DB ? ratingOf(this.env.DB, pid) : Promise.resolve(null)),
    record: (result) => (this.env.DB ? recordResult(this.env.DB, result, Date.now()) : Promise.resolve(null)),
    // Best effort, but in order: a point and the final whistle must not land the other way round
    // (a stale row would linger in the showcase). A failed write is redone by the next point or heartbeat.
    live: (summary) => {
      const db = this.env.DB;
      const code = this.core?.code;
      if (!db || !code) return;
      const at = Date.now();
      this.liveWrites = this.liveWrites.then(() => publishLive(db, code, summary, at)).catch(() => {});
    },
  };

  constructor(
    private readonly ctx: DurableObjectState,
    private readonly env: VolleyEnv,
  ) {
    // Woken from hibernation (or first use): rebuild the lobby and reattach live sockets.
    void ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get<PersistedRoom>(STORAGE_KEY);
      if (!saved) return;
      this.core = new RoomCore(this.host, saved);
      for (const ws of ctx.getWebSockets()) {
        const side = (ws.deserializeAttachment() as Attachment | null)?.side;
        if (side === 0 || side === 1) this.core.restore(this.connFor(ws), side);
        else if (side === 'watch') this.core.restoreWatcher(this.connFor(ws));
        else ws.close(4000, 'expired'); // connected but never said hello before the object slept
      }
      this.core.restored();
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Called by the Worker when it hands out a new code (worker/volley.ts).
    if (url.pathname === '/init' && request.method === 'POST') {
      if (this.core) return new Response(null, { status: 409 });
      const { code, rated } = await request.json<{ code: string; rated?: boolean }>();
      const room = newRoom(code, Date.now(), rated === true);
      await this.ctx.storage.put(STORAGE_KEY, room);
      await this.ctx.storage.setAlarm(Date.now() + NET.ROOM_TTL_MS);
      this.core = new RoomCore(this.host, room);
      return new Response(null, { status: 201 });
    }

    if (!this.core) return Response.json({ error: 'room_not_found' }, { status: 404 });

    // Plain GET: a summary, so the page can say "not found" / "full" before opening a socket
    // (a failed WebSocket handshake doesn't tell the browser why).
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      const view = this.core.view();
      return Response.json(
        { code: view.code, phase: view.phase, players: view.seats.filter(Boolean).length },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    const ip = request.headers.get('CF-Connecting-IP') ?? undefined;
    server.serializeAttachment({ id: crypto.randomUUID(), side: null, ip } satisfies Attachment);
    this.core.connect(this.connFor(server));
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (!this.core) return ws.close(4000, 'expired');
    this.core.message(this.connFor(ws), message);
  }

  webSocketClose(ws: WebSocket) {
    this.gone(ws);
  }

  webSocketError(ws: WebSocket) {
    this.gone(ws);
  }

  /** TTL: delete the room if nobody is around, otherwise check again later. */
  async alarm() {
    if (this.core && !this.core.empty) {
      await this.ctx.storage.setAlarm(Date.now() + NET.ROOM_TTL_MS);
      return;
    }
    this.host.setLoop(false);
    for (const name of [...this.timers.keys()]) this.host.setTimer(name, null);
    this.core = null;
    await this.ctx.storage.deleteAll();
  }

  private schedule(ms: number) {
    this.loop = setTimeout(() => {
      this.loop = null;
      const next = this.core?.loop();
      // loop() may have stopped the loop (final whistle) or restarted it: only re-arm if wanted and not armed.
      if (next !== undefined && this.looping && !this.loop) this.schedule(next);
    }, ms);
  }

  private gone(ws: WebSocket) {
    const conn = this.conns.get(ws) ?? this.connFor(ws);
    this.conns.delete(ws);
    this.core?.closed(conn);
  }

  /** The room's view of a socket (one per socket, rebuilt from its attachment after hibernation). */
  private connFor(ws: WebSocket): Conn {
    const known = this.conns.get(ws);
    if (known) return known;
    const attachment = (ws.deserializeAttachment() as Attachment | null) ?? { id: crypto.randomUUID(), side: null };
    const conn: Conn = {
      id: attachment.id,
      ip: attachment.ip,
      send: (data) => {
        try {
          ws.send(data);
        } catch {
          // The socket is already closing: the close event will tell the room.
        }
      },
      close: (code, reason) => {
        try {
          ws.close(code, reason);
        } catch {
          // Already closed.
        }
      },
      bind: (side) => {
        attachment.side = side;
        ws.serializeAttachment(attachment);
      },
    };
    this.conns.set(ws, conn);
    return conn;
  }
}
