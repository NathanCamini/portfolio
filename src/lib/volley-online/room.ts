import { TIMING } from '../../components/volleyball/engine/constants';
import type { Side } from '../../components/volleyball/engine/types';
import { checkNickname } from '../ranking/nickname';
import { ELO, type RatingChange } from './elo';
import { OnlineMatch } from './match';
import {
  NET,
  encodeServerMessage,
  parseClientMessage,
  PROTOCOL_VERSION,
  type ClientMessage,
  type ErrorCode,
  type RoomPhase,
  type RoomView,
  type ServerMessage,
} from './protocol';

/**
 * One online room: two seats, a lobby and at most one match at a time
 * (docs/volei-online.md, "Ciclo de vida da sala").
 *
 * Pure state machine. Everything it needs from the outside world — sockets,
 * the clock, timers, randomness, storage — comes through `RoomHost` and
 * `Conn`, so it runs unchanged inside the Durable Object (worker/volley-room.ts)
 * and in plain Node tests with a fake clock.
 *
 *   waiting ──both ready──▶ countdown ──3 s──▶ playing ──7 points──▶ over
 *      ▲                        │                 │  ▲                  │
 *      └──── un-ready / drop ───┘        drop ────▼  │ back + 3 s       │
 *                                             paused ──15 s──▶ over (W.O.)
 *   over ──both ready──▶ countdown (rematch)
 */

const STEP_MS = TIMING.STEP * 1000;

/** A connected socket, as the room sees it. */
export interface Conn {
  readonly id: string;
  /** An already encoded message (encodeServerMessage): a broadcast is serialized once, not once per socket. */
  send(data: string | ArrayBuffer): void;
  close(code: number, reason: string): void;
  /** Remember which seat this socket holds, so the room can be rebuilt after the object hibernates. */
  bind(side: Side | null): void;
  /** The client's IP when known: two seats from one address don't play for rating. */
  readonly ip?: string;
}

/** A finished rated match, for the host to save (worker/ratings.ts). */
export interface RatedResult {
  /** Each side's player id (the browser's secret; the host stores only a hash of it). */
  pids: [string, string];
  names: [string, string];
  winner: Side;
}

export type TimerName = `hello:${string}` | 'countdown' | `grace:${Side}`;

export interface RoomHost {
  now(): number;
  /** 32 hex characters, unguessable (the seat's reconnection token). */
  randomToken(): string;
  /** [0, 1): who serves first. */
  random(): number;
  /** Single-shot named timers: setting one again replaces it, `null` cancels it. The host calls `room.timer(name)`. */
  setTimer(name: TimerName, ms: number | null): void;
  /**
   * While running, the host calls `room.loop()` again after the number of ms
   * it returns: the moment the next snapshot tick is due, so a snapshot
   * leaves as soon as its tick is simulated.
   */
  setLoop(running: boolean): void;
  /** The lobby's durable part changed (seats, wins); the match itself isn't persisted. */
  persist(state: PersistedRoom): void;
  /** Rated rooms: a player's current rating (null = never rated: they start at ELO.START). */
  rating(pid: string): Promise<number | null>;
  /** Rated rooms: saves the result and returns both players' change (null if it couldn't be saved). */
  record(result: RatedResult): Promise<[RatingChange, RatingChange] | null>;
}

export interface PersistedSeat {
  name: string;
  token: string;
  ready: boolean;
  /** The browser's player id (rated rooms), its IP and rating, as of the hello. */
  pid?: string;
  ip?: string;
  rating?: number | null;
}

export interface PersistedRoom {
  code: string;
  createdAt: number;
  /** Opened by the quick-match queue: results count for the online ranking. */
  rated?: boolean;
  phase: RoomPhase;
  seats: [PersistedSeat | null, PersistedSeat | null];
  wins: [number, number];
  result: RoomView['result'];
}

interface Seat extends PersistedSeat {
  conn: Conn | null;
  ping: number | null;
}

