import { MatchQueue, type QueueConn, type QueueEntry, type QueueHost } from '../src/lib/volley-online/queue';
import { ratingOf } from './ratings';
import { openRoom, type VolleyEnv } from './volley';

/**
 * The quick-match queue (docs/volei-online.md, "Partida rápida"): one Durable
 * Object for everyone, addressed as `idFromName('global')`.
 *
 * A thin adapter around MatchQueue (pure, unit-tested in Node). Sockets use
 * the Hibernation API: someone waiting alone in line costs no memory time,
 * and each socket's attachment says whether it's in line, so a woken object
 * rebuilds the line. Pairing opens a room in the VOLLEY_ROOMS namespace.
 */

interface Attachment {
  id: string;
  entry: QueueEntry | null;
}

export class VolleyQueue implements DurableObject {
  private readonly queue: MatchQueue;
  private readonly conns = new Map<WebSocket, QueueConn>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly ctx: DurableObjectState,
    env: VolleyEnv,
  ) {
    const host: QueueHost = {
      now: () => Date.now(),
      openRoom: () => (env.VOLLEY_ROOMS ? openRoom(env.VOLLEY_ROOMS, true) : Promise.resolve(null)),
      rating: (pid) => (env.DB ? ratingOf(env.DB, pid) : Promise.resolve(null)),
      setTimer: (name, ms) => {
        const running = this.timers.get(name);
        if (running !== undefined) clearTimeout(running);
        this.timers.delete(name);
        if (ms === null) return;
        this.timers.set(
          name,
          setTimeout(() => {
            this.timers.delete(name);
            this.queue.timer(name);
          }, ms),
        );
      },
    };
    this.queue = new MatchQueue(host);
    // Woken from hibernation: whoever was in line is still in line.
    for (const ws of ctx.getWebSockets()) {
      const entry = (ws.deserializeAttachment() as Attachment | null)?.entry;
      if (entry) this.queue.restore(this.connFor(ws), entry);
      else ws.close(4000, 'expired'); // connected but never said join before the object slept
    }
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response(null, { status: 426 });
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ id: crypto.randomUUID(), entry: null } satisfies Attachment);
    this.queue.connect(this.connFor(server));
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    await this.queue.message(this.connFor(ws), message);
  }

  webSocketClose(ws: WebSocket) {
    this.gone(ws);
  }

  webSocketError(ws: WebSocket) {
    this.gone(ws);
  }

  private gone(ws: WebSocket) {
    const conn = this.connFor(ws);
    this.conns.delete(ws);
    this.queue.closed(conn);
  }

  private connFor(ws: WebSocket): QueueConn {
    const known = this.conns.get(ws);
    if (known) return known;
    const attachment = (ws.deserializeAttachment() as Attachment | null) ?? { id: crypto.randomUUID(), entry: null };
    const conn: QueueConn = {
      id: attachment.id,
      send: (msg) => {
        try {
          ws.send(JSON.stringify(msg));
        } catch {
          // Already closing: the close event tells the queue.
        }
      },
      close: (code, reason) => {
        try {
          ws.close(code, reason);
        } catch {
          // Already closed.
        }
      },
      bind: (entry) => {
        attachment.entry = entry;
        try {
          ws.serializeAttachment(attachment);
        } catch {
          // Closed meanwhile.
        }
      },
    };
    this.conns.set(ws, conn);
    return conn;
  }
}
