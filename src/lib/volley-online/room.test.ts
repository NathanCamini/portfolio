import { describe, expect, it } from 'vitest';
import { gameConfig } from '../../config/game';
import { NET, PROTOCOL_VERSION, type ErrorCode, type RoomView, type ServerMessage, type Snapshot } from './protocol';
import { newRoom, RoomCore, type Conn, type PersistedRoom, type RoomHost, type TimerName } from './room';
import { seeded, sideBot } from './testing';

/** A fake runtime: manual clock, named timers, a loop the test drives, and storage. */
class FakeHost implements RoomHost {
  time = 1_000_000;
  timers = new Map<TimerName, number>();
  looping = false;
  saved: PersistedRoom | null = null;
  room!: RoomCore;
  private tokens = 0;
  now = () => this.time;
  randomToken = () => (++this.tokens).toString(16).padStart(32, '0');
  random = () => 0.25; // the left player serves first
  setTimer = (name: TimerName, ms: number | null) => {
    if (ms === null) this.timers.delete(name);
    else this.timers.set(name, this.time + ms);
  };
  setLoop = (running: boolean) => void (this.looping = running);
  persist = (state: PersistedRoom) => void (this.saved = structuredClone(state));

  /** Moves the clock, firing due timers and running the loop at ~60 Hz like the Durable Object. */
  advance(ms: number) {
    const end = this.time + ms;
    while (this.time < end) {
      this.time = Math.min(end, this.time + 16);
      for (const [name, at] of [...this.timers]) {
        if (at <= this.time) {
          this.timers.delete(name);
          this.room.timer(name);
        }
      }
      if (this.looping) this.room.loop();
    }
  }
}

class FakeConn implements Conn {
  static next = 0;
  readonly id = `c${FakeConn.next++}`;
  inbox: ServerMessage[] = [];
  closed: { code: number; reason: string } | null = null;
  side: 0 | 1 | null = null;
  send = (msg: ServerMessage) => void this.inbox.push(msg);
  close = (code: number, reason: string) => void (this.closed ??= { code, reason });
  bind = (side: 0 | 1 | null) => void (this.side = side);

  last<T extends ServerMessage['t']>(t: T) {
    return this.inbox.filter((m): m is Extract<ServerMessage, { t: T }> => m.t === t).at(-1);
  }
  get room(): RoomView {
    return this.last('room')!.room;
  }
  get error(): ErrorCode | undefined {
    return this.last('error')?.code;
  }
}

function setup(saved: PersistedRoom = newRoom('ABC23', 1_000_000)) {
  const host = new FakeHost();
  const room = new RoomCore(host, saved);
  host.room = room;
  const say = (conn: Conn, msg: object) => room.message(conn, JSON.stringify(msg));
  const join = (name: string, token?: string) => {
    const conn = new FakeConn();
    room.connect(conn);
    say(conn, { t: 'hello', v: PROTOCOL_VERSION, name, ...(token ? { token } : {}) });
    return conn;
  };
  /** Both players ready and the countdown elapsed: a match is running. */
  const start = (a: FakeConn, b: FakeConn) => {
    say(a, { t: 'ready', ready: true });
    say(b, { t: 'ready', ready: true });
    host.advance(NET.COUNTDOWN_MS + 20);
  };
  return { host, room, say, join, start };
}

