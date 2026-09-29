import { checkNickname } from '../ranking/nickname';
import { ELO } from './elo';
import { isHex32, NET, PROTOCOL_VERSION, type ErrorCode } from './protocol';

/**
 * Quick match (docs/volei-online.md, "Partida rápida"): a single queue where
 * strangers wait for an opponent. When two players are close enough in
 * rating, the queue opens a new (rated) room and tells both its code; from
 * there it's a normal room (room.ts). "Close enough" widens the longer they
 * wait, so nobody waits forever for a perfect match.
 *
 * Like RoomCore, a pure state machine: sockets, timers and "open a room"
 * come in through `QueueConn` / `QueueHost`, so it runs in the Durable
 * Object (worker/volley-queue.ts) and in plain Node tests.
 *
 * Who is waiting lives in each socket's attachment (`bind`), not in memory
 * only: a queue that hibernates rebuilds the line from its sockets.
 */

export type QueueClientMessage = { t: 'join'; v: number; name: string; pid?: string };

export type QueueServerMessage = { t: 'queued' } | { t: 'matched'; code: string } | { t: 'error'; code: ErrorCode };

/** A waiting player, as stored on their socket. */
export interface QueueEntry {
  name: string;
  /** host.now() when they joined: the oldest in line picks first. */
  since: number;
  /** Their online rating when they joined (ELO.START for newcomers and players without an id). */
  rating: number;
}

/** How far apart two ratings may be for a match, given how long the one who waited longer has waited. */
export const MATCH_WINDOW = {
  /** Right away: ±150 (roughly a 70/30 favourite at most). */
  BASE: 150,
  /** Then 10 more per second of waiting: ±450 after 30 s, anyone after a couple of minutes. */
  PER_SECOND: 10,
  /** While people wait without a match, the queue looks again this often. */
  RETRY_MS: 2_000,
} as const;

export const matchWindow = (waitedMs: number) => MATCH_WINDOW.BASE + (MATCH_WINDOW.PER_SECOND * waitedMs) / 1000;

export interface QueueConn {
  readonly id: string;
  send(msg: QueueServerMessage): void;
  close(code: number, reason: string): void;
  /** Remember (or forget) that this socket is in line. */
  bind(entry: QueueEntry | null): void;
}

export interface QueueHost {
  now(): number;
  /** A fresh rated room's code, or null if none could be opened. */
  openRoom(): Promise<string | null>;
  /** A player's rating (null = never rated). */
  rating(pid: string): Promise<number | null>;
  setTimer(name: QueueTimer, ms: number | null): void;
}

export type QueueTimer = `hello:${string}` | 'widen';

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
    if (o.pid !== undefined && !isHex32(o.pid)) return null;
    return { t: 'join', v: o.v, name: o.name, ...(o.pid ? { pid: o.pid as string } : {}) };
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
  /** In line, oldest first (restore keeps the order; joins append). */
  private waiting: { conn: QueueConn; entry: QueueEntry }[] = [];
  private readonly counts = new Map<string, number>();
  /** Said `join`; their rating is being looked up. */
  private readonly joining = new Set<string>();

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
    if (!this.pending.has(conn.id)) return; // already joining or in line: a repeated join changes nothing
    if (m.v !== PROTOCOL_VERSION) return this.fail(conn, 'bad_version');
    const nick = checkNickname(m.name);
    if (!nick.ok) return this.fail(conn, 'invalid_name');

    this.pending.delete(conn.id);
    this.host.setTimer(`hello:${conn.id}`, null);
    this.joining.add(conn.id);
    const rating = m.pid ? await this.host.rating(m.pid).catch(() => null) : null;
    if (!this.joining.delete(conn.id)) return; // gave up while their rating was looked up
    const entry: QueueEntry = { name: nick.name, since: this.host.now(), rating: rating ?? ELO.START };
    conn.bind(entry);
    this.waiting.push({ conn, entry });
    conn.send({ t: 'queued' });
    await this.pair();
  }

  /** The socket closed (they gave up, or the network did). Idempotent. */
  closed(conn: QueueConn) {
    this.counts.delete(conn.id);
    this.joining.delete(conn.id);
    if (this.pending.delete(conn.id)) this.host.setTimer(`hello:${conn.id}`, null);
    this.waiting = this.waiting.filter((w) => w.conn.id !== conn.id);
  }

  timer(name: QueueTimer) {
    if (name === 'widen') return void this.pair();
    const conn = this.pending.get(name.slice(6));
    if (conn) this.fail(conn, 'timeout');
  }

  /**
   * The two players to match next, or null: the oldest in line with whoever
   * is closest to their rating, if the gap fits the window of the one who
   * has waited longer (the oldest). Otherwise the next oldest gets a turn.
   */
  private nextPair(): [number, number] | null {
    const now = this.host.now();
    for (let i = 0; i < this.waiting.length; i++) {
      const me = this.waiting[i].entry;
      let best = -1;
      for (let j = 0; j < this.waiting.length; j++) {
        if (j === i) continue;
        const gap = Math.abs(this.waiting[j].entry.rating - me.rating);
        const waited = now - Math.min(me.since, this.waiting[j].entry.since);
        if (gap > matchWindow(waited)) continue;
        if (best === -1 || gap < Math.abs(this.waiting[best].entry.rating - me.rating)) best = j;
      }
      if (best !== -1) return [i, best];
    }
    return null;
  }

  /**
   * Takes each pair out of the line *before* waiting for its room, so a join
   * arriving meanwhile can't pair with them again. People left waiting are
   * looked at again every couple of seconds, as their window widens.
   */
  private async pair() {
    for (let next = this.nextPair(); next; next = this.nextPair()) {
      const pair = [this.waiting[next[0]], this.waiting[next[1]]];
      this.waiting = this.waiting.filter((w) => !pair.includes(w));
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
    this.host.setTimer('widen', this.waiting.length >= 2 ? MATCH_WINDOW.RETRY_MS : null);
  }

  private fail(conn: QueueConn, code: ErrorCode) {
    conn.send({ t: 'error', code });
    conn.close(4000, code);
    this.closed(conn);
  }
}
