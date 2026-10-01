import { describe, expect, it } from 'vitest';
import { FIELD, TIMING } from './engine/constants';
import { createGame, primaryAction, stepGame } from './engine/physics';
import type { GameState, Input } from './engine/types';
import { SoundWatch } from './sounds';

const idle: Input = { left: false, right: false, jump: false };

/** A campaign game, ball in play (the CPU is parked in its corner by `listen`, so only the test moves things). */
function game(): GameState {
  const g = createGame('easy');
  primaryAction(g); // title → first serve
  g.phase = 'play';
  return g;
}

/** Steps like the screen does: two physics steps per drawn frame, listening after each frame. */
function listen(g: GameState, frames: number, left: Input = idle, w = new SoundWatch()) {
  const names: string[] = [];
  w.next(g);
  for (let f = 0; f < frames; f++) {
    for (let s = 0; s < 2; s++) {
      stepGame(g, TIMING.STEP, left, () => 0.5);
      Object.assign(g.cpu, { x: FIELD.W - g.cpu.r, y: FIELD.GROUND, vx: 0, vy: 0 });
    }
    names.push(...w.next(g).map((h) => h.name));
  }
  return names;
}

describe('game sounds', () => {
  it('hears a jump', () => {
    const g = game();
    Object.assign(g.ball, { x: 800, y: 100, vx: 0, vy: 0 });
    expect(listen(g, 3, { ...idle, jump: true })).toContain('jump');
  });

  it('hears the ball on a player, and only once per touch', () => {
    const g = game();
    Object.assign(g.ball, { x: g.player.x, y: 280, vx: 0, vy: 3 });
    const names = listen(g, 30);
    expect(names.filter((n) => n === 'hit')).toHaveLength(1);
  });

  it('hears the net', () => {
    const g = game();
    Object.assign(g.ball, { x: FIELD.NET_X - 60, y: FIELD.NET_TOP + 40, vx: 6, vy: 0 });
    expect(listen(g, 20)).toContain('net');
  });

  it('hears a point, for you or against you (and neutral for a spectator)', () => {
    const mine = game();
    Object.assign(mine.ball, { x: 800, y: FIELD.GROUND - 30, vx: 0, vy: 4 }); // lands on the right: your point
    expect(listen(mine, 10)).toContain('pointWin');

    const theirs = game();
    Object.assign(theirs.ball, { x: 120, y: FIELD.GROUND - 30, vx: 0, vy: 4 });
    theirs.player.x = 400;
    expect(listen(theirs, 10)).toContain('pointLose');

    const watched = game();
    Object.assign(watched.ball, { x: 800, y: FIELD.GROUND - 30, vx: 0, vy: 4 });
    expect(listen(watched, 10, idle, new SoundWatch('neutral'))).toContain('point');
  });

  it('stays quiet while the ball just flies', () => {
    const g = game();
    Object.assign(g.ball, { x: 300, y: 60, vx: 2, vy: -2 });
    expect(listen(g, 20)).toEqual([]);
  });
});
