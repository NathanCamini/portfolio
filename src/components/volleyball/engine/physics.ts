import { updateCpu } from './ai';
import { FIELD, PHYSICS, TIMING } from './constants';
import { nextStage, STAGES, type StageKey } from './stages';
import type { Body, GameState, Input, Side } from './types';

export function createGame(stage: StageKey, rng: () => number = Math.random): GameState {
  const { GROUND, PLAYER_HOME, CPU_HOME, SERVE_Y, W } = FIELD;
  const g: GameState = {
    player: { x: PLAYER_HOME, y: GROUND, vx: 0, vy: 0, r: PHYSICS.PLAYER_RADIUS },
    cpu: { x: CPU_HOME, y: GROUND, vx: 0, vy: 0, r: PHYSICS.PLAYER_RADIUS },
    ball: { x: PLAYER_HOME, y: SERVE_Y, vx: 0, vy: 0, r: PHYSICS.BALL_RADIUS },
    score: [0, 0],
    phase: 'title',
    phaseTime: 0,
    clock: 0,
    matchTime: 0,
    server: 0,
    lastScorer: null,
    stage: STAGES[stage],
    ballSide: 0,
    cpuMiss: 0,
    stars: Array.from({ length: 40 }, () => [rng() * W, rng() * 300, rng() * 1.4 + 0.4] as [number, number, number]),
  };
  setStage(g, stage);
  return g;
}

/** Switches to another stage's title screen (mode change, or the next campaign phase). */
export function setStage(g: GameState, id: StageKey) {
  g.stage = STAGES[id];
  g.cpu.r = g.stage.cpu.radius;
  Object.assign(g.player, { x: FIELD.PLAYER_HOME, y: FIELD.GROUND, vx: 0, vy: 0 });
  Object.assign(g.cpu, { x: FIELD.CPU_HOME, y: FIELD.GROUND, vx: 0, vy: 0 });
  Object.assign(g.ball, { x: FIELD.PLAYER_HOME, y: FIELD.SERVE_Y, vx: 0, vy: 0 });
  g.score = [0, 0];
  g.matchTime = 0;
  g.lastScorer = null;
  g.phase = 'title';
  g.phaseTime = 0;
}

/** The player reached their limit (never happens in Endless, which has none). */
export const playerWon = (g: GameState) => g.score[0] >= g.stage.limits[0];

/**
 * Click / space / "jump" button. On the title screen it starts the match; on
 * the game-over screen it either moves to the next campaign phase's title
 * (after winning phase 1) or starts the same stage again.
 */
export function primaryAction(g: GameState) {
  if (g.phase === 'over') {
    const next = nextStage(g.stage.id, playerWon(g));
    if (next !== g.stage.id) return setStage(g, next);
  }
  if (g.phase === 'title' || g.phase === 'over') kickoff(g, 0);
}

/** Starts a match from 0–0, `side` serving. The online server calls it directly (it picks who serves). */
export function kickoff(g: GameState, side: Side) {
  g.score = [0, 0];
  g.matchTime = 0;
  g.lastScorer = null;
  serve(g, side);
}

function serve(g: GameState, side: Side) {
  g.server = side;
  Object.assign(g.ball, { x: side ? FIELD.CPU_HOME : FIELD.PLAYER_HOME, y: FIELD.SERVE_Y, vx: 0, vy: 0 });
  Object.assign(g.player, { x: FIELD.PLAYER_HOME, vx: 0 });
  Object.assign(g.cpu, { x: FIELD.CPU_HOME, vx: 0 });
  g.phase = 'serve';
  g.phaseTime = 0;
}

function movePlayer(p: Body, f: number, minX: number, maxX: number) {
  p.x = Math.max(minX, Math.min(maxX, p.x + p.vx * f));
  p.vy += PHYSICS.PLAYER_GRAVITY * f;
  p.y += p.vy * f;
  if (p.y > FIELD.GROUND) {
    p.y = FIELD.GROUND;
    p.vy = 0;
  }
}

/**
 * Ball vs. player. Players are half-discs (slime style), so only contacts on
 * the upper half count. Resolves penetration, reflects the relative velocity
 * along the contact normal, adds some of the player's own motion and
 * guarantees an upward launch.
 */
function collidePlayer(b: Body, p: Body): boolean {
  const dx = b.x - p.x;
  const dy = b.y - p.y;
  const d = Math.hypot(dx, dy);
  const min = p.r + b.r;
  if (d >= min || d === 0 || dy > b.r * 0.6) return false;

  const nx = dx / d;
  const ny = dy / d;
  b.x = p.x + nx * min;
  b.y = p.y + ny * min;

  const vn = (b.vx - p.vx) * nx + (b.vy - p.vy) * ny;
  if (vn < 0) {
    b.vx -= PHYSICS.PLAYER_BOUNCE * vn * nx;
    b.vy -= PHYSICS.PLAYER_BOUNCE * vn * ny;
  }
  b.vx += p.vx * PHYSICS.CARRY;
  b.vy += Math.min(p.vy, 0) * PHYSICS.CARRY;
  b.vy = Math.min(b.vy, PHYSICS.MIN_LAUNCH_VY);

  const speed = Math.hypot(b.vx, b.vy);
  if (speed > PHYSICS.MAX_BALL_SPEED) {
    b.vx *= PHYSICS.MAX_BALL_SPEED / speed;
    b.vy *= PHYSICS.MAX_BALL_SPEED / speed;
  }
  return true;
}

