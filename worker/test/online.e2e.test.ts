import { describe, expect, it } from 'vitest';
import { gameConfig } from '../../src/config/game';
import { Predictor, TickClock } from '../../src/lib/volley-online/predictor';
import {
  parseServerMessage,
  PROTOCOL_VERSION,
  type OnlineRankingResponse,
  type RoomView,
  type ServerMessage,
} from '../../src/lib/volley-online/protocol';
import { parseQueueServerMessage, type QueueServerMessage } from '../../src/lib/volley-online/queue';
import { seeded, sideBot } from '../../src/lib/volley-online/testing';
import { hashPlayer } from '../ratings';

/**
 * End to end against a running Worker (docs/volei-online.md, "Testes"):
 *
 *   npm run build && npx wrangler dev          # terminal 1
 *   VOLLEY_E2E_URL=http://127.0.0.1:8787 npx vitest run worker/test/online.e2e   # terminal 2
 *
 * Two bot players create a room over HTTP, join it over real WebSockets,
 * ready up, and play a whole match through the actual Durable Object —
 * each one predicting locally exactly like the browser does (Predictor +
 * TickClock). One of them drops mid-match and comes back with its token.
 * Two more meet through the quick-match queue.
 * Skipped unless VOLLEY_E2E_URL is set.
 */

const BASE = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.VOLLEY_E2E_URL;

class BotPlayer {
  ws!: WebSocket;
  room: RoomView | null = null;
  side: 0 | 1 = 0;
  token = '';
  errors: string[] = [];
  /** Opponent key changes relayed to this bot. */
  opps = 0;
  predictor: Predictor | null = null;
  clock = new TickClock();
  private loop: ReturnType<typeof setInterval> | null = null;
  private bot: ReturnType<typeof sideBot> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private waiters: { test: (m: ServerMessage) => boolean; resolve: () => void }[] = [];

  constructor(
    readonly name: string,
    private readonly seed: number,
    /** A player id (rated rooms) and the address it claims (local dev trusts CF-Connecting-IP). */
    readonly who: { pid?: string; ip?: string } = {},
  ) {}

  connect(code: string) {
    const url = `${BASE!.replace(/^http/, 'ws')}/api/volley/rooms/${code}`;
    // Node's WebSocket (undici) takes headers; a browser sends Origin by itself.
    const headers = { Origin: BASE!, ...(this.who.ip ? { 'CF-Connecting-IP': this.who.ip } : {}) };
    this.ws = new WebSocket(url, { headers } as unknown as string[]);
    this.ws.binaryType = 'arraybuffer'; // snapshots are binary frames
    this.ws.addEventListener('message', (e: MessageEvent) => this.onMessage(parseServerMessage(e.data)!));
    this.ws.addEventListener('open', () =>
      this.send({
        t: 'hello',
        v: PROTOCOL_VERSION,
        name: this.name,
        ...(this.token ? { token: this.token } : {}),
        ...(this.who.pid ? { pid: this.who.pid } : {}),
      }),
    );
    this.pingTimer = setInterval(
      () => this.send({ t: 'ping', c: performance.now(), rtt: Math.round(this.clock.rtt) }),
      500,
    );
    return this.until((m) => m.t === 'welcome' || m.t === 'error');
  }