describe('RoomCore lobby', () => {
  it('seats two players, gives each a side and a reconnection token', () => {
    const { join } = setup();
    const a = join('Nathan');
    const b = join('Maria');
    expect(a.last('welcome')).toMatchObject({ side: 0 });
    expect(b.last('welcome')).toMatchObject({ side: 1 });
    expect(a.last('welcome')!.token).toMatch(/^[0-9a-f]{32}$/);
    expect(a.room.seats.map((s) => s?.name)).toEqual(['Nathan', 'Maria']);
    expect(a.room.phase).toBe('waiting');
  });

  it('turns away a third player, a bad name, an old client and a silent socket', () => {
    const { join, room, host } = setup();
    join('Nathan');
    join('Maria');
    expect(join('Carlos').error).toBe('room_full');

    const { join: join2, room: room2, host: host2 } = setup();
    const rude = join2('Porra');
    expect(rude.error).toBe('invalid_name');
    expect(rude.closed).not.toBeNull();
    const old = new FakeConn();
    room2.connect(old);
    room2.message(old, JSON.stringify({ t: 'hello', v: PROTOCOL_VERSION + 1, name: 'Nathan' }));
    expect(old.error).toBe('bad_version');

    const silent = new FakeConn();
    room.connect(silent);
    host.advance(NET.HELLO_TIMEOUT_MS + 20);
    expect(silent.error).toBe('timeout');
    void host2;
  });

  it('closes a socket that sends garbage or talks before saying hello', () => {
    const { room, say } = setup();
    const a = new FakeConn();
    room.connect(a);
    say(a, { t: 'ready', ready: true });
    expect(a.error).toBe('bad_message');
    const b = new FakeConn();
    room.connect(b);
    room.message(b, '{"t":"input","tick":1,"bits":99}');
    expect(b.error).toBe('bad_message');
  });

  it('counts down when both are ready, and cancels if one backs out', () => {
    const { join, say, host } = setup();
    const a = join('Nathan');
    const b = join('Maria');
    say(a, { t: 'ready', ready: true });
    expect(a.room.phase).toBe('waiting');
    say(b, { t: 'ready', ready: true });
    expect(a.room.phase).toBe('countdown');
    expect(a.room.remainingMs).toBe(NET.COUNTDOWN_MS);
    expect(a.room.live).toBe(false); // a new match, not a resume
    say(a, { t: 'ready', ready: false });
    expect(b.room.phase).toBe('waiting');
    host.advance(NET.COUNTDOWN_MS + 50);
    expect(b.room.phase).toBe('waiting'); // the cancelled countdown didn't start anything
  });

  it('answers pings and shares each player’s round trip', () => {
    const { join, say } = setup();
    const a = join('Nathan');
    const b = join('Maria');
    say(a, { t: 'ping', c: 123.5, rtt: 42 });
    expect(a.last('pong')).toEqual({ t: 'pong', c: 123.5 });
    expect(b.room.seats[0]?.ping).toBe(42);
  });

  it('cuts off a socket that floods the room', () => {
    const { join, say } = setup();
    const a = join('Nathan');
    for (let i = 0; i < NET.RATE_BURST + 5; i++) say(a, { t: 'ping', c: i });
    expect(a.error).toBe('rate_limited');
  });
});

