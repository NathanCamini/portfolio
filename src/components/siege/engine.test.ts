import { describe, expect, it } from 'vitest';
import {
  createTrainer,
  HEAD_R,
  OPENINGS,
  rankFor,
  ROUND_MS,
  shoot,
  startRound,
  targetGeometry,
  update,
  type Target,
} from './engine';

/** A target fully up in opening `i` (born long enough ago to have risen). */
function place(s: ReturnType<typeof createTrainer>, i: number, kind: Target['kind'] = 'enemy') {
  const o = OPENINGS[i];
  const t: Target = { id: 99, opening: i, kind, x: o.x + o.w / 2, born: s.now - 400, life: 5000, hit: false, hitAt: 0 };
  s.targets = [t];
  return targetGeometry(t, s.now);
}

describe('Peek Trainer engine', () => {
  it('scores a headshot 100 and a body shot 50, building a streak multiplier', () => {
    const s = createTrainer();
    startRound(s, 1000);
    s.now = 2000;
    let g = place(s, 0);
    expect(shoot(s, g.head.x, g.head.y)).toBe('head');
    expect(s.score).toBe(100);

    g = place(s, 3);
    expect(shoot(s, g.body.x + g.body.w / 2, g.body.y + 10)).toBe('body');
    expect(s.score).toBe(100 + 55); // streak 1 → ×1.1
    expect(s.streak).toBe(2);
  });

  it('penalises hostages and resets the streak', () => {
    const s = createTrainer();
    startRound(s, 0);
    s.now = 1000;
    s.score = 500;
    s.streak = 4;
    const g = place(s, 4, 'hostage');
    expect(shoot(s, g.head.x, g.head.y)).toBe('hostage');
    expect(s.score).toBe(350);
    expect(s.streak).toBe(0);
  });

  it('a miss on the wall leaves a bullet hole and breaks the streak', () => {
    const s = createTrainer();
    startRound(s, 0);
    s.now = 1000;
    s.streak = 3;
    expect(shoot(s, 20, 20)).toBe('miss');
    expect(s.holes).toHaveLength(1);
    expect(s.streak).toBe(0);
  });

  it('cannot hit what is still hidden below the sill', () => {
    const s = createTrainer();
    startRound(s, 0);
    s.now = 1000;
    const o = OPENINGS[0];
    s.targets = [{ id: 1, opening: 0, kind: 'enemy', x: o.x + 70, born: s.now, life: 1000, hit: false, hitAt: 0 }];
    expect(shoot(s, o.x + 70, o.y + o.h - HEAD_R)).toBe('miss');
  });

  it('spawns targets during the round and ends after 30 s', () => {
    const s = createTrainer();
    startRound(s, 0);
    let seen = 0;
    for (let t = 0; t < ROUND_MS + 100; t += 16) {
      update(s, t, () => 0.5);
      seen = Math.max(seen, s.targets.length);
    }
    expect(seen).toBeGreaterThan(0);
    expect(s.phase).toBe('over');
  });

  it('maps scores to Siege ranks', () => {
    expect(rankFor(0).name).toBe('Copper');
    expect(rankFor(2100).name).toBe('Gold');
    expect(rankFor(9999).name).toBe('Champion');
  });
});
