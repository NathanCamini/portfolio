import type { Stage } from './stages';

/** title → serve → play → point → (serve | over) → serve … */
export type Phase = 'title' | 'serve' | 'play' | 'point' | 'over';

export type Side = 0 | 1; // 0 = player (left), 1 = CPU (right)

export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

export interface Input {
  left: boolean;
  right: boolean;
  jump: boolean;
}

export interface GameState {
  player: Body;
  cpu: Body;
  ball: Body;
  score: [number, number];
  phase: Phase;
  /** ms spent in the current phase */
  phaseTime: number;
  /** frames since start — drives idle animations (stars, waves, ball spin) */
  clock: number;
  /** ms of play since the first serve of the current match (stops at the final whistle) */
  matchTime: number;
  server: Side;
  lastScorer: Side | null;
  /** Current stage: CPU profile, score limits, arena theme. */
  stage: Stage;
  /** Side of the net the ball is on (0 = player), to notice each new ball coming to the CPU. */
  ballSide: Side;
  /** How far off the CPU stands for the current ball (0 = reads it right). */
  cpuMiss: number;
  stars: [x: number, y: number, r: number][];
}
