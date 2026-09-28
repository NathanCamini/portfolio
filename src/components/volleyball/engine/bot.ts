import { FIELD, PHYSICS } from './constants';
import type { GameState, Input } from './types';

/**
 * Stand-in players for tests and tuning: the original CPU's strategy mirrored
 * onto the player's side, driven through the same keyboard input a person
 * uses — with human limits on top.
 */
export interface BotSkill {
  /** How often it re-reads the ball and picks a new spot (a person's reaction time). */
  reactionMs: number;
  /** Error in the landing guess, per frame the ball still has to fly (px): far balls are misjudged more. */
  aimNoise: number;
}

/** No limits: re-reads every step, exact landing spot. */
export const PERFECT: BotSkill = { reactionMs: 0, aimNoise: 0 };

/**
 * A typical player: re-reads the ball every quarter second (average visual
 * reaction time) and misjudges a ball in flight for a second by ~20 px.
 * Against the original CPU (Endless) it wins about half of its matches.
 */
export const HUMAN: BotSkill = { reactionMs: 250, aimNoise: 0.3 };

/** Landing spot of the ball (with wall bounces) and how many frames until it gets there. */
function landing(g: GameState) {
  const b = g.ball;
  let { x, y, vx, vy } = b;
  let frames = 0;
  for (; frames < 160 && y < FIELD.GROUND - 60; frames++) {
    vy += PHYSICS.BALL_GRAVITY;
    x += vx;
    y += vy;
    if (x < b.r || x > FIELD.W - b.r) vx = -vx;
  }
  return { x, frames };
}

/** Standard normal sample (Box–Muller). */
const gauss = (rng: () => number) => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());

/** A player with the given skill. Keeps its own plan between steps, so use one per match. */
export function playerBot(skill: BotSkill, rng: () => number) {
  let target: number = FIELD.PLAYER_HOME;
  let nextRead = -Infinity;

  return (g: GameState, f: number): Input => {
    const { ball: b, player: p } = g;
    if (g.matchTime >= nextRead) {
      nextRead = g.matchTime + skill.reactionMs;
      target = FIELD.PLAYER_HOME;
      if (g.phase === 'play') {
        const land = landing(g);
        const miss = skill.aimNoise ? gauss(rng) * skill.aimNoise * land.frames : 0;
        if (land.x < FIELD.NET_X) target = land.x - 16 + miss;
      } else if (g.phase === 'serve' && g.server === 0) {
        target = b.x - 14;
      }
    }

    const diff = target - p.x;
    const reachable = b.x < FIELD.NET_X && Math.abs(b.x - p.x) < 70 && b.y > 250 && b.y < FIELD.GROUND - 40 && b.vy > 0;
    return {
      left: diff < -PHYSICS.PLAYER_SPEED * f,
      right: diff > PHYSICS.PLAYER_SPEED * f,
      jump: reachable && rng() < 0.08 * f,
    };
  };
}
