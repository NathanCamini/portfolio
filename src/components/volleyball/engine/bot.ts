import { FIELD, PHYSICS } from './constants';
import type { GameState, Input } from './types';

/**
 * A stand-in human for tests: the original CPU's strategy mirrored onto the
 * player's side, driven through the same keyboard input a person uses.
 * Against the `normal` CPU it is an even match, which makes it a yardstick
 * for how much easier or harder the other profiles are.
 */
export function botInput(g: GameState, f: number, rng: () => number): Input {
  const { ball: b, player: p } = g;
  let target: number = FIELD.PLAYER_HOME;

  if (g.phase === 'play') {
    let { x, y, vx, vy } = b;
    for (let i = 0; i < 160 && y < FIELD.GROUND - 60; i++) {
      vy += PHYSICS.BALL_GRAVITY;
      x += vx;
      y += vy;
      if (x < b.r || x > FIELD.W - b.r) vx = -vx;
    }
    if (x < FIELD.NET_X) target = x - 16;
  } else if (g.phase === 'serve' && g.server === 0) {
    target = b.x - 14;
  }

  const diff = target - p.x;
  const reachable = b.x < FIELD.NET_X && Math.abs(b.x - p.x) < 70 && b.y > 250 && b.y < FIELD.GROUND - 40 && b.vy > 0;
  return {
    left: diff < -PHYSICS.PLAYER_SPEED * f,
    right: diff > PHYSICS.PLAYER_SPEED * f,
    jump: reachable && rng() < 0.08 * f,
  };
}
