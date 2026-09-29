import { FIELD, TIMING } from '../../components/volleyball/engine/constants';
import { createGame, stepGame } from '../../components/volleyball/engine/physics';
import type { Body, GameState, Side } from '../../components/volleyball/engine/types';
import { applySnapshot, unpackInput, type Snapshot } from './protocol';

/**
 * Client-side netcode (docs/volei-online.md, "Netcode").
 *
 * The browser doesn't wait for the server to see its own moves: it runs the
 * same physics locally ("prediction"), a few ticks ahead of the server, with
 * the player's keys applied immediately and the opponent's last known keys.
 * Each authoritative snapshot rewinds the local game to the server's state
 * and replays the player's own keys since then ("reconciliation"). Whatever
 * moved because of that correction is eased in over a few frames instead of
 * snapping ("smoothing").
 */

const STEP_MS = TIMING.STEP * 1000;
/** Corrections this large (a new serve, a long lag spike) are applied at once. */
const SNAP_PX = 110;
/** Visual error left after one second: e^(−12) ≈ 0. */
const SMOOTHING_PER_SECOND = 12;
/**
 * Replaying is how far ahead we run (a round trip + margin) plus how old the
 * snapshot is (half a round trip): ~1.5 × RTT. 150 ticks (1.25 s) covers
 * round trips up to ~800 ms; past that, just follow the server.
 */
const MAX_REPLAY = 150;

type Offset = [dx: number, dy: number];

export class Predictor {
  /** The predicted game at `tick`. */
  readonly g: GameState;
  tick = 0;
  /** No snapshot yet: nothing to predict from. */
  ready = false;
  private readonly side: Side;
  /** My held keys per tick, since the last snapshot (world directions). */
  private readonly history = new Map<number, number>();
  private myBits = 0;
  private opponentBits = 0;
  /** Visual-only error per body (left player, right player, ball), decaying to zero. */
  readonly offsets: [Offset, Offset, Offset] = [
    [0, 0],
    [0, 0],
    [0, 0],
  ];
  /** Corrections applied (for the debug overlay and the tests). */
  corrections = 0;

  constructor(side: Side, g: GameState = createGame('online')) {
    this.side = side;
    this.g = g;
  }

  /** Advances one tick with the keys held now (world directions). */
  advance(bits: number) {
    this.tick++;
    this.myBits = bits;
    this.history.set(this.tick, bits);
    this.step(bits);
  }

  /**
   * Runs the prediction up to `target` with the keys held now. Returns the
   * tick a key change was scheduled on (to send to the server), or null.
   *
   * When several ticks are due at once (the first snapshot, a slow frame),
   * the earlier ones use the keys the server already has and only the last
   * one gets the new keys: those earlier ticks are close to (or already in)
   * the server's past, and a change scheduled there would arrive late.
   */
  advanceTo(target: number, bits: number): number | null {
    if (!this.ready || this.tick >= target) return null;
    while (this.tick < target - 1) this.advance(this.myBits);
    const changed = bits !== this.myBits;
    this.advance(bits);
    return changed ? this.tick : null;
  }

  /** Authoritative state arrived: rewind to it and replay my keys up to where I am. */
  receive(s: Snapshot) {
    // First snapshot, running behind the server, or hopelessly ahead: jump to it.
    if (!this.ready || s.tick >= this.tick || this.tick - s.tick > MAX_REPLAY) return this.jumpTo(s);

    const before = this.positions();
    applySnapshot(this.g, s);
    this.opponentBits = s.inputs[this.side === 0 ? 1 : 0];
    for (const t of this.history.keys()) if (t <= s.tick) this.history.delete(t);

    let bits = s.inputs[this.side];
    for (let t = s.tick + 1; t <= this.tick; t++) {
      bits = this.history.get(t) ?? bits;
      this.step(bits);
    }

    const after = this.positions();
    after.forEach(([x, y], i) => {
      const o = this.offsets[i];
      o[0] += before[i][0] - x;
      o[1] += before[i][1] - y;
      if (Math.hypot(o[0], o[1]) > SNAP_PX) o[0] = o[1] = 0;
      else if (Math.abs(before[i][0] - x) + Math.abs(before[i][1] - y) > 0.5) this.corrections++;
    });
  }

  /** Shows exactly the server's state, dropping whatever was predicted past it (a pause, the final whistle). */
  jumpTo(s: Snapshot) {
    applySnapshot(this.g, s);
    this.opponentBits = s.inputs[this.side === 0 ? 1 : 0];
    this.tick = s.tick;
    this.history.clear();
    this.ready = true;
    this.offsets.forEach((o) => ((o[0] = 0), (o[1] = 0)));
  }

