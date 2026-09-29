import { describe, expect, it } from 'vitest';
import { FIELD, TIMING } from '../../components/volleyball/engine/constants';
import { createGame, kickoff } from '../../components/volleyball/engine/physics';
import type { Side } from '../../components/volleyball/engine/types';
import { OnlineMatch } from './match';
import { mirrorState, Predictor, TickClock } from './predictor';
import { takeSnapshot, type Snapshot } from './protocol';
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
}

/**
 * A whole online match on a simulated network, millisecond by millisecond:
 * the authoritative match (like the Durable Object runs it), two browsers
 * predicting it (Predictor + TickClock, like useOnlineVolley), bots pressing
 * keys from what each browser *predicts*, and every message delayed by the
 * network. Returns how far predictions strayed from the truth.
 */
function simulate({ latency, jitter, seed }: NetOptions) {
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
  const send = (deliver: (now: number) => void, now: number) => inbox.push({ at: now + delay(), deliver });

  let nextPing = 0;
  let ownError = 0; // largest own-body correction during a rally
  let ballError = 0;
  let ballSamples = 0;
  const predicted = new Map<string, number>(); // `${side}:${tick}` → predicted ball x

  for (let now = 0; !server.over && now < 20 * 60_000; now++) {
    // 1) the network delivers what's due
    const due = inbox.filter((m) => m.at <= now);
    inbox = inbox.filter((m) => m.at > now);
    due.sort((a, b) => a.at - b.at).forEach((m) => m.deliver(now));

    // 2) the server simulates up to now, broadcasting every 4th tick
    while ((server.tick + 1) * STEP_MS <= now && !server.over) {
      server.step();
      truth.set(server.tick, server.snapshot());
      if (server.tick % 4 === 0 || server.over) {
        const s = server.snapshot();
        for (const c of clients) {
          send((arrived) => {
            const rally = c.predictor.g.phase === 'play' && s.phase === 'play';
            const mine = c.side === 0 ? 0 : 1;
            const before = [...c.predictor.offsets[mine]];
            c.clock.observe(s.tick, arrived);
            c.predictor.receive(s);
            const o = c.predictor.offsets[mine];
            if (rally) ownError = Math.max(ownError, Math.hypot(o[0] - before[0], o[1] - before[1]));
          }, now);
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
      predicted.set(`${c.side}:${c.predictor.tick}`, c.predictor.g.ball.x);
      if (tick !== null) send(() => server.input(c.side as Side, tick, bits), now);
      c.predictor.smooth(0.001);
    }
  }

  for (const [key, x] of predicted) {
    const s = truth.get(Number(key.split(':')[1]));
    if (s?.phase !== 'play') continue;
    ballError += Math.abs(x - s.bodies[8]);
    ballSamples++;
  }
  return {
    over: server.over,
    score: server.g.score,
    ownError,
    ballError: ballError / ballSamples,
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

  it('still plays a sane match across the Atlantic (150 ms each way, 50 ms jitter)', () => {
    const r = simulate({ latency: 150, jitter: 50, seed: 4 });
    expect(r.over).toBe(true);
    // Own moves can get corrected here, right after a serve: when the serve reset happens depends on
    // where the *other* player sent the ball, and at this latency that falls inside the prediction window.
    expect(r.ballError).toBeLessThan(30);
    expect(r.clientScores).toEqual([r.score, r.score]);
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
