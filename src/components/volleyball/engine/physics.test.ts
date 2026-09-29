import { describe, expect, it } from 'vitest';
import { HUMAN, playerBot } from './bot';
import { CPU, FIELD, TIMING } from './constants';
import { createGame, primaryAction, stepGame } from './physics';
import { nextStage } from './stages';
import type { GameState, Input } from './types';

const idle: Input = { left: false, right: false, jump: false };
const seeded =
  (seed = 1) =>
  () =>
    ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

function play(g: GameState, seconds: number, input: Input = idle, rng = seeded()) {
  for (let t = 0; t < seconds; t += TIMING.STEP) stepGame(g, TIMING.STEP, input, rng);
}

/** Ends the current match as if the rally had just been decided with this score. */
function finish(g: GameState, score: [number, number]) {
  Object.assign(g, { score, phase: 'point', phaseTime: TIMING.POINT_PAUSE_MS, lastScorer: 0 });
  stepGame(g, TIMING.STEP, idle, seeded());
  expect(g.phase).toBe('over');
}

describe('beach volleyball engine', () => {
  it('starts on the title screen and serves on the primary action', () => {
    const g = createGame('easy', seeded());
    expect(g.phase).toBe('title');
    primaryAction(g);
    expect(g.phase).toBe('serve');
    expect(g.ball.x).toBe(FIELD.PLAYER_HOME);
  });

  it('drops the serve after the timeout and the rally goes live', () => {
    const g = createGame('easy', seeded());
    primaryAction(g);
    // Move the player away so they don't touch the hovering ball.
    play(g, 0.5, { ...idle, left: true });
    expect(g.phase).toBe('serve');
    play(g, 0.6, { ...idle, left: true });
    expect(g.phase).toBe('play');
  });

  it('awards the point to the CPU when the ball lands on the player side', () => {
    const g = createGame('easy', seeded());
    primaryAction(g);
    play(g, 3, { ...idle, left: true }); // player hides in the corner, ball drops on their side
    expect(g.score).toEqual([0, 1]);
    expect(g.lastScorer).toBe(1);
    expect(g.server).toBe(1);
  });

  it('keeps the players on their own side of the net, the bigger boss included', () => {
    const g = createGame('boss', seeded());
    primaryAction(g);
    play(g, 5, { ...idle, right: true });
    expect(g.cpu.r).toBe(CPU.boss.radius);
    expect(g.player.x + g.player.r).toBeLessThanOrEqual(FIELD.NET_X - FIELD.NET_W / 2 + 1e-9);
    expect(g.cpu.x - g.cpu.r).toBeGreaterThanOrEqual(FIELD.NET_X + FIELD.NET_W / 2 - 1e-9);
  });

  it('ends a campaign match when either side reaches 7', () => {
    const g = createGame('easy', seeded());
    primaryAction(g);
    play(g, 60, { ...idle, left: true });
    expect(g.phase).toBe('over');
    expect(g.score[1]).toBe(7);
    expect(g.score[0]).toBeLessThan(7); // phase 1's CPU botches a few of its own balls
  });

  it('is deterministic for the same inputs (fixed timestep + seeded AI)', () => {
    const a = createGame('easy', seeded(7));
    const b = createGame('easy', seeded(7));
    primaryAction(a);
    primaryAction(b);
    play(a, 4, { ...idle, right: true }, seeded(3));
    play(b, 4, { ...idle, right: true }, seeded(3));
    expect(a.ball).toEqual(b.ball);
    expect(a.score).toEqual(b.score);
  });
});

describe('campaign', () => {
  it('only a win in phase 1 leads to the boss; losing replays the same phase', () => {
    const g = createGame('easy', seeded());
    primaryAction(g);
    finish(g, [5, 7]);
    primaryAction(g);
    expect([g.stage.id, g.phase]).toEqual(['easy', 'serve']);

    finish(g, [7, 5]);
    primaryAction(g); // to the boss's title screen, not straight into a match
    expect([g.stage.id, g.phase]).toEqual(['boss', 'title']);
    expect(g.stage.theme).toBe('bug');

    primaryAction(g);
    finish(g, [2, 7]);
    primaryAction(g);
    expect([g.stage.id, g.phase]).toEqual(['boss', 'serve']);
  });

  it('beating the boss ends the campaign on a rematch', () => {
    expect(nextStage('boss', true)).toBe('boss');
    expect(nextStage('boss', false)).toBe('boss');
  });
});

describe('difficulty', () => {
  // A human-like player (250 ms reactions) against a CPU profile, over seeded first-to-7 matches.
  function winRate(profile: keyof typeof CPU, matches: number) {
    let won = 0;
    for (let i = 0; i < matches; i++) {
      const g = createGame('easy', seeded(i + 1));
      g.stage = { ...g.stage, cpu: CPU[profile], limits: [7, 7] };
      g.cpu.r = CPU[profile].radius;
      primaryAction(g);
      const rng = seeded(1000 + i);
      const bot = playerBot(HUMAN, seeded(5000 + i));
      for (let t = 0; g.phase !== 'over' && t < 1800; t += TIMING.STEP) {
        stepGame(g, TIMING.STEP, bot(g, TIMING.STEP * 60), rng);
      }
      if (g.score[0] > g.score[1]) won++;
    }
    return won / matches;
  }

  // Tuned over 500 matches each to ~98% (phase 1) and ~60% (boss); a smaller sample keeps the test quick.
  it('a typical player almost always clears phase 1 and beats the boss more often than not', () => {
    const easy = winRate('easy', 30);
    const boss = winRate('boss', 30);
    expect(easy).toBeGreaterThanOrEqual(0.9);
    expect(boss).toBeGreaterThan(0.35);
    expect(boss).toBeLessThan(0.85);
    expect(boss).toBeLessThan(easy);
  }, 30_000);
});
