import { describe, expect, it } from 'vitest';
import { FIELD, TIMING } from '../../components/volleyball/engine/constants';
import { createGame, kickoff } from '../../components/volleyball/engine/physics';
import type { Side } from '../../components/volleyball/engine/types';
import { OnlineMatch } from './match';
import { mirrorState, Predictor, TickClock } from './predictor';
import { KEY, NET, takeSnapshot, type Snapshot } from './protocol';
import { seeded, sideBot } from './testing';

const STEP_MS = TIMING.STEP * 1000;

describe('mirrorState', () => {
  it('flips the court so the right-hand player sees themselves on the left', () => {
    const g = createGame('online');
    kickoff(g, 1);
    g.score = [2, 5];
    Object.assign(g.ball, { x: 700, vx: 3 });
    const m = mirrorState(g);
    expect(m.player.x).toBe(FIELD.W - g.cpu.x);
    expect(m.cpu.x).toBe(FIELD.W - g.player.x);
    expect(m.ball).toMatchObject({ x: FIELD.W - 700, vx: -3 });
    expect(m.score).toEqual([5, 2]);
    expect(m.server).toBe(0);
    expect(mirrorState(m).player).toEqual(g.player); // mirroring twice is the identity
  });
});

describe('Predictor.jumpTo', () => {
  it('drops what was predicted past the server and shows its state exactly (a pause, the final whistle)', () => {
    const server = new OnlineMatch(0);
    const p = new Predictor(0);
    p.receive(server.snapshot());
    for (let i = 0; i < 30; i++) p.advance(2); // ran ahead, walking right
    for (let i = 0; i < 12; i++) server.step();
    const frozen = server.sync();
    p.receive(frozen); // replayed: still 30 ticks in, not where the server stopped
    expect(p.tick).toBe(30);
    p.jumpTo(frozen);
    expect(p.tick).toBe(frozen.tick);
    expect(takeSnapshot(p.g, frozen.tick, frozen.inputs)).toEqual(frozen);
    expect(p.view().player).toMatchObject({ x: frozen.bodies[0], y: frozen.bodies[1] }); // no easing left over
  });
});

describe('TickClock', () => {
  it('runs a full round trip (plus its variation and a margin) ahead of the server clock it observes', () => {
    const clock = new TickClock(10);
    for (let i = 0; i < 60; i++) clock.observeRtt(100);
    expect(clock.rttVar).toBeLessThan(1);
    expect(clock.lead).toBe(Math.ceil(110 / STEP_MS));
    const jittery = new TickClock(10);
    for (let i = 0; i < 60; i++) jittery.observeRtt(i % 2 ? 80 : 120);
    expect(jittery.lead).toBeGreaterThan(clock.lead); // a shaky link gets a bigger cushion
    clock.observe(1200, 10_000); // snapshot of tick 1200 arrives at local 10 000 ms
    expect(clock.target(10_000)).toBe(1200 + clock.lead);
    expect(clock.target(10_000 + 10 * STEP_MS)).toBe(1210 + clock.lead);
  });

  it('shrugs off one late packet but follows an early one', () => {
    const clock = new TickClock(0);
    clock.observe(1000, 5000);
    const base = clock.target(5000);
    clock.observe(1004, 5000 + 4 * STEP_MS + 80); // 80 ms late
    expect(clock.target(5000) - base).toBeGreaterThan(-2);
    clock.observe(1008, 5000 + 8 * STEP_MS - 40); // 40 ms early: the path got faster
    expect(clock.target(5000) - base).toBeGreaterThanOrEqual(1);
  });
});

interface NetOptions {
  /** One-way latency (ms). */
  latency: number;
  /** Extra random delay per message, 0..jitter ms. */
  jitter: number;
  seed: number;
  /** The opponent's key changes are relayed as they happen (default), or only learnt from snapshots (before). */
  relay?: boolean;
  /** Ticks between snapshots (default NET.SNAPSHOT_EVERY; 4 was the old 30/s). */
  every?: number;
  /** A point is sent the moment it happens (default), or waits for the next snapshot tick. */
  events?: boolean;
}

/**
 * A whole online match on a simulated network, millisecond by millisecond:
 * the authoritative match (like the Durable Object runs it), two browsers
 * predicting it (Predictor + TickClock, like useOnlineVolley), bots pressing
 * keys from what each browser *predicts*, and every message delayed by the
 * network. Returns how far predictions strayed from the truth.
 */
