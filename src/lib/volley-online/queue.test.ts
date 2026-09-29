import { describe, expect, it } from 'vitest';
import { NET, PROTOCOL_VERSION } from './protocol';
import { MatchQueue, parseQueueMessage, type QueueConn, type QueueEntry, type QueueServerMessage } from './queue';

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
  const queue = new MatchQueue({
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
  const join = async (name: string, c = connect()) => {
    time += 10;
    await queue.message(c, JSON.stringify({ t: 'join', v: PROTOCOL_VERSION, name }));
    return c;
  };
  const advance = (ms: number) => {
    time += ms;
    for (const [name, at] of [...timers]) {
      if (at > time) continue;
      timers.delete(name);
      queue.timer(name as `hello:${string}`);
    }
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
    advance(NET.HELLO_TIMEOUT_MS + 1);
    expect(silent.last).toEqual({ t: 'error', code: 'timeout' });
  });

  it('rebuilds the line from its sockets after hibernation, oldest first', async () => {
    const { queue, join } = setup();
    const late = new FakeConn('late');
    const early = new FakeConn('early');
    queue.restore(late, { name: 'Tarde', since: 500 });
    queue.restore(early, { name: 'Cedo', since: 100 });
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
});
