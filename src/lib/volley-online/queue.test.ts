import { describe, expect, it } from 'vitest';
import { NET, PROTOCOL_VERSION } from './protocol';
import { ELO } from './elo';
import {
  MATCH_WINDOW,
  MatchQueue,
  parseQueueMessage,
  type QueueConn,
  type QueueEntry,
  type QueueServerMessage,
  type QueueTimer,
} from './queue';

class FakeConn implements QueueConn {
  sent: QueueServerMessage[] = [];
  closedWith: { code: number; reason: string } | null = null;
  entry: QueueEntry | null = null;
  constructor(readonly id: string) {}
  send = (m: QueueServerMessage) => void this.sent.push(m);
  close = (code: number, reason: string) => void (this.closedWith = { code, reason });
  bind = (e: QueueEntry | null) => void (this.entry = e);
  get last() {
    return this.sent[this.sent.length - 1];
  }
}

function setup(open: () => Promise<string | null> = async () => 'ROOM2') {
  let time = 1000;
  let ids = 0;
  const timers = new Map<string, number>();
  const opened: string[] = [];
  const ratings = new Map<string, number>();
  const queue = new MatchQueue({
    rating: async (pid) => ratings.get(pid) ?? null,
    now: () => time,
    openRoom: async () => {
      const code = await open();
      if (code) opened.push(code);
      return code;
    },
    setTimer: (name, ms) => (ms === null ? timers.delete(name) : timers.set(name, time + ms)),
  });
  const connect = () => {
    const c = new FakeConn(`c${++ids}`);
    queue.connect(c);
    return c;
  };
  /** Joins the line; with `rating`, as a player id the fake ratings table knows. */
  const join = async (name: string, rating?: number, c = connect()) => {
    time += 10;
    const pid = rating === undefined ? undefined : c.id.padStart(32, '0');
    if (pid) ratings.set(pid, rating!);
    await queue.message(c, JSON.stringify({ t: 'join', v: PROTOCOL_VERSION, name, ...(pid ? { pid } : {}) }));
    return c;
  };
  const advance = async (ms: number) => {
    time += ms;
    for (const [name, at] of [...timers]) {
      if (at > time) continue;
      timers.delete(name);
      queue.timer(name as QueueTimer);
    }
    await new Promise((r) => setTimeout(r, 0));
  };
  return { queue, connect, join, advance, opened, timers };
}