  /** Eases the visual error out; call once per rendered frame. */
  smooth(dtSeconds: number) {
    const k = Math.exp(-SMOOTHING_PER_SECOND * dtSeconds);
    for (const o of this.offsets) {
      o[0] *= k;
      o[1] *= k;
    }
  }

  /** What to draw: the predicted game with the visual offsets added (a copy; the simulation is untouched). */
  view(): GameState {
    const [p, c, b] = [this.g.player, this.g.cpu, this.g.ball].map((body, i): Body => ({
      ...body,
      x: body.x + this.offsets[i][0],
      y: Math.min(FIELD.GROUND, body.y + this.offsets[i][1]),
    }));
    return { ...this.g, player: p, cpu: c, ball: b };
  }

  private step(mine: number) {
    const me = unpackInput(mine);
    const them = unpackInput(this.opponentBits);
    if (this.side === 0) stepGame(this.g, TIMING.STEP, me, noRandom, them);
    else stepGame(this.g, TIMING.STEP, them, noRandom, me);
  }

  private positions(): [number, number][] {
    return [this.g.player, this.g.cpu, this.g.ball].map((b) => [b.x, b.y]);
  }

  /** Last keys applied (the ones to resend after a reconnection). */
  get bits() {
    return this.myBits;
  }
}

/**
 * Keeps the local tick ahead of the server's, so a key pressed now reaches
 * the server before it simulates that tick. The server's clock is estimated
 * from snapshot arrival times, which already lag it by half a round trip;
 * the input then needs another half to travel back. Hence the lead: one full
 * round trip, plus twice its variation (like TCP's retransmission timer) and
 * a small margin so jittery links still make it on time. The clock estimate
 * is filtered so one late packet doesn't yank it.
 */
export class TickClock {
  /** Smoothed round trip and its mean deviation (ms), RFC 6298 style. */
  rtt = 120;
  rttVar = 60;
  private measured = false;
  private offsetMs: number | null = null;
  private readonly marginMs: number;

  constructor(marginMs = 10) {
    this.marginMs = marginMs;
  }

  /** A snapshot of `tick` arrived at local time `now` (ms). */
  observe(tick: number, now: number) {
    // Server "time" is tick × step; the sample is how far ahead of our clock it is.
    const sample = tick * STEP_MS - now;
    if (this.offsetMs === null) this.offsetMs = sample;
    // Packets only arrive late, never early: follow early ones quickly, late ones slowly.
    else this.offsetMs += (sample - this.offsetMs) * (sample > this.offsetMs ? 0.3 : 0.05);
  }

  /** A ping came back after `ms`. */
  observeRtt(ms: number) {
    if (!this.measured) {
      this.measured = true;
      this.rtt = ms;
      this.rttVar = ms / 2;
      return;
    }
    this.rttVar += (Math.abs(ms - this.rtt) - this.rttVar) * 0.25;
    this.rtt += (ms - this.rtt) * 0.125;
  }

  /** Forget the server clock (after a pause the server's tick stood still). */
  reset() {
    this.offsetMs = null;
  }

  get synced() {
    return this.offsetMs !== null;
  }

  /** Ticks to run ahead of the server clock as seen from here. */
  get lead() {
    return Math.ceil((this.rtt + 2 * this.rttVar + this.marginMs) / STEP_MS);
  }

  /** The tick the local simulation should be at, at local time `now`. */
  target(now: number) {
    if (this.offsetMs === null) return 0;
    return Math.floor((now + this.offsetMs) / STEP_MS) + this.lead;
  }
}

/**
 * The court as the right-hand player sees it: flipped, so everyone plays from
 * the left, in the "you" colour, with the score in the usual order.
 */
export function mirrorState(g: GameState): GameState {
  const flip = (b: Body): Body => ({ ...b, x: FIELD.W - b.x, vx: -b.vx });
  const other = (s: Side | null): Side | null => (s === null ? null : s === 0 ? 1 : 0);
  return {
    ...g,
    player: flip(g.cpu),
    cpu: flip(g.player),
    ball: flip(g.ball),
    score: [g.score[1], g.score[0]],
    server: other(g.server) as Side,
    lastScorer: other(g.lastScorer),
    ballSide: other(g.ballSide) as Side,
  };
}

function noRandom(): number {
  throw new Error('the online match must be deterministic');
}