function simulate({ latency, jitter, seed, relay = true, every = NET.SNAPSHOT_EVERY, events = true }: NetOptions) {
  const rng = seeded(seed);
  const delay = () => latency + rng() * jitter;
  const server = new OnlineMatch(0);
  const truth = new Map<number, Snapshot>([[0, server.snapshot()]]);
  const clients = ([0, 1] as const).map((side) => {
    const clock = new TickClock();
    return { side, clock, predictor: new Predictor(side), bot: sideBot(side, seeded(seed + 10 + side)) };
  });
  type Msg = { at: number; deliver: (now: number) => void };
  let inbox: Msg[] = [];
  // A WebSocket runs over TCP: each direction of each connection delivers in order (a late
  // message holds up the ones behind it), it never reorders.
  const lastAt = new Map<string, number>();
  const send = (deliver: (now: number) => void, now: number, channel: string) => {
    const at = Math.max(now + delay(), lastAt.get(channel) ?? 0);
    lastAt.set(channel, at);
    inbox.push({ at, deliver });
  };

  let nextPing = 0;
  let ownError = 0; // largest own-body correction during a rally
  let ballError = 0;
  let opponentError = 0;
  let samples = 0;
  /** `${side}:${tick}` → what that browser showed for the tick (ball x, opponent x), after the corrections it had by then. */
  const shown = new Map<string, [number, number]>();

  for (let now = 0; !server.over && now < 20 * 60_000; now++) {
    // 1) the network delivers what's due
    const due = inbox.filter((m) => m.at <= now);
    inbox = inbox.filter((m) => m.at > now);
    due.sort((a, b) => a.at - b.at).forEach((m) => m.deliver(now));

    // 2) the server simulates up to now, broadcasting on snapshot ticks, and at once when the phase changes
    while ((server.tick + 1) * STEP_MS <= now && !server.over) {
      const phase = server.g.phase;
      server.step();
      const rhythm = server.tick % every === 0;
      const event = !rhythm && ((events && server.g.phase !== phase) || server.over);
      const s = event ? server.sync() : server.snapshot();
      truth.set(server.tick, s);
      if (rhythm || event) {
        for (const c of clients) {
          send(
            (arrived) => {
              const rally = c.predictor.g.phase === 'play' && s.phase === 'play';
              const mine = c.side === 0 ? 0 : 1;
              const before = [...c.predictor.offsets[mine]];
              c.clock.observe(s.tick, arrived);
              c.predictor.receive(s);
              const o = c.predictor.offsets[mine];
              if (rally) ownError = Math.max(ownError, Math.hypot(o[0] - before[0], o[1] - before[1]));
            },
            now,
            `down:${c.side}`,
          );
        }
      }
    }

    // 3) each browser pings every 250 ms, runs its prediction up to its target tick and sends key changes
    if (now >= nextPing) {
      nextPing = now + 250;
      for (const c of clients) c.clock.observeRtt(delay() + delay());
    }
    for (const c of clients) {
      if (!c.predictor.ready || !c.clock.synced) continue;
      // Like a browser frame: read the keys once, then catch up to the target tick.
      const bits = c.bot(c.predictor.g);
      const tick = c.predictor.advanceTo(c.clock.target(now), bits);
      if (tick === null) continue;
      send(
        (arrived) => {
          // Like RoomCore: schedule it, and relay it to the other browser right away.
          const applied = server.input(c.side as Side, tick, bits);
          if (applied.result === 'ahead' || !relay) return;
          const rival = clients[c.side === 0 ? 1 : 0];
          send(() => rival.predictor.opponentInput(applied.tick, bits), arrived, `down:${rival.side}`);
        },
        now,
        `up:${c.side}`,
      );
      c.predictor.smooth(0.001);
    }
    // 4) what each screen shows at the end of this millisecond
    for (const c of clients) {
      if (!c.predictor.ready) continue;
      const g = c.predictor.g;
      shown.set(`${c.side}:${c.predictor.tick}`, [g.ball.x, (c.side === 0 ? g.cpu : g.player).x]);
    }
  }

  for (const [key, [ball, opponent]] of shown) {
    const [side, tick] = key.split(':').map(Number);
    const s = truth.get(tick);
    if (s?.phase !== 'play') continue;
    ballError += Math.abs(ball - s.bodies[8]);
    opponentError += Math.abs(opponent - s.bodies[side === 0 ? 4 : 0]);
    samples++;
  }
  return {
    over: server.over,
    score: server.g.score,
    ownError,
    ballError: ballError / samples,
    opponentError: opponentError / samples,
    clientScores: clients.map((c) => c.predictor.g.score),
  };
}

