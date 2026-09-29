import { describe, expect, it } from 'vitest';
import { ELO, expected, rate } from './elo';

const settled = (rating: number) => ({ rating, games: ELO.PROVISIONAL });

describe('Elo', () => {
  it('gives even odds to equal ratings and ~10:1 across 400 points', () => {
    expect(expected(1000, 1000)).toBe(0.5);
    expect(expected(1400, 1000)).toBeCloseTo(10 / 11, 5);
    expect(expected(1000, 1400) + expected(1400, 1000)).toBeCloseTo(1, 10);
  });

  it('moves K/2 between equals, and the same points in and out once settled', () => {
    const [a, b] = rate([settled(1000), settled(1000)], 0);
    expect(a).toEqual({ before: 1000, after: 1016 });
    expect(b).toEqual({ before: 1000, after: 984 });
  });

  it('pays more for an upset than for beating someone weaker', () => {
    const upset = rate([settled(1000), settled(1300)], 0)[0];
    const expectedWin = rate([settled(1300), settled(1000)], 0)[0];
    expect(upset.after - upset.before).toBeGreaterThan(20);
    expect(expectedWin.after - expectedWin.before).toBeLessThan(10);
  });

  it('moves newcomers faster, always gives the winner a point, and has a floor', () => {
    const [fresh] = rate([{ rating: 1000, games: 0 }, settled(1000)], 0);
    expect(fresh.after - fresh.before).toBe(ELO.K_NEW / 2);
    const [giant] = rate([settled(3000), settled(100)], 0);
    expect(giant.after).toBe(3001);
    const [, bottom] = rate([settled(3000), settled(ELO.FLOOR)], 0);
    expect(bottom.after).toBe(ELO.FLOOR);
  });

  it('works whichever side wins', () => {
    const [a, b] = rate([settled(1000), settled(1000)], 1);
    expect(a.after).toBe(984);
    expect(b.after).toBe(1016);
  });
});