export function newRoom(code: string, now: number, rated = false): PersistedRoom {
  return { code, createdAt: now, rated, phase: 'waiting', seats: [null, null], wins: [0, 0], result: null };
}

const other = (side: Side): Side => (side === 0 ? 1 : 0);

export class RoomCore {
  readonly code: string;
  readonly createdAt: number;
  readonly rated: boolean;
  private phase: RoomPhase;
  private seats: [Seat | null, Seat | null];
  private wins: [number, number];
  private result: RoomView['result'];
  private match: OnlineMatch | null = null;
  private deadline: number | null = null;
  /** Sockets that haven't said hello yet. */
  private readonly pending = new Map<string, Conn>();
  private readonly buckets = new Map<string, { tokens: number; at: number }>();
  private lastLoopAt = 0;
  private acc = 0;

  constructor(
    private readonly host: RoomHost,
    saved: PersistedRoom,
  ) {
    this.code = saved.code;
    this.createdAt = saved.createdAt;
    this.rated = saved.rated ?? false;
    this.wins = [saved.wins[0], saved.wins[1]];
    this.result = saved.result;
    this.seats = [0, 1].map((i) => (saved.seats[i] ? { ...saved.seats[i]!, conn: null, ping: null } : null)) as [
      Seat | null,
      Seat | null,
    ];
    // A match lives only in memory: if the object was evicted mid-match, it's gone. Back to the lobby.
    const inMatch = saved.phase === 'playing' || saved.phase === 'paused' || saved.phase === 'countdown';
    this.phase = inMatch ? 'waiting' : saved.phase;
    if (inMatch) this.seats.forEach((s) => s && (s.ready = false));
  }

  // ------------------------------------------------------------ host events

  /** A socket was accepted: it has a few seconds to say hello. */
  connect(conn: Conn) {
    this.pending.set(conn.id, conn);
    this.host.setTimer(`hello:${conn.id}`, NET.HELLO_TIMEOUT_MS);
  }

  /** After hibernation: a socket that already held `side` before the object went to sleep. */
  restore(conn: Conn, side: Side) {
    const seat = this.seats[side];
    if (seat) seat.conn = conn;
    else conn.close(4000, 'expired');
  }

  /**
   * After hibernation, once every surviving socket was restored: timers don't
   * survive sleep, so seats nobody reclaimed get a fresh grace period.
   */
  restored() {
    ([0, 1] as const).forEach((side) => {
      if (this.seats[side] && !this.seats[side]!.conn) this.host.setTimer(`grace:${side}`, NET.RECONNECT_GRACE_MS);
    });
  }

  message(conn: Conn, raw: string | ArrayBuffer) {
    if (!this.spend(conn)) return this.fail(conn, 'rate_limited');
    const m = parseClientMessage(raw);
    if (!m) return this.fail(conn, 'bad_message');
    this.dispatch(conn, m);
  }

  /** The socket closed (by the player, the network, or us). Idempotent. */
  closed(conn: Conn) {
    this.buckets.delete(conn.id);
    if (this.pending.delete(conn.id)) this.host.setTimer(`hello:${conn.id}`, null);
    const side = this.sideOf(conn);
    if (side === null) return;
    this.seats[side]!.conn = null;
    this.dropped(side);
  }

  timer(name: TimerName) {
    if (name.startsWith('hello:')) {
      const conn = this.pending.get(name.slice(6));
      if (conn) this.fail(conn, 'timeout');
    } else if (name === 'countdown') {
      if (this.phase === 'countdown') this.go();
    } else {
      this.graceOver(Number(name.slice(6)) as Side);
    }
  }

