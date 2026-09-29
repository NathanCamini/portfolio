import { createGame } from '../../components/volleyball/engine/physics';
import type { GameState } from '../../components/volleyball/engine/types';
import { applySnapshot, type Snapshot } from './protocol';

/**
 * What a spectator draws (docs/volei-online.md, "Espectadores"). They don't
 * play, so there's nothing to predict: the screen runs one snapshot behind
 * and glides between the last two (60 per second, so ~17 ms behind), which
 * is smooth and never wrong. A jump too big to glide (a serve resetting the
 * court) is shown at once.
 */

/** Farther than this between two snapshots is a reset, not movement. */
const TELEPORT_PX = 110;

interface Arrival {
  s: Snapshot;
  at: number;
}

export class SnapshotBuffer {
  private prev: Arrival | null = null;
  private last: Arrival | null = null;
  private readonly g: GameState = createGame('online');

  /** A snapshot arrived at local time `at` (ms). Older-than-last ones are ignored. */
  push(s: Snapshot, at: number) {
    if (this.last && s.tick <= this.last.s.tick) return;
    this.prev = this.last;
    this.last = { s, at };
  }

  get ready() {
    return this.last !== null;
  }

  /** The state to draw at local time `now`: from prev to last over the time last took to arrive. */
  view(now: number): GameState | null {
    const { prev, last } = this;
    if (!last) return null;
    applySnapshot(this.g, last.s);
    if (!prev) return this.g;
    const span = Math.max(1, last.at - prev.at);
    const t = Math.min(1, Math.max(0, (now - last.at) / span));
    [this.g.player, this.g.cpu, this.g.ball].forEach((b, i) => {
      const [x0, y0] = [prev.s.bodies[i * 4], prev.s.bodies[i * 4 + 1]];
      const [x1, y1] = [last.s.bodies[i * 4], last.s.bodies[i * 4 + 1]];
      if (Math.hypot(x1 - x0, y1 - y0) > TELEPORT_PX) return;
      b.x = x0 + (x1 - x0) * t;
      b.y = y0 + (y1 - y0) * t;
    });
    return this.g;
  }
}