describe('prediction + reconciliation over a simulated network', () => {
  it('on a steady 40 ms link, a player never has to correct their own moves', () => {
    const r = simulate({ latency: 40, jitter: 0, seed: 5 });
    expect(r.over).toBe(true);
    // Inputs always reach the server before it simulates their tick: own body = server, to the rounding.
    expect(r.ownError).toBeLessThan(0.01);
    // Both browsers end on the server's final score.
    expect(r.clientScores).toEqual([r.score, r.score]);
  });

  it('with 80 ms and jitter, own moves stay exact and the predicted ball close to the real one', () => {
    const r = simulate({ latency: 80, jitter: 30, seed: 9 });
    expect(r.over).toBe(true);
    expect(r.ownError).toBeLessThan(0.01);
    expect(r.ballError).toBeLessThan(10); // px, averaged over every predicted rally tick
    expect(r.clientScores).toEqual([r.score, r.score]);
  });

  it('still plays a sane match across the Atlantic (150 ms each way, 50 ms jitter), own moves exact', () => {
    const r = simulate({ latency: 150, jitter: 50, seed: 4 });
    expect(r.over).toBe(true);
    expect(r.ownError).toBeLessThan(0.01);
    expect(r.ballError).toBeLessThan(8);
    expect(r.clientScores).toEqual([r.score, r.score]);
  });

  it('shows the ball and the opponent closer to the truth with relayed keys and 60 snapshots/s', () => {
    // The old scheme: 30 snapshots/s, the opponent's keys only from snapshots, points on the next snapshot tick.
    const before = simulate({ latency: 80, jitter: 30, seed: 5, relay: false, every: 4, events: false });
    const after = simulate({ latency: 80, jitter: 30, seed: 5 });
    expect(after.ballError).toBeLessThan(before.ballError * 0.75);
    expect(after.opponentError).toBeLessThan(before.opponentError * 0.8);
  });

  it('replays from the last snapshot when a relayed key change of the opponent lands in the past', () => {
    const server = new OnlineMatch(0);
    for (let i = 0; i < 120; i++) server.step(); // into the rally
    const p = new Predictor(0);
    p.receive(server.snapshot());
    for (let i = 0; i < 20; i++) p.advance(0); // 20 ticks ahead, the opponent assumed idle
    // The opponent (right) actually started walking left 5 ticks after the snapshot.
    const at = server.tick + 5;
    server.input(1, at, KEY.LEFT);
    for (let i = 0; i < 20; i++) server.step();
    p.opponentInput(at, KEY.LEFT);
    expect(p.tick).toBe(server.tick);
    // Exactly the server's state (bit for bit: same steps, same rounding), before any snapshot says so.
    expect(takeSnapshot(p.g, p.tick, [0, 0])).toEqual(takeSnapshot(server.g, server.tick, [0, 0]));
    expect(p.g.ball).toEqual(server.g.ball);
    // A change still in the future of the prediction is just kept for when we get there.
    p.opponentInput(p.tick + 10, 0);
    expect(p.g.cpu.x).toBe(server.g.cpu.x);
  });

  it('ignores a snapshot older than the one it already has', () => {
    const server = new OnlineMatch(0);
    const p = new Predictor(0);
    for (let i = 0; i < 40; i++) server.step();
    const old = server.snapshot();
    for (let i = 0; i < 10; i++) server.step();
    p.receive(server.snapshot());
    for (let i = 0; i < 5; i++) p.advance(0);
    const x = p.g.player.x;
    p.receive(old);
    expect(p.g.player.x).toBe(x);
  });

  it('starts from the first snapshot it gets and follows a server that is ahead', () => {
    const p = new Predictor(1);
    const g = createGame('online');
    kickoff(g, 0);
    p.receive(takeSnapshot(g, 500, [0, 0]));
    expect(p.ready).toBe(true);
    expect(p.tick).toBe(500);
    p.receive(takeSnapshot(g, 520, [0, 0]));
    expect(p.tick).toBe(520);
  });
});