describe('RoomCore match', () => {
  it('runs the match at 120 Hz and broadcasts 30 snapshots a second', () => {
    const { join, start, host } = setup();
    const a = join('Nathan');
    const b = join('Maria');
    start(a, b);
    expect(a.room.phase).toBe('playing');
    const states = () => a.inbox.filter((m) => m.t === 'state').length;
    const before = states();
    host.advance(1000);
    expect(states() - before).toBeGreaterThanOrEqual(29);
    expect(states() - before).toBeLessThanOrEqual(31);
    const s = a.last('state')!.s;
    expect(s.tick % NET.SNAPSHOT_EVERY).toBe(0);
    expect(b.last('state')!.s).toEqual(s); // both players get the same truth
  });

  it('plays a whole match between two bots, then offers a rematch where the loser serves', () => {
    const { join, start, host, say } = setup();
    const conns = [join('Nathan'), join('Maria')];
    start(conns[0], conns[1]);
    const bots = [sideBot(0, seeded(1)), sideBot(1, seeded(2))];
    const sent = [-1, -1];
    for (let i = 0; i < 120 * 60 * 10 && conns[0].room.phase === 'playing'; i++) {
      const s = conns[0].last('state')!.s;
      conns.forEach((c, side) => {
        const bits = bots[side](stateOf(s), 2);
        if (bits !== sent[side]) say(c, { t: 'input', tick: s.tick + 8, bits: (sent[side] = bits) });
      });
      host.advance(16);
    }
    const room = conns[0].room;
    expect(room.phase).toBe('over');
    expect(room.result).not.toBeNull();
    expect(Math.max(...room.result!.score)).toBe(gameConfig.onlineWinScore);
    expect(room.result!.forfeit).toBe(false);
    expect(room.wins[room.result!.winner]).toBe(1);

    start(conns[0], conns[1]);
    expect(conns[0].room.phase).toBe('playing');
    const loser = room.result!.winner === 0 ? 1 : 0;
    expect(conns[0].last('state')!.s.server).toBe(loser);
  });

  it('pauses when a player drops, and resumes after they come back with their token', () => {
    const { join, start, host, room } = setup();
    const a = join('Nathan');
    const b = join('Maria');
    start(a, b);
    host.advance(500);
    const tick = a.last('state')!.s.tick;
    const token = b.last('welcome')!.token;

    room.closed(b);
    expect(a.room.phase).toBe('paused');
    expect(a.room.seats[1]?.connected).toBe(false);
    expect(host.looping).toBe(false);
    const frozen = a.last('state')!.s; // sent at the moment of the pause
    expect(frozen.tick - tick).toBeLessThan(NET.SNAPSHOT_EVERY);
    host.advance(5000);
    expect(a.last('state')!.s.tick).toBe(frozen.tick); // the clock stood still while paused

    const b2 = join('Maria', token);
    expect(b2.last('welcome')).toMatchObject({ side: 1 });
    expect(b2.last('state')!.s).toEqual(frozen); // the rejoiner sees exactly where it stopped
    expect(a.room.phase).toBe('countdown');
    expect(a.room.live).toBe(true); // counting down to resume, not to a new match
    host.advance(NET.COUNTDOWN_MS + 20);
    expect(a.room.phase).toBe('playing');
    host.advance(100);
    const after = a.last('state')!.s.tick;
    expect(after).toBeGreaterThan(tick);
    expect(after - tick).toBeLessThan(30); // no catch-up burst for the paused time
  });

  it('gives the match to the player who stayed when the other doesn’t come back in time', () => {
    const { join, start, host, room } = setup();
    const a = join('Nathan');
    const b = join('Maria');
    start(a, b);
    room.closed(a);
    host.advance(NET.RECONNECT_GRACE_MS + 50);
    expect(b.room.phase).toBe('over');
    expect(b.room.result).toMatchObject({ winner: 1, forfeit: true, names: ['Nathan', 'Maria'] });
    expect(b.room.wins).toEqual([0, 1]);
    expect(b.room.seats[0]).toBeNull(); // the seat is free for someone else
  });

  it('counts leaving mid-match as a forfeit', () => {
    const { join, start, say } = setup();
    const a = join('Nathan');
    const b = join('Maria');
    start(a, b);
    say(b, { t: 'leave' });
    expect(b.closed).toMatchObject({ code: 1000 });
    // The result still names who left (their seat is already free).
    expect(a.room).toMatchObject({ phase: 'over', result: { winner: 0, forfeit: true, names: ['Nathan', 'Maria'] } });
    expect(a.room.seats[1]).toBeNull();
  });

  it('keeps the newest tab when the same player opens the room twice', () => {
    const { join } = setup();
    const a = join('Nathan');
    join('Maria');
    const again = join('Nathan', a.last('welcome')!.token);
    expect(a.error).toBe('replaced');
    expect(again.last('welcome')).toMatchObject({ side: 0 });
  });
});

describe('RoomCore persistence', () => {
  it('saves the lobby and rebuilds it after hibernation; a match lost in eviction returns to the lobby', () => {
    const { join, start, host } = setup();
    const a = join('Nathan');
    const b = join('Maria');
    start(a, b);
    expect(host.saved?.phase).toBe('playing');
    expect(host.saved?.seats.map((s) => s?.name)).toEqual(['Nathan', 'Maria']);

    // The object is evicted: a new instance from storage, with the surviving sockets reattached.
    const host2 = new FakeHost();
    const room2 = new RoomCore(host2, host.saved!);
    host2.room = room2;
    room2.restore(a, 0);
    room2.restore(b, 1);
    room2.restored();
    expect(room2.view().phase).toBe('waiting');
    expect(room2.view().seats.every((s) => s?.connected && !s.ready)).toBe(true);
    expect(host2.timers.size).toBe(0); // everyone is back: no grace timers
  });
});

/** Enough of a GameState for the bots, rebuilt from a snapshot. */
function stateOf(s: Snapshot) {
  const [px, py, pvx, pvy, cx, cy, cvx, cvy, bx, by, bvx, bvy] = s.bodies;
  return {
    player: { x: px, y: py, vx: pvx, vy: pvy, r: 44 },
    cpu: { x: cx, y: cy, vx: cvx, vy: cvy, r: 44 },
    ball: { x: bx, y: by, vx: bvx, vy: bvy, r: 13 },
    phase: s.phase,
    matchTime: s.matchTime,
    server: s.server,
    score: s.score,
    lastScorer: s.lastScorer,
    ballSide: 0,
  } as unknown as Parameters<ReturnType<typeof sideBot>>[0];
}