  send(msg: object) {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  /** Resolves on the first incoming message that passes `test`. */
  until(test: (m: ServerMessage) => boolean) {
    return new Promise<void>((resolve) => this.waiters.push({ test, resolve }));
  }

  drop() {
    this.stop();
    this.ws.close();
  }

  stop() {
    if (this.loop) clearInterval(this.loop);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.loop = this.pingTimer = null;
  }

  private onMessage(m: ServerMessage) {
    if (m.t === 'welcome') {
      this.side = m.side;
      this.token = m.token;
      this.room = m.room;
      this.predictor = new Predictor(m.side);
      this.bot = sideBot(m.side, seeded(this.seed));
    } else if (m.t === 'room') {
      if (m.room.phase === 'playing' && this.room?.phase !== 'playing') this.clock.reset();
      this.room = m.room;
    } else if (m.t === 'state') {
      this.clock.observe(m.s.tick, performance.now());
      this.predictor?.receive(m.s);
      this.startLoop();
    } else if (m.t === 'opp') {
      this.predictor?.opponentInput(m.tick, m.bits);
      this.opps++;
    } else if (m.t === 'pong') {
      this.clock.observeRtt(performance.now() - m.c);
    } else if (m.t === 'error') {
      this.errors.push(m.code);
    }
    this.waiters = this.waiters.filter((w) => (w.test(m) ? (w.resolve(), false) : true));
  }

  /** Like useOnlineVolley's frame loop: read keys, catch up to the target tick, send changes. */
  private startLoop() {
    if (this.loop) return;
    this.loop = setInterval(() => {
      const p = this.predictor;
      if (!p || this.room?.phase !== 'playing' || !this.clock.synced) return;
      const bits = this.bot!(p.g);
      const tick = p.advanceTo(this.clock.target(performance.now()), bits);
      if (tick !== null) this.send({ t: 'input', tick, bits });
    }, 1000 / 60);
  }
}

async function createRoom() {
  const res = await fetch(`${BASE}/api/volley/rooms`, { method: 'POST', headers: { Origin: BASE! } });
  expect(res.status).toBe(201);
  return ((await res.json()) as { code: string }).code;
}
/** Waits in the quick-match queue; resolves with the room code it's sent to. */
function queueUp(name: string) {
  const ws = new WebSocket(`${BASE!.replace(/^http/, 'ws')}/api/volley/queue`, {
    headers: { Origin: BASE! },
  } as unknown as string[]);
  const messages: QueueServerMessage[] = [];
  const matched = new Promise<string>((resolve, reject) => {
    ws.addEventListener('open', () => ws.send(JSON.stringify({ t: 'join', v: PROTOCOL_VERSION, name })));
    ws.addEventListener('message', (e: MessageEvent) => {
      const m = parseQueueServerMessage(e.data)!;
      messages.push(m);
      if (m.t === 'matched') resolve(m.code);
      if (m.t === 'error') reject(new Error(m.code));
    });
  });
  return { ws, messages, matched };
}

describe.skipIf(!BASE)('online volleyball against a running Worker', () => {
  it('two bots play a full match, with a drop and a rejoin in the middle', { timeout: 15 * 60_000 }, async () => {
    const code = await createRoom();
    const a = new BotPlayer('Ana Teste', 1);
    const b = new BotPlayer('Beto Teste', 2);
    await a.connect(code);
    await b.connect(code);
    expect([a.errors, b.errors]).toEqual([[], []]);
    expect([a.side, b.side]).toEqual([0, 1]);

    a.send({ t: 'ready', ready: true });
    b.send({ t: 'ready', ready: true });
    await a.until((m) => m.t === 'room' && m.room.phase === 'playing');

    // A few seconds in, B's connection drops; A sees the pause; B comes back with its token.
    await a.until((m) => m.t === 'state' && m.s.tick > 120 * 4);
    b.drop();
    await a.until((m) => m.t === 'room' && m.room.phase === 'paused');
    await b.connect(code);
    await a.until((m) => m.t === 'room' && m.room.phase === 'playing');

    await a.until((m) => m.t === 'room' && m.room.phase === 'over');
    await b.until((m) => m.t === 'room' && m.room.phase === 'over');
    a.stop();
    b.stop();

    expect(a.opps).toBeGreaterThan(0); // the other bot's keys arrived as they happened, not just in snapshots
    const result = a.room!.result!;
    expect(result.forfeit).toBe(false);
    expect(Math.max(...result.score)).toBe(gameConfig.onlineWinScore);
    // Both browsers ended on the server's final score.
    expect(a.predictor!.g.score).toEqual(result.score);
    expect(b.predictor!.g.score).toEqual(result.score);
    expect(a.errors).toEqual([]);
    expect(b.errors).toEqual([]);
    a.ws.close();
    b.ws.close();
  });

  it('quick match pairs two strangers into one new room, where they play', { timeout: 60_000 }, async () => {
    const first = queueUp('Fila Um');
    await new Promise((r) => setTimeout(r, 300));
    expect(first.messages).toEqual([{ t: 'queued' }]); // alone in line
    const second = queueUp('Fila Dois');
    const [codeA, codeB] = await Promise.all([first.matched, second.matched]);
    expect(codeA).toBe(codeB);

    // Fresh ids every run, so the ratings table of `wrangler dev` doesn't carry state between runs.
    const pid = () =>
      [...crypto.getRandomValues(new Uint8Array(16))].map((x) => x.toString(16).padStart(2, '0')).join('');
    const a = new BotPlayer('Fila Um', 5, { pid: pid(), ip: '203.0.113.1' });
    const b = new BotPlayer('Fila Dois', 6, { pid: pid(), ip: '203.0.113.2' });
    await a.connect(codeA);
    await b.connect(codeB);
    expect(a.room!.rated).toBe(true); // rooms from the queue count for the ranking
    a.send({ t: 'ready', ready: true });
    b.send({ t: 'ready', ready: true });
    await a.until((m) => m.t === 'room' && m.room.phase === 'playing');
    await a.until((m) => m.t === 'state' && m.s.tick > 120);
    expect([a.errors, b.errors]).toEqual([[], []]);

    // B gives up: a forfeit, saved to D1, and both ratings come back with the result.
    b.send({ t: 'leave' });
    await a.until((m) => m.t === 'room' && !!m.room.result?.ratings);
    const [mine, theirs] = a.room!.result!.ratings!;
    expect(mine.after).toBeGreaterThan(mine.before);
    expect(theirs.after).toBeLessThan(theirs.before);
    const me = await hashPlayer(a.who.pid!);
    const board = (await (await fetch(`${BASE}/api/volley/ratings?me=${me}`)).json()) as OnlineRankingResponse;
    expect(board.me).toMatchObject({ name: 'Fila Um', rating: mine.after, games: 1, wins: 1 });
    [a, b].forEach((p) => (p.stop(), p.ws.close()));
  });

  it('lets a spectator watch a running match and see the reactions', { timeout: 60_000 }, async () => {
    const code = await createRoom();
    const a = new BotPlayer('Ana Palco', 7);
    const b = new BotPlayer('Beto Palco', 8);
    await a.connect(code);
    await b.connect(code);
    a.send({ t: 'ready', ready: true });
    b.send({ t: 'ready', ready: true });
    await a.until((m) => m.t === 'room' && m.room.phase === 'playing');

    const seen: ServerMessage[] = [];
    const watcher = new WebSocket(`${BASE!.replace(/^http/, 'ws')}/api/volley/rooms/${code}`, {
      headers: { Origin: BASE! },
    } as unknown as string[]);
    watcher.binaryType = 'arraybuffer';
    watcher.addEventListener('open', () =>
      watcher.send(JSON.stringify({ t: 'hello', v: PROTOCOL_VERSION, name: '', watch: true })),
    );
    watcher.addEventListener('message', (e: MessageEvent) => seen.push(parseServerMessage(e.data)!));
    await a.until((m) => m.t === 'room' && m.room.spectators === 1); // the players see the audience
    await new Promise((r) => setTimeout(r, 1000));
    expect(seen[0]).toMatchObject({ t: 'watching', room: { code } });
    expect(seen.filter((m) => m.t === 'state').length).toBeGreaterThan(40); // ~60/s, like the players

    a.send({ t: 'emote', id: 4 });
    await b.until((m) => m.t === 'emote');
    await new Promise((r) => setTimeout(r, 200));
    expect(seen.find((m) => m.t === 'emote')).toEqual({ t: 'emote', side: a.side, id: 4 });
    watcher.close();
    [a, b].forEach((p) => (p.stop(), p.ws.close()));
  });

  it('refuses a third player and an unknown room', { timeout: 30_000 }, async () => {
    const code = await createRoom();
    const players = [new BotPlayer('Uno', 1), new BotPlayer('Dos', 2), new BotPlayer('Tres', 3)];
    await players[0].connect(code);
    await players[1].connect(code);
    await players[2].connect(code);
    expect(players.map((p) => p.errors)).toEqual([[], [], ['room_full']]);

    // A code nobody created: the Durable Object answers 404 before upgrading, so the socket never opens.
    const ghost = new WebSocket(`${BASE!.replace(/^http/, 'ws')}/api/volley/rooms/ZZZZ9`, {
      headers: { Origin: BASE! },
    } as unknown as string[]);
    const opened = await new Promise<boolean>((resolve) => {
      ghost.addEventListener('open', () => resolve(true));
      ghost.addEventListener('error', () => resolve(false));
    });
    expect(opened).toBe(false);
    players.forEach((p) => (p.stop(), p.ws.close()));
  });
});
