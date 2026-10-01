import type { SfxName } from '@/lib/audio/sfx';
import { FIELD, PHYSICS } from './engine/constants';
import type { Body, GameState } from './engine/types';

/**
 * Game sounds from what's on screen: compares the state drawn this frame with
 * the last one and names what happened (a jump, a touch, the net, a point).
 * Working from the drawn state keeps sound out of the physics entirely.
 *
 * `perspective`: 'left' when the left slime is you (always, in the campaign);
 * 'neutral' names points without taking sides.
 */
export interface Heard {
  name: SfxName;
  /** 0–1: a harder hit sounds a little fuller. */
  amount: number;
}

interface Frame {
  bodies: [Body, Body];
  ball: Body;
  phase: GameState['phase'];
  lastScorer: GameState['lastScorer'];
}

const copy = (b: Body): Body => ({ x: b.x, y: b.y, vx: b.vx, vy: b.vy, r: b.r });

export function snapshotFrame(g: GameState): Frame {
  return { bodies: [copy(g.player), copy(g.cpu)], ball: copy(g.ball), phase: g.phase, lastScorer: g.lastScorer };
}

/** A sudden change in the ball's motion (more than gravity over a frame or two could do). */
const KNOCK = 2.2;

export function heard(prev: Frame | null, g: GameState, perspective: 'left' | 'neutral' = 'left'): Heard[] {
  if (!prev) return [];
  const out: Heard[] = [];
  const b = g.ball;

  // Jumps: a slime leaving the ground. Yours a bit louder than theirs.
  [g.player, g.cpu].forEach((p, i) => {
    const was = prev.bodies[i];
    if (was.y >= FIELD.GROUND - 0.5 && p.y < FIELD.GROUND - 0.5 && p.vy < 0) {
      out.push({ name: 'jump', amount: i === 0 || perspective === 'neutral' ? 0.6 : 0.3 });
    }
  });

  // The ball: served off the hover, or knocked in play.
  const served = prev.phase === 'serve' && g.phase === 'play';
  const dvx = b.vx - prev.ball.vx;
  const dvy = b.vy - prev.ball.vy;
  const knocked = g.phase === 'play' && prev.phase === 'play' && (Math.abs(dvx) > KNOCK || dvy < -KNOCK);
  if (served || knocked) {
    const netX = FIELD.NET_X;
    const nearBody = [g.player, g.cpu].some((p) => Math.hypot(b.x - p.x, b.y - p.y) < p.r + b.r + 14);
    const speed = Math.min(1, Math.hypot(b.vx, b.vy) / PHYSICS.MAX_BALL_SPEED);
    if (nearBody) out.push({ name: 'hit', amount: speed });
    else if (Math.abs(b.x - netX) < 30 && b.y > FIELD.NET_TOP - 30) out.push({ name: 'net', amount: speed });
    else if (b.x < b.r + 20 || b.x > FIELD.W - b.r - 20) out.push({ name: 'wall', amount: speed });
  }

  // A point.
  if (prev.phase !== 'point' && g.phase === 'point') {
    out.push({
      name: perspective === 'neutral' ? 'point' : g.lastScorer === 0 ? 'pointWin' : 'pointLose',
      amount: 0.5,
    });
  }
  return out;
}

/** Keeps the last frame and hands back what was heard since. */
export class SoundWatch {
  private last: Frame | null = null;

  constructor(private readonly perspective: 'left' | 'neutral' = 'left') {}

  next(g: GameState): Heard[] {
    const found = heard(this.last, g, this.perspective);
    this.last = snapshotFrame(g);
    return found;
  }

  reset() {
    this.last = null;
  }
}
