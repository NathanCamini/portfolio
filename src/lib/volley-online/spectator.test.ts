import { describe, expect, it } from 'vitest';
import { createGame, kickoff } from '../../components/volleyball/engine/physics';
import { takeSnapshot } from './protocol';
import { SnapshotBuffer } from './spectator';

const snap = (tick: number, ballX: number) => {
  const g = createGame('online');
  kickoff(g, 0);
  g.ball.x = ballX;
  return takeSnapshot(g, tick, [0, 0]);
};

describe('SnapshotBuffer (spectators)', () => {
  it('runs one snapshot behind, gliding from the previous to the last', () => {
    const b = new SnapshotBuffer();
    expect(b.view(0)).toBeNull();
    b.push(snap(2, 100), 1000);
    expect(b.view(1000)!.ball.x).toBe(100);
    b.push(snap(4, 120), 1016);
    expect(b.view(1016)!.ball.x).toBe(100); // just arrived: still showing the previous one
    expect(b.view(1024)!.ball.x).toBeCloseTo(110, 5); // halfway
    expect(b.view(1100)!.ball.x).toBe(120); // caught up, and holds there
  });

  it('shows a reset at once instead of sliding across the court, and ignores stale snapshots', () => {
    const b = new SnapshotBuffer();
    b.push(snap(2, 100), 1000);
    b.push(snap(4, 700), 1016);
    expect(b.view(1017)!.ball.x).toBe(700);
    b.push(snap(3, 300), 1020);
    expect(b.view(1100)!.ball.x).toBe(700);
  });
});