/** The boss's touch: the ball leaves faster, towards the player's side. */
function spike(b: Body, extra: number) {
  b.vx -= extra;
  const speed = Math.hypot(b.vx, b.vy);
  if (speed > PHYSICS.MAX_BALL_SPEED) {
    b.vx *= PHYSICS.MAX_BALL_SPEED / speed;
    b.vy *= PHYSICS.MAX_BALL_SPEED / speed;
  }
}

/** Ball vs. net (axis-aligned rectangle): closest-point test, then reflect. */
function collideNet(b: Body) {
  const { NET_X, NET_W, NET_TOP, GROUND } = FIELD;
  const cx = Math.max(NET_X - NET_W / 2, Math.min(NET_X + NET_W / 2, b.x));
  const cy = Math.max(NET_TOP, Math.min(GROUND, b.y));
  const dx = b.x - cx;
  const dy = b.y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 >= b.r * b.r) return;

  const d = Math.sqrt(d2) || 0.01;
  // Centre inside the rectangle: push out horizontally towards the side it came from.
  const nx = d2 ? dx / d : b.x < NET_X ? -1 : 1;
  const ny = d2 ? dy / d : 0;
  b.x = cx + nx * b.r;
  b.y = cy + ny * b.r;
  const vn = b.vx * nx + b.vy * ny;
  if (vn < 0) {
    b.vx -= PHYSICS.NET_BOUNCE * vn * nx;
    b.vy -= PHYSICS.NET_BOUNCE * vn * ny;
  }
}

/** Walking and jumping from held keys; `left`/`right` are world directions (−x / +x). */
function drive(p: Body, input: Input, g: GameState) {
  p.vx = ((input.right ? 1 : 0) - (input.left ? 1 : 0)) * PHYSICS.PLAYER_SPEED;
  if (input.jump && p.y >= FIELD.GROUND && g.phase !== 'title' && g.phase !== 'over') p.vy = PHYSICS.PLAYER_JUMP;
}

/**
 * Advances the simulation by `dt` seconds of real time (one fixed step).
 * `f` = the same step expressed in 60 fps frames, the unit all constants use.
 *
 * `input` drives the left player. The right one is the CPU, unless `opponent`
 * is given: then a second person drives it (online, docs/volei-online.md) and
 * the simulation uses no randomness at all, so a client replaying the same
 * inputs reaches the same state as the server.
 */
export function stepGame(g: GameState, dt: number, input: Input, rng: () => number = Math.random, opponent?: Input) {
  const f = dt * 60;
  const ms = dt * 1000;
  const { player: p, cpu: c, ball: b } = g;
  const { NET_X, NET_W, W, GROUND, SERVE_Y } = FIELD;
  g.clock += f;
  if (g.phase !== 'title' && g.phase !== 'over') g.matchTime += ms;

  drive(p, input, g);
  if (opponent) drive(c, opponent, g);
  else updateCpu(g, f, rng);
  movePlayer(p, f, p.r, NET_X - NET_W / 2 - p.r);
  movePlayer(c, f, NET_X + NET_W / 2 + c.r, W - c.r);

  if (g.phase === 'serve') {
    // Ball hovers until someone touches it (or it drops by itself).
    g.phaseTime += ms;
    b.y = SERVE_Y + Math.sin(g.phaseTime / 160) * 5;
    if (collidePlayer(b, p) || collidePlayer(b, c) || g.phaseTime > TIMING.SERVE_AUTO_DROP_MS) {
      g.phase = 'play';
    }
    return;
  }

  if (g.phase === 'point') {
    g.phaseTime += ms;
    if (g.phaseTime > TIMING.POINT_PAUSE_MS) {
      if (g.score[0] >= g.stage.limits[0] || g.score[1] >= g.stage.limits[1]) g.phase = 'over';
      else serve(g, g.server);
    }
    return;
  }

  if (g.phase !== 'play') return;

  b.vy += PHYSICS.BALL_GRAVITY * f;
  b.x += b.vx * f;
  b.y += b.vy * f;
  if (b.x < b.r) {
    b.x = b.r;
    b.vx = Math.abs(b.vx) * PHYSICS.WALL_BOUNCE;
  }
  if (b.x > W - b.r) {
    b.x = W - b.r;
    b.vx = -Math.abs(b.vx) * PHYSICS.WALL_BOUNCE;
  }
  collideNet(b);
  collidePlayer(b, p);
  if (collidePlayer(b, c) && g.stage.cpu.spike) spike(b, g.stage.cpu.spike);

  // Ball touched the sand: the side it landed on loses the rally.
  if (b.y + b.r >= GROUND) {
    b.y = GROUND - b.r;
    const scorer: Side = b.x < NET_X ? 1 : 0;
    g.score[scorer]++;
    g.server = scorer;
    g.lastScorer = scorer;
    g.phase = 'point';
    g.phaseTime = 0;
  }
}