  /**
   * The fixed-step match loop: catches up with real time, 120 steps per
   * second, and returns how many ms until the next snapshot tick is due (the
   * host sleeps exactly that long). A point or the final whistle goes out the
   * moment it happens, not on the next snapshot tick.
   */
  loop(): number {
    const match = this.match;
    if (this.phase !== 'playing' || !match) return STEP_MS * NET.SNAPSHOT_EVERY;
    const now = this.host.now();
    this.acc += Math.min(now - this.lastLoopAt, 250);
    this.lastLoopAt = now;
    while (this.acc >= STEP_MS && !match.over) {
      const phase = match.g.phase;
      match.step();
      this.acc -= STEP_MS;
      if (match.tick % NET.SNAPSHOT_EVERY === 0) this.broadcast({ t: 'state', s: match.snapshot() });
      // Off the rhythm: sync() so the server keeps the same rounded state it sends (quantization).
      else if (match.g.phase !== phase) this.broadcast({ t: 'state', s: match.sync() });
    }
    if (match.over) {
      this.finish(match.winner, false);
      return STEP_MS * NET.SNAPSHOT_EVERY;
    }
    const ticksToSnapshot = NET.SNAPSHOT_EVERY - (match.tick % NET.SNAPSHOT_EVERY);
    return Math.max(1, ticksToSnapshot * STEP_MS - this.acc);
  }

  /** Nobody is connected (the host may delete the room after its TTL). */
  get empty() {
    return this.pending.size === 0 && this.seats.every((s) => !s?.conn);
  }

  view(): RoomView {
    const now = this.host.now();
    return {
      code: this.code,
      phase: this.phase,
      seats: this.seats.map((s) =>
        s ? { name: s.name, connected: !!s.conn, ready: s.ready, ping: s.ping, rating: s.rating ?? null } : null,
      ) as RoomView['seats'],
      remainingMs: this.deadline === null ? null : Math.max(0, this.deadline - now),
      rated: this.rated,
      live: this.match !== null,
      wins: [this.wins[0], this.wins[1]],
      result: this.result,
    };
  }

  // ------------------------------------------------------------ messages

  private dispatch(conn: Conn, m: ClientMessage) {
    if (m.t === 'ping') return this.ping(conn, m.c, m.rtt);
    if (m.t === 'hello') return this.hello(conn, m.v, m.name, m.token, m.pid);
    const side = this.sideOf(conn);
    if (side === null) return this.fail(conn, 'bad_message'); // must say hello first
    if (m.t === 'ready') this.ready(side, m.ready);
    else if (m.t === 'input') this.input(side, m.tick, m.bits);
    else this.leave(side, conn);
  }

  private hello(conn: Conn, version: number, rawName: string, token?: string, pid?: string) {
    if (this.sideOf(conn) !== null) return; // already seated
    if (version !== PROTOCOL_VERSION) return this.fail(conn, 'bad_version');
    const nick = checkNickname(rawName);
    if (!nick.ok) return this.fail(conn, 'invalid_name');

    let side: Side | null = null;
    const back = token ? this.seats.findIndex((s) => s?.token === token) : -1;
    if (back !== -1) {
      side = back as Side;
      const seat = this.seats[side]!;
      if (seat.conn && seat.conn !== conn) {
        // Same player, new tab (or a zombie socket): the newest wins.
        this.to(seat.conn, { t: 'error', code: 'replaced' });
        seat.conn.bind(null);
        seat.conn.close(4000, 'replaced');
      }
      seat.conn = conn;
      seat.name = nick.name;
    } else {
      side = !this.seats[0] ? 0 : !this.seats[1] ? 1 : null;
      if (side === null) return this.fail(conn, 'room_full');
      this.seats[side] = {
        name: nick.name,
        token: this.host.randomToken(),
        ready: false,
        conn,
        ping: null,
        pid,
        ip: conn.ip,
        rating: null,
      };
      if (this.rated && pid) this.lookUpRating(side, pid);
    }

    this.pending.delete(conn.id);
    this.host.setTimer(`hello:${conn.id}`, null);
    this.host.setTimer(`grace:${side}`, null);
    conn.bind(side);
    this.to(conn, { t: 'welcome', side, token: this.seats[side]!.token, room: this.view() });
    if (this.match) this.to(conn, { t: 'state', s: this.match.snapshot() });

    // Both back while paused: resume after a countdown.
    if (this.phase === 'paused' && this.seats.every((s) => s?.conn)) this.countdown();
    this.changed();
  }

