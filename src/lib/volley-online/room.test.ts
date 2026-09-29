import { describe, expect, it } from 'vitest';
import { gameConfig } from '../../config/game';
import {
  KEY,
  NET,
  parseServerMessage,
  PROTOCOL_VERSION,
  type ErrorCode,
  type RoomView,
  type ServerMessage,
  type Snapshot,
} from './protocol';
import { ELO, rate, type Rated } from './elo';
import {
  newRoom,
  RoomCore,
  type Conn,
  type PersistedRoom,
  type RatedResult,
  type RoomHost,
  type TimerName,
} from './room';
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
  /** A fake ratings table: pid → { rating, games }. */
  ratings = new Map<string, { rating: number; games: number }>();
  recorded: RatedResult[] = [];
  rating = async (pid: string) => this.ratings.get(pid)?.rating ?? null;
  record = async (r: RatedResult) => {
    this.recorded.push(r);
    const players = r.pids.map((p) => this.ratings.get(p) ?? { rating: ELO.START, games: 0 }) as [Rated, Rated];
    const changes = rate(players, r.winner);
    r.pids.forEach((p, i) => this.ratings.set(p, { rating: changes[i].after, games: players[i].games + 1 }));
    return changes;
  };

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
  constructor(readonly ip?: string) {}
  inbox: ServerMessage[] = [];
  closed: { code: number; reason: string } | null = null;
  side: 0 | 1 | 'watch' | null = null;
  /** Decodes what the room encoded (binary snapshots included), like the browser does. */
  send = (data: string | ArrayBuffer) => void this.inbox.push(parseServerMessage(data)!);
  close = (code: number, reason: string) => void (this.closed ??= { code, reason });
  bind = (side: 0 | 1 | 'watch' | null) => void (this.side = side);

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
  const join = (name: string, token?: string, who: { pid?: string; ip?: string } = {}) => {
    const conn = new FakeConn(who.ip);
    room.connect(conn);
    say(conn, {
      t: 'hello',
      v: PROTOCOL_VERSION,
      name,
      ...(token ? { token } : {}),
      ...(who.pid ? { pid: who.pid } : {}),
    });
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
  it('runs the match at 120 Hz and broadcasts 60 snapshots a second', () => {
    const { join, start, host } = setup();
    const a = join('Nathan');
    const b = join('Maria');
    start(a, b);
    expect(a.room.phase).toBe('playing');
    const states = () => a.inbox.filter((m) => m.t === 'state');
    const before = states().length;
    host.advance(1000);
    const sent = states().slice(before);
    const rhythm = sent.filter((m) => m.s.tick % NET.SNAPSHOT_EVERY === 0);
    expect(rhythm.length).toBeGreaterThanOrEqual(59);
    expect(rhythm.length).toBeLessThanOrEqual(61);
    // Anything else is an event sent the moment it happened (the serve going into play).
    const events = sent.filter((m) => m.s.tick % NET.SNAPSHOT_EVERY !== 0);
    for (const m of events) expect(m.s.phase).not.toBe(sent[sent.indexOf(m) - 1]?.s.phase);
    expect(b.last('state')!.s).toEqual(a.last('state')!.s); // both players get the same truth
  });

  it('tells the loop how long to sleep: exactly until the next snapshot tick', () => {
    const { join, start, host, room } = setup();
    start(join('Nathan'), join('Maria'));
    host.advance(1000);
    const wait = room.loop();
    expect(wait).toBeGreaterThan(0);
    expect(wait).toBeLessThanOrEqual((NET.SNAPSHOT_EVERY * 1000) / 120 + 1e-9);
  });

  it('relays a key change to the opponent at once, with the tick it takes effect', () => {
    const { join, start, host, say } = setup();
    const a = join('Nathan');
    const b = join('Maria');
    start(a, b);
    host.advance(200);
    const tick = a.last('state')!.s.tick + 10;
    say(a, { t: 'input', tick, bits: KEY.RIGHT });
    expect(b.last('opp')).toEqual({ t: 'opp', tick, bits: KEY.RIGHT });
    expect(a.last('opp')).toBeUndefined(); // not echoed to the sender
    // Late: moved to the server's next tick, and the opponent is told that tick.
    say(a, { t: 'input', tick: 1, bits: 0 });
    expect(b.last('opp')!.tick).toBeGreaterThan(1);
  });

  it('sends a point to both players the moment it happens', () => {
    const { join, start, host, say } = setup();
    const a = join('Nathan');
    const b = join('Maria');
    start(a, b);
    // The server (left) walks away from its own serve: the ball drops, a point.
    host.advance(100);
    say(a, { t: 'input', tick: a.last('state')!.s.tick + 5, bits: KEY.LEFT });
    for (let i = 0; i < 600 && !a.inbox.some((m) => m.t === 'state' && m.s.phase === 'point'); i++) host.advance(16);
    const point = a.inbox.find((m) => m.t === 'state' && m.s.phase === 'point');
    expect(point).toBeDefined();
    expect(b.inbox.some((m) => m.t === 'state' && m.s.phase === 'point')).toBe(true);
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

describe('rated rooms (quick match)', () => {
  const PA = 'a'.repeat(32);
  const PB = 'b'.repeat(32);
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('shows each player’s rating, and saves the result of a match with the change for both', async () => {
    const { join, start, say, host } = setup(newRoom('ABC23', 1_000_000, true));
    host.ratings.set(PA, { rating: 1100, games: 20 });
    const a = join('Nathan', undefined, { pid: PA, ip: '1.1.1.1' });
    const b = join('Maria', undefined, { pid: PB, ip: '2.2.2.2' });
    await flush();
    expect(a.room.rated).toBe(true);
    expect(a.room.seats.map((s) => s?.rating)).toEqual([1100, ELO.START]); // a newcomer shows the starting rating
    start(a, b);
    say(b, { t: 'leave' }); // a forfeit counts like any loss
    await flush();
    expect(host.recorded).toEqual([{ pids: [PA, PB], names: ['Nathan', 'Maria'], winner: 0 }]);
    const { ratings } = a.room.result!;
    expect(ratings![0].after).toBeGreaterThan(1100);
    expect(ratings![1].after).toBeLessThan(ELO.START);
    expect(a.room.seats[0]?.rating).toBe(ratings![0].after);
  });

  it('never rates a friendly room, the same browser twice, the same address twice, or a player without an id', async () => {
    const cases: [PersistedRoom, { pid?: string; ip?: string }, { pid?: string; ip?: string }][] = [
      [newRoom('ABC23', 0, false), { pid: PA }, { pid: PB }],
      [newRoom('ABC23', 0, true), { pid: PA }, { pid: PA }],
      [newRoom('ABC23', 0, true), { pid: PA, ip: '1.1.1.1' }, { pid: PB, ip: '1.1.1.1' }],
      [newRoom('ABC23', 0, true), { pid: PA }, {}],
    ];
    for (const [saved, wa, wb] of cases) {
      const { join, start, say, host } = setup(saved);
      const a = join('Nathan', undefined, wa);
      const b = join('Maria', undefined, wb);
      start(a, b);
      say(b, { t: 'leave' });
      await flush();
      expect(host.recorded).toEqual([]);
      expect(a.room.result).toMatchObject({ counted: false, ratings: null });
    }
  });

  it('keeps the room rated and the players identified across hibernation', () => {
    const { join, host } = setup(newRoom('ABC23', 1_000_000, true));
    join('Nathan', undefined, { pid: PA, ip: '1.1.1.1' });
    const saved = host.saved!;
    expect(saved.rated).toBe(true);
    expect(saved.seats[0]).toMatchObject({ pid: PA, ip: '1.1.1.1' });
    expect(new RoomCore(new FakeHost(), saved).rated).toBe(true);
  });
});

describe('spectators and reactions (phase 4)', () => {
  const watch = (room: RoomCore, conn = new FakeConn()) => {
    room.connect(conn);
    room.message(conn, JSON.stringify({ t: 'hello', v: PROTOCOL_VERSION, name: '', watch: true }));
    return conn;
  };

  it('lets anyone watch a full room: the room, the snapshots, and a count the players see', () => {
    const { join, start, host, room } = setup();
    const a = join('Nathan');
    const b = join('Maria');
    const w = watch(room);
    expect(w.last('watching')!.room.seats.map((s) => s?.name)).toEqual(['Nathan', 'Maria']);
    expect(w.side).toBe('watch');
    expect(a.room.spectators).toBe(1);
    start(a, b);
    host.advance(500);
    expect(w.last('state')!.s).toEqual(a.last('state')!.s); // the same truth as the players
    expect(w.room.phase).toBe('playing');
  });

  it('keeps spectators out of the game: no ready, no input, no reactions; leaving is fine', () => {
    const { join, room } = setup();
    const a = join('Nathan');
    const w = watch(room);
    room.message(w, JSON.stringify({ t: 'ready', ready: true }));
    expect(w.error).toBe('bad_message');
    const w2 = watch(room);
    expect(a.room.spectators).toBe(1);
    room.message(w2, JSON.stringify({ t: 'leave' }));
    expect(w2.closed).toMatchObject({ code: 1000 });
    expect(a.room.spectators).toBe(0);
  });

  it('caps the audience', () => {
    const { room } = setup();
    for (let i = 0; i < NET.MAX_SPECTATORS; i++) watch(room);
    expect(watch(room).error).toBe('room_full');
  });

  it('sends a reaction to everyone, and drops the ones sent too fast', () => {
    const { join, say, host, room } = setup();
    const a = join('Nathan');
    const b = join('Maria');
    const w = watch(room);
    say(a, { t: 'emote', id: 4 });
    for (const c of [a, b, w]) expect(c.last('emote')).toEqual({ t: 'emote', side: 0, id: 4 });
    say(a, { t: 'emote', id: 1 }); // too soon
    expect(b.last('emote')!.id).toBe(4);
    host.advance(NET.EMOTE_COOLDOWN_MS);
    say(a, { t: 'emote', id: 1 });
    expect(b.last('emote')).toEqual({ t: 'emote', side: 0, id: 1 });
    say(b, { t: 'emote', id: 99 }); // not a reaction
    expect(b.error).toBe('bad_message');
  });

  it('brings spectators back after hibernation, and counts them as someone in the room', () => {
    const { join, room, host } = setup();
    join('Nathan');
    const w = watch(room);
    const again = new RoomCore(host, host.saved!);
    again.restoreWatcher(w);
    expect(again.empty).toBe(false);
    expect(again.view().spectators).toBe(1);
  });
});
