/**
 * Beach-volley tuning. The court is a fixed 960×540 logical field that the
 * renderer letterboxes into any panel size, so physics never depends on the
 * screen. Speeds/accelerations are expressed per 60 fps frame (the unit the
 * values were tuned in); the fixed-step loop converts real time into frames.
 */
export const FIELD = {
  W: 960,
  H: 540,
  GROUND: 468,
  NET_X: 480,
  NET_TOP: 318,
  NET_W: 8,
  PLAYER_HOME: 220,
  CPU_HOME: 740,
  SERVE_Y: 170,
} as const;

export const PHYSICS = {
  BALL_GRAVITY: 0.34,
  PLAYER_GRAVITY: 0.75,
  PLAYER_SPEED: 7,
  PLAYER_JUMP: -13.5,
  PLAYER_RADIUS: 44,
  BALL_RADIUS: 13,
  /** 1 + restitution for ball ↔ player (0.9) and ball ↔ net (0.75). */
  PLAYER_BOUNCE: 1.9,
  NET_BOUNCE: 1.75,
  WALL_BOUNCE: 0.9,
  /** Every touch sends the ball up at least this fast, so rallies stay playable. */
  MIN_LAUNCH_VY: -6.5,
  MAX_BALL_SPEED: 15,
  /** Share of the player's own velocity transferred to the ball. */
  CARRY: 0.4,
} as const;

export const TIMING = {
  /** Fixed simulation step (s). 120 Hz keeps fast balls from tunnelling through the net. */
  STEP: 1 / 120,
  /** Longest frame we simulate after a stall (tab switch, GC pause). */
  MAX_FRAME: 0.25,
  SERVE_AUTO_DROP_MS: 900,
  POINT_PAUSE_MS: 1200,
} as const;

/** How the CPU plays. Units as above (px and px/frame at 60 fps). */
export interface CpuProfile {
  /** Top walking speed. */
  speed: number;
  /** Jump velocity. */
  jump: number;
  /** Chance per frame of jumping while the ball drops within reach: higher = earlier, harder hits. */
  jumpChance: number;
  /** Where it stands relative to the predicted landing point; + is behind it, pushing the ball over the net. */
  offset: number;
  /** Share of balls it misjudges, standing `misread` px off the right spot for that ball. */
  misreadChance: number;
  misread: number;
  /** Body radius: a bigger opponent reaches more of the court. */
  radius: number;
  /** Extra speed sent towards the player on every touch (0 = plain bounce). */
  spike: number;
}

/**
 * Tuned against a human-like player (engine/bot.ts `HUMAN`: 250 ms reactions)
 * over 500 seeded matches each: it wins ~98% of phase 1, ~60% against the
 * boss, and ~50% against the original CPU.
 */
export const CPU = {
  /** Phase 1: slower and softer, and misjudges one ball in eight. */
  easy: { speed: 4.4, jump: -12, jumpChance: 0.06, offset: 16, misreadChance: 0.12, misread: 70, radius: 44, spike: 0 },
  /** The original opponent, kept exactly as it was: Endless is played against it. */
  normal: { speed: 5.4, jump: -12.5, jumpChance: 0.08, offset: 16, misreadChance: 0, misread: 0, radius: 44, spike: 0 },
  /** Phase 2, the bug: bigger, quick, jumps early and spikes every ball, but glitches on one ball in seven. */
  boss: { speed: 6, jump: -14, jumpChance: 0.15, offset: 22, misreadChance: 0.15, misread: 70, radius: 52, spike: 2 },
} satisfies Record<string, CpuProfile>;
