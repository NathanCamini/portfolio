import { FIELD, PHYSICS } from './constants';
import type { GameState } from './types';

/**
 * CPU opponent: predicts where the ball will come down by integrating its
 * ballistic path (with wall bounces), walks there with a capped speed, and
 * jumps with a small per-frame probability when the ball drops within reach —
 * reactive enough to rally, imperfect enough to be beaten.
 */
export function updateCpu(g: GameState, f: number, rng: () => number) {
  const { ball: b, cpu: c } = g;
  let target: number = FIELD.CPU_HOME;

  if (g.phase === 'play') {
    let { x, y, vx, vy } = b;
    for (let i = 0; i < 160 && y < FIELD.GROUND - 60; i++) {
      vy += PHYSICS.BALL_GRAVITY;
      x += vx;
      y += vy;
      if (x < b.r || x > FIELD.W - b.r) vx = -vx;
    }
    // Stand slightly behind the landing point so the hit pushes the ball over the net.
    if (x > FIELD.NET_X) target = x + 16;
  } else if (g.phase === 'serve' && g.server === 1) {
    target = b.x + 14;
  }

  const diff = target - c.x;
  c.vx = Math.abs(diff) < 4 ? 0 : Math.sign(diff) * Math.min(g.cpuSpeed, Math.abs(diff) * 0.3);

  const reachable = b.x > FIELD.NET_X && Math.abs(b.x - c.x) < 70 && b.y > 250 && b.y < FIELD.GROUND - 40 && b.vy > 0;
  if (reachable && c.y >= FIELD.GROUND && rng() < 0.08 * f) c.vy = PHYSICS.CPU_JUMP;
}
