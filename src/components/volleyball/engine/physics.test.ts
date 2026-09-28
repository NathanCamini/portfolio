import { describe, expect, it } from 'vitest';
import { CPU_SPEED, FIELD, TIMING } from './constants';
import { createGame, primaryAction, stepGame } from './physics';
import type { Input } from './types';

const idle: Input = { left: false, right: false, jump: false };
const seeded =
  (seed = 1) =>
  () =>
    ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

function play(g: ReturnType<typeof createGame>, seconds: number, input: Input = idle, rng = seeded()) {
  for (let t = 0; t < seconds; t += TIMING.STEP) stepGame(g, TIMING.STEP, input, rng);
}

describe('beach volleyball engine', () => {
  it('starts on the title screen and serves on the primary action', () => {
    const g = createGame(CPU_SPEED.normal, 7, seeded());
    expect(g.phase).toBe('title');
    primaryAction(g);
    expect(g.phase).toBe('serve');
    expect(g.ball.x).toBe(FIELD.PLAYER_HOME);
  });

  it('drops the serve after the timeout and the rally goes live', () => {
    const g = createGame(CPU_SPEED.normal, 7, seeded());
    primaryAction(g);
    // Move the player away so they don't touch the hovering ball.
    play(g, 0.5, { ...idle, left: true });
    expect(g.phase).toBe('serve');
    play(g, 0.6, { ...idle, left: true });
    expect(g.phase).toBe('play');
  });

  it('awards the point to the CPU when the ball lands on the player side', () => {
    const g = createGame(CPU_SPEED.normal, 7, seeded());
    primaryAction(g);
    play(g, 3, { ...idle, left: true }); // player hides in the corner, ball drops on their side
    expect(g.score).toEqual([0, 1]);
    expect(g.lastScorer).toBe(1);
    expect(g.server).toBe(1);
  });

  it('keeps the players on their own side of the net', () => {
    const g = createGame(CPU_SPEED.hard, 7, seeded());
    primaryAction(g);
    play(g, 5, { ...idle, right: true });
    expect(g.player.x + g.player.r).toBeLessThanOrEqual(FIELD.NET_X - FIELD.NET_W / 2 + 1e-9);
    expect(g.cpu.x - g.cpu.r).toBeGreaterThanOrEqual(FIELD.NET_X + FIELD.NET_W / 2 - 1e-9);
  });

  it('ends the match at the win score', () => {
    const g = createGame(CPU_SPEED.normal, 2, seeded());
    primaryAction(g);
    play(g, 12, { ...idle, left: true });
    expect(g.phase).toBe('over');
    expect(g.score[1]).toBe(2);
  });

  it('is deterministic for the same inputs (fixed timestep + seeded AI)', () => {
    const a = createGame(CPU_SPEED.normal, 7, seeded(7));
    const b = createGame(CPU_SPEED.normal, 7, seeded(7));
    primaryAction(a);
    primaryAction(b);
    play(a, 4, { ...idle, right: true }, seeded(3));
    play(b, 4, { ...idle, right: true }, seeded(3));
    expect(a.ball).toEqual(b.ball);
    expect(a.score).toEqual(b.score);
  });
});
