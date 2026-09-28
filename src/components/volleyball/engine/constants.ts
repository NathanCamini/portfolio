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
  CPU_JUMP: -12.5,
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

export const CPU_SPEED = { easy: 4.2, normal: 5.4, hard: 6.6 } as const;
export type CpuLevel = keyof typeof CPU_SPEED;