  /** Schedules the key change and relays it to the opponent right away (they rewind and replay with it). */
  private input(side: Side, tick: number, bits: number) {
    const applied = this.match?.input(side, tick, bits);
    if (!applied || applied.result === 'ahead') return;
    const rival = this.seats[other(side)]?.conn;
    if (rival) this.to(rival, { t: 'opp', tick: applied.tick, bits });
  }

  private ready(side: Side, ready: boolean) {
    const seat = this.seats[side]!;
    if (this.phase === 'countdown' && !this.match && !ready) {
      seat.ready = false;
      this.phase = 'waiting';
      this.deadline = null;
      this.host.setTimer('countdown', null);
      return this.changed();
    }
    if (this.phase !== 'waiting' && this.phase !== 'over') return;
    seat.ready = ready;
    if (this.seats.every((s) => s?.conn && s.ready)) this.countdown();
    this.changed();
  }

  private ping(conn: Conn, c: number, rtt?: number) {
    this.to(conn, { t: 'pong', c });
    const side = this.sideOf(conn);
    if (side === null || rtt === undefined) return;
    const seat = this.seats[side]!;
    const before = seat.ping;
    seat.ping = rtt;
    // Only worth a room update when it changed noticeably.
    if (before === null || Math.abs(before - rtt) >= 15) this.broadcastRoom();
  }

  private leave(side: Side, conn: Conn) {
    conn.bind(null);
    this.host.setTimer(`grace:${side}`, null);
    if (this.match) this.finish(other(side), true); // before the seat empties: the result keeps their name
    this.seats[side] = null;
    if (!this.match && this.phase === 'countdown') {
      this.phase = 'waiting';
      this.deadline = null;
      this.host.setTimer('countdown', null);
    }
    if (!this.seats[0] && !this.seats[1]) this.phase = 'waiting';
    conn.close(1000, 'left');
    this.changed();
  }

  // ------------------------------------------------------------ lifecycle

  private countdown() {
    this.phase = 'countdown';
    this.deadline = this.host.now() + NET.COUNTDOWN_MS;
    this.host.setTimer('countdown', NET.COUNTDOWN_MS);
  }

  /** Countdown over: a new match (or the paused one) starts. */
  private go() {
    if (!this.match) {
      // First match: a coin toss. Rematches: whoever lost serves.
      const first: Side = this.result ? other(this.result.winner) : this.host.random() < 0.5 ? 0 : 1;
      this.match = new OnlineMatch(first);
      this.seats.forEach((s) => s && (s.ready = false));
    }
    this.phase = 'playing';
    this.deadline = null;
    this.lastLoopAt = this.host.now();
    this.acc = 0; // no catch-up burst for the time spent counting down or paused
    this.host.setLoop(true);
    this.changed();
    this.broadcast({ t: 'state', s: this.match.snapshot() });
  }

  private dropped(side: Side) {
    if (this.phase === 'playing' || (this.phase === 'countdown' && this.match)) {
      this.phase = 'paused';
      this.host.setLoop(false);
      this.host.setTimer('countdown', null);
      this.deadline = this.host.now() + NET.RECONNECT_GRACE_MS;
      // Freeze everyone on the exact same state (the last step may not have been a broadcast one).
      this.broadcast({ t: 'state', s: this.match!.sync() });
    } else if (this.phase === 'countdown') {
      this.phase = 'waiting';
      this.deadline = null;
      this.host.setTimer('countdown', null);
      this.seats[side]!.ready = false;
    }
    // Paused or in the lobby: the seat is held for a while, so a refresh (or a flaky network) doesn't lose it.
    this.host.setTimer(`grace:${side}`, NET.RECONNECT_GRACE_MS);
    this.changed();
  }