describe('MatchQueue', () => {
  it('pairs the first two in line into a new room and sends both there', async () => {
    const { queue, join, opened } = setup();
    const a = await join('Nathan');
    expect(a.last).toEqual({ t: 'queued' });
    expect(a.entry).toMatchObject({ name: 'Nathan' }); // kept on the socket, for hibernation
    const b = await join('Maria');
    expect(opened).toEqual(['ROOM2']);
    for (const c of [a, b]) {
      expect(c.last).toEqual({ t: 'matched', code: 'ROOM2' });
      expect(c.closedWith?.code).toBe(1000);
      expect(c.entry).toBeNull();
    }
    expect(queue.size).toBe(0);
  });

  it('is first come, first served, and a third waits for a fourth', async () => {
    const { queue, join, opened } = setup();
    const a = await join('Ana Paula');
    const b = await join('Bruno');
    const c = await join('Carla');
    expect(a.last).toMatchObject({ t: 'matched' });
    expect(b.last).toMatchObject({ t: 'matched' });
    expect(c.last).toEqual({ t: 'queued' });
    expect(queue.size).toBe(1);
    await join('Diego');
    expect(c.last).toMatchObject({ t: 'matched' });
    expect(opened).toHaveLength(2);
  });

  it('forgets whoever gives up before a match', async () => {
    const { queue, join, opened } = setup();
    const a = await join('Nathan');
    queue.closed(a);
    const b = await join('Maria');
    expect(b.last).toEqual({ t: 'queued' });
    expect(opened).toHaveLength(0);
  });

  it('never hands the same player to two rooms when joins arrive while a room is opening', async () => {
    let release!: (code: string) => void;
    const { join, connect, queue } = setup(() => new Promise((r) => (release = r)));
    const a = await join('Ana Paula');
    const b = connect();
    const opening = queue.message(b, JSON.stringify({ t: 'join', v: PROTOCOL_VERSION, name: 'Bruno' }));
    const c = await join('Carla'); // arrives while the first room is still being opened
    expect(c.last).toEqual({ t: 'queued' });
    release('ROOM2');
    await opening;
    expect(a.last).toEqual({ t: 'matched', code: 'ROOM2' });
    expect(b.last).toEqual({ t: 'matched', code: 'ROOM2' });
    expect(queue.size).toBe(1);
  });

  it('tells both when no room could be opened', async () => {
    const { join } = setup(async () => null);
    const a = await join('Nathan');
    const b = await join('Maria');
    for (const c of [a, b]) {
      expect(c.last).toEqual({ t: 'error', code: 'unavailable' });
      expect(c.closedWith?.code).toBe(4000);
    }
  });

  it('turns away bad names, old clients, garbage, floods and silent sockets', async () => {
    const { queue, join, connect, advance } = setup();
    expect((await join('admin')).last).toEqual({ t: 'error', code: 'invalid_name' });
    const old = connect();
    await queue.message(old, JSON.stringify({ t: 'join', v: PROTOCOL_VERSION + 1, name: 'Nathan' }));
    expect(old.last).toEqual({ t: 'error', code: 'bad_version' });
    const junk = connect();
    await queue.message(junk, '{"t":"hello"}');
    expect(junk.last).toEqual({ t: 'error', code: 'bad_message' });
    const loud = await join('Nathan');
    for (let i = 0; i < 4; i++)
      await queue.message(loud, JSON.stringify({ t: 'join', v: PROTOCOL_VERSION, name: 'x' }));
    expect(loud.last).toEqual({ t: 'error', code: 'rate_limited' });
    expect(queue.size).toBe(0);
    const silent = connect();
    await advance(NET.HELLO_TIMEOUT_MS + 1);
    expect(silent.last).toEqual({ t: 'error', code: 'timeout' });
  });

  it('rebuilds the line from its sockets after hibernation, oldest first', async () => {
    const { queue, join } = setup();
    const late = new FakeConn('late');
    const early = new FakeConn('early');
    queue.restore(late, { name: 'Tarde', since: 500, rating: ELO.START });
    queue.restore(early, { name: 'Cedo', since: 100, rating: ELO.START });
    expect(queue.size).toBe(2);
    // Restored sockets aren't paired on their own; the next join pairs the oldest two.
    const c = await join('Carla');
    expect(early.last).toMatchObject({ t: 'matched' });
    expect(late.last).toMatchObject({ t: 'matched' });
    expect(c.last).toEqual({ t: 'queued' });
  });

  it('parses only a well-formed join', () => {
    expect(parseQueueMessage('{"t":"join","v":1,"name":"Nathan","x":1}')).toEqual({ t: 'join', v: 1, name: 'Nathan' });
    expect(parseQueueMessage('{"t":"join","v":"1","name":"Nathan"}')).toBeNull();
    expect(parseQueueMessage(`{"t":"join","v":1,"name":"${'a'.repeat(65)}"}`)).toBeNull();
    expect(parseQueueMessage('[]')).toBeNull();
    expect(parseQueueMessage('nope')).toBeNull();
  });

  it('matches close ratings first, and widens the window for whoever waits', async () => {
    const { join, advance, queue } = setup();
    const pro = await join('Profissional', 1600);
    const rookie = await join('Novato', 1000);
    expect(queue.size).toBe(2); // 600 apart: not yet
    const peer = await join('Parceiro', 1080);
    expect(rookie.last).toMatchObject({ t: 'matched' });
    expect(peer.last).toMatchObject({ t: 'matched' });
    expect(pro.last).toEqual({ t: 'queued' });

    const other = await join('Outro', 1100);
    expect(other.last).toEqual({ t: 'queued' }); // 500 apart, the pro has waited only a moment
    // Waiting widens the window by MATCH_WINDOW.PER_SECOND per second: 500 fits after ~35 s.
    const seconds = Math.ceil((500 - MATCH_WINDOW.BASE) / MATCH_WINDOW.PER_SECOND);
    for (let s = 0; s <= seconds; s += MATCH_WINDOW.RETRY_MS / 1000) await advance(MATCH_WINDOW.RETRY_MS);
    expect(pro.last).toMatchObject({ t: 'matched' });
    expect(other.last).toMatchObject({ t: 'matched' });
    expect(queue.size).toBe(0);
  });

  it('keeps someone who gives up while their rating is being looked up out of the line', async () => {
    const { queue, connect } = setup();
    const c = connect();
    const joining = queue.message(
      c,
      JSON.stringify({ t: 'join', v: PROTOCOL_VERSION, name: 'Nathan', pid: 'f'.repeat(32) }),
    );
    queue.closed(c);
    await joining;
    expect(queue.size).toBe(0);
  });
});
