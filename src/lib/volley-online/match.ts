import { TIMING } from '../../components/volleyball/engine/constants';
import { createGame, kickoff, stepGame } from '../../components/volleyball/engine/physics';
import type { GameState, Side } from '../../components/volleyball/engine/types';
import { applySnapshot, NET, takeSnapshot, unpackInput, type Snapshot } from './protocol';

/**
 * One player's held keys over time, keyed by the tick they take effect on.
 *
 * Clients schedule each change for a future tick (their clock runs ahead of
 * the server's by about a round trip plus a margin, see TickClock in
 * predictor.ts), so a change
 * normally arrives before the server simulates that tick and both sides
 * apply it on exactly the same step. A late one is moved to the next tick the
 * server can still simulate; the client's prediction is then corrected by the
 * next snapshot.
 */
export class InputTimeline {
  /** Sorted by tick; the first entry is the state before any change. */
  private entries: { tick: number; bits: number }[] = [{ tick: 0, bits: 0 }];

  set(tick: number, bits: number) {
    const i = this.entries.findIndex((e) => e.tick >= tick);
    if (i === -1) this.entries.push({ tick, bits });
    else if (this.entries[i].tick === tick) this.entries[i].bits = bits;
    else this.entries.splice(i, 0, { tick, bits });
  }

  /** Keys held on `tick`: the latest change scheduled at or before it. */
  at(tick: number): number {
    let bits = 0;
    for (const e of this.entries) {
      if (e.tick > tick) break;
      bits = e.bits;
    }
    return bits;
  }

  /** Forgets changes older than `tick`, keeping the one still in force then. */
  prune(tick: number) {
    const keep = this.entries.findIndex((e) => e.tick > tick);
    const from = (keep === -1 ? this.entries.length : keep) - 1;
    if (from > 0) this.entries.splice(0, from);
  }
}

export type InputResult = 'ok' | 'late' | 'ahead';

/**
 * The authoritative match. `tick` counts physics steps since kickoff: the
 * state after step N is "tick N", and the input scheduled for tick N is the
 * one applied during that step. Nothing here reads a clock or a random
 * number, so the same inputs always produce the same match (tests replay it).
 */
export class OnlineMatch {
  readonly g: GameState;
  tick = 0;
  private readonly timelines: [InputTimeline, InputTimeline] = [new InputTimeline(), new InputTimeline()];

  constructor(firstServer: Side, g: GameState = createGame('online')) {
    this.g = g;
    kickoff(g, firstServer);
    // Straight from kickoff: no title screen online, the countdown was the lobby's.
  }

  /** A player's key change. Late ones take effect on the next step; far-future ones are refused. */
  input(side: Side, tick: number, bits: number): InputResult {
    if (tick > this.tick + NET.MAX_INPUT_LEAD_TICKS) return 'ahead';
    const late = tick <= this.tick;
    this.timelines[side].set(late ? this.tick + 1 : tick, bits);
    return late ? 'late' : 'ok';
  }

  /** Keys each player holds on the current tick (sent along so clients can predict each other). */
  held(): [number, number] {
    return [this.timelines[0].at(this.tick), this.timelines[1].at(this.tick)];
  }

  step() {
    const next = this.tick + 1;
    stepGame(
      this.g,
      TIMING.STEP,
      unpackInput(this.timelines[0].at(next)),
      noRandom,
      unpackInput(this.timelines[1].at(next)),
    );
    this.tick = next;
    // On broadcast ticks the server continues from the rounded state it sends, so it and every
    // client replaying from that snapshot hold bit-identical numbers (docs: "Quantização").
    if (next % NET.SNAPSHOT_EVERY === 0) applySnapshot(this.g, this.snapshot());
    if (next % 240 === 0) this.timelines.forEach((t) => t.prune(next - 240));
  }

  get over() {
    return this.g.phase === 'over';
  }

  get winner(): Side {
    return this.g.score[0] > this.g.score[1] ? 0 : 1;
  }

  snapshot(): Snapshot {
    return takeSnapshot(this.g, this.tick, this.held());
  }

  /** A snapshot of right now that the server also adopts (off the 4-tick rhythm: pause, rejoin). */
  sync(): Snapshot {
    const s = this.snapshot();
    applySnapshot(this.g, s);
    return s;
  }
}

/** The two-player step never draws a random number; this makes sure it can't. */
function noRandom(): number {
  throw new Error('the online match must be deterministic');
}
