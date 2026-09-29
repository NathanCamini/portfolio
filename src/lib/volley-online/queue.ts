import { checkNickname } from '../ranking/nickname';
import { NET, PROTOCOL_VERSION, type ErrorCode } from './protocol';

/**
 * Quick match (docs/volei-online.md, "Partida rápida"): a single queue where
 * strangers wait for an opponent. Two in line → the queue opens a new room
 * and tells both its code; from there it's a normal room (room.ts).
 *
 * Like RoomCore, a pure state machine: sockets, timers and "open a room"
 * come in through `QueueConn` / `QueueHost`, so it runs in the Durable
 * Object (worker/volley-queue.ts) and in plain Node tests.
 *
 * Who is waiting lives in each socket's attachment (`bind`), not in memory
 * only: a queue that hibernates rebuilds the line from its sockets.
 */

export type QueueClientMessage = { t: 'join'; v: number; name: string };

export type QueueServerMessage = { t: 'queued' } | { t: 'matched'; code: string } | { t: 'error'; code: ErrorCode };

/** A waiting player, as stored on their socket. */
export interface QueueEntry {
  name: string;
  /** host.now() when they joined: the line is first come, first served. */
  since: number;
}

export interface QueueConn {
  readonly id: string;
  send(msg: QueueServerMessage): void;
  close(code: number, reason: string): void;
  /** Remember (or forget) that this socket is in line. */
  bind(entry: QueueEntry | null): void;
}

export interface QueueHost {
  now(): number;
  /** A fresh room's code, or null if none could be opened. */
  openRoom(): Promise<string | null>;
  setTimer(name: `hello:${string}`, ms: number | null): void;
}

/** A socket only ever needs to say `join` once; a few extra frames are tolerated, a flood is not. */
const MAX_MESSAGES = 4;

export function parseQueueMessage(raw: string | ArrayBuffer): QueueClientMessage | null {
  if (typeof raw !== 'string' || raw.length > NET.MAX_MESSAGE_BYTES) return null;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (typeof o !== 'object' || o === null || o.t !== 'join') return null;
    if (typeof o.v !== 'number' || !Number.isInteger(o.v) || typeof o.name !== 'string' || o.name.length > 64) {
      return null;
    }
    return { t: 'join', v: o.v, name: o.name };
  } catch {
    return null;
  }
}

/** The browser trusts its own server; this only guards against a garbled frame. */
export function parseQueueServerMessage(raw: unknown): QueueServerMessage | null {
  if (typeof raw !== 'string') return null;
  try {
    const m = JSON.parse(raw) as QueueServerMessage;
    return typeof m === 'object' && m !== null && typeof m.t === 'string' ? m : null;
  } catch {
    return null;
  }
}

export class MatchQueue {
  /** Connected, hasn't said `join` yet. */
  private readonly pending = new Map<string, QueueConn>();
  /** In line, oldest first. */
  private waiting: { conn: QueueConn; entry: QueueEntry }[] = [];
  private readonly counts = new Map<string, number>();

  constructor(private readonly host: QueueHost) {}

  connect(conn: QueueConn) {
    this.pending.set(conn.id, conn);
    this.host.setTimer(`hello:${conn.id}`, NET.HELLO_TIMEOUT_MS);
  }

  /** After hibernation: a socket that was in line before the object went to sleep. */
  restore(conn: QueueConn, entry: QueueEntry) {
    this.waiting.push({ conn, entry });
    this.waiting.sort((a, b) => a.entry.since - b.entry.since);
  }

  /** How many are in line (for the tests and the summary). */
  get size() {
    return this.waiting.length;
  }

  async message(conn: QueueConn, raw: string | ArrayBuffer) {
    const n = (this.counts.get(conn.id) ?? 0) + 1;
    this.counts.set(conn.id, n);
    if (n > MAX_MESSAGES) return this.fail(conn, 'rate_limited');
    const m = parseQueueMessage(raw);
    if (!m) return this.fail(conn, 'bad_message');
    if (!this.pending.has(conn.id)) return; // already in line: a repeated join changes nothing
    if (m.v !== PROTOCOL_VERSION) return this.fail(conn, 'bad_version');
    const nick = checkNickname(m.name);
    if (!nick.ok) return this.fail(conn, 'invalid_name');

    this.pending.delete(conn.id);
    this.host.setTimer(`hello:${conn.id}`, null);
    const entry = { name: nick.name, since: this.host.now() };
    conn.bind(entry);
    this.waiting.push({ conn, entry });
    conn.send({ t: 'queued' });
    await this.pair();
  }

  /** The socket closed (they gave up, or the network did). Idempotent. */
  closed(conn: QueueConn) {
    this.counts.delete(conn.id);
    if (this.pending.delete(conn.id)) this.host.setTimer(`hello:${conn.id}`, null);
    this.waiting = this.waiting.filter((w) => w.conn.id !== conn.id);
  }

  timer(name: `hello:${string}`) {
    const conn = this.pending.get(name.slice(6));
    if (conn) this.fail(conn, 'timeout');
  }

  /**
   * Takes the two oldest out of the line *before* waiting for the room, so a
   * join arriving meanwhile can't pair with them again.
   */
  private async pair() {
    while (this.waiting.length >= 2) {
      const pair = this.waiting.splice(0, 2);
      pair.forEach((w) => w.conn.bind(null));
      const code = await this.host.openRoom();
      for (const { conn } of pair) {
        this.counts.delete(conn.id);
        if (code) {
          conn.send({ t: 'matched', code });
          conn.close(1000, 'matched');
        } else this.fail(conn, 'unavailable');
      }
    }
  }

  private fail(conn: QueueConn, code: ErrorCode) {
    conn.send({ t: 'error', code });
    conn.close(4000, code);
    this.closed(conn);
  }
}
