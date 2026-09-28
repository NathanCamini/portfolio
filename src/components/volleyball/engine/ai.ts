import { FIELD, PHYSICS } from './constants';
import type { GameState } from './types';

/**
 * CPU opponent: predicts where the ball will come down by integrating its
 * ballistic path (with wall bounces), walks there with a capped speed, and
 * jumps with a per-frame probability when the ball drops within reach. The
 * stage's profile sets how fast, how early and how often it misjudges a ball.
 */
export function updateCpu(g: GameState, f: number, rng: () => number) {
  const { ball: b, cpu: c } = g;
  const P = g.stage.cpu;

  // Each new ball coming over: decide whether this one gets misjudged (and to which side).
  const side = b.x > FIELD.NET_X ? 1 : 0;
  if (side !== g.ballSide) {
    g.ballSide = side;
    if (side === 1 && P.misreadChance > 0) {
      g.cpuMiss = rng() < P.misreadChance ? (rng() < 0.5 ? -1 : 1) * P.misread : 0;
    }
  }

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
    if (x > FIELD.NET_X) target = x + P.offset + g.cpuMiss;
  } else if (g.phase === 'serve' && g.server === 1) {
    target = b.x + 14;
  }

  const diff = target - c.x;
  c.vx = Math.abs(diff) < 4 ? 0 : Math.sign(diff) * Math.min(P.speed, Math.abs(diff) * 0.3);

  const reach = 70 + (c.r - PHYSICS.PLAYER_RADIUS);
  const reachable =
    b.x > FIELD.NET_X && Math.abs(b.x - c.x) < reach && b.y > 250 && b.y < FIELD.GROUND - 40 && b.vy > 0;
  if (reachable && c.y >= FIELD.GROUND && rng() < P.jumpChance * f) c.vy = P.jump;
}