  private graceOver(side: Side) {
    const seat = this.seats[side];
    if (!seat || seat.conn) return;
    if (this.match) this.finish(other(side), true);
    this.seats[side] = null;
    if (!this.seats[0] && !this.seats[1]) this.phase = 'waiting';
    this.changed();
  }

  /** Shows the player's rating in the lobby as soon as storage answers. */
  private lookUpRating(side: Side, pid: string) {
    void this.host
      .rating(pid)
      .catch(() => null)
      .then((rating) => {
        const seat = this.seats[side];
        if (seat?.pid !== pid) return; // left meanwhile
        seat.rating = rating ?? ELO.START;
        this.changed();
      });
  }

  /**
   * A rated result needs a rated room, two identified players who aren't the
   * same browser, and (when known) two different addresses: otherwise one
   * person with two tabs could farm points off themselves.
   */
  private ratable(): RatedResult['pids'] | null {
    const [a, b] = this.seats;
    if (!this.rated || !a?.pid || !b?.pid || a.pid === b.pid) return null;
    if (a.ip && b.ip && a.ip === b.ip) return null;
    return [a.pid, b.pid];
  }

  private finish(winner: Side, forfeit: boolean) {
    const score = this.match!.g.score;
    this.wins[winner]++;
    const names = this.seats.map((s) => s?.name ?? '') as [string, string];
    const pids = this.ratable();
    const result: NonNullable<RoomView['result']> = {
      winner,
      score: [score[0], score[1]],
      forfeit,
      names,
      counted: pids !== null,
      ratings: null,
    };
    this.result = result;
    if (pids) {
      void this.host
        .record({ pids, names, winner })
        .catch(() => null)
        .then((ratings) => {
          if (!ratings || this.result !== result) return;
          result.ratings = ratings;
          this.seats.forEach((s, i) => s?.pid === pids[i] && (s.rating = ratings[i].after));
          this.changed();
        });
    }
    this.match = null;
    this.host.setLoop(false);
    this.host.setTimer('countdown', null);
    this.phase = 'over';
    this.deadline = null;
    this.seats.forEach((s) => s && (s.ready = false));
    this.changed();
  }

  // ------------------------------------------------------------ plumbing

  private sideOf(conn: Conn): Side | null {
    if (this.seats[0]?.conn === conn) return 0;
    if (this.seats[1]?.conn === conn) return 1;
    return null;
  }

  /** Token bucket per socket: `false` once it sends faster than the protocol ever needs. */
  private spend(conn: Conn) {
    const now = this.host.now();
    const b = this.buckets.get(conn.id) ?? { tokens: NET.RATE_BURST, at: now };
    b.tokens = Math.min(NET.RATE_BURST, b.tokens + ((now - b.at) * NET.RATE_PER_SECOND) / 1000);
    b.at = now;
    this.buckets.set(conn.id, b);
    if (b.tokens < 1) return false;
    b.tokens--;
    return true;
  }

  private fail(conn: Conn, code: ErrorCode) {
    this.to(conn, { t: 'error', code });
    conn.close(4000, code);
    this.closed(conn);
  }

  private changed() {
    this.host.persist({
      code: this.code,
      createdAt: this.createdAt,
      phase: this.phase,
      rated: this.rated,
      seats: this.seats.map((s) =>
        s ? { name: s.name, token: s.token, ready: s.ready, pid: s.pid, ip: s.ip, rating: s.rating } : null,
      ) as PersistedRoom['seats'],
      wins: [this.wins[0], this.wins[1]],
      result: this.result,
    });
    this.broadcastRoom();
  }

  private broadcastRoom() {
    this.broadcast({ t: 'room', room: this.view() });
  }

  private to(conn: Conn, msg: ServerMessage) {
    conn.send(encodeServerMessage(msg));
  }

  private broadcast(msg: ServerMessage) {
    const data = encodeServerMessage(msg);
    for (const s of this.seats) s?.conn?.send(data);
  }
}
