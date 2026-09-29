import { HUMAN, playerBot, type BotSkill } from '../../components/volleyball/engine/bot';
import { TIMING } from '../../components/volleyball/engine/constants';
import type { GameState, Side } from '../../components/volleyball/engine/types';
import { mirrorState } from './predictor';
import { mirrorBits, packInput } from './protocol';

/** Deterministic [0, 1) generator for tests (Park–Miller). */
export const seeded =
  (seed = 1) =>
  () =>
    ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

/**
 * A bot for either side of an online match: it plays from the left like a
 * person does (the right-hand player sees the court mirrored) and returns
 * world-direction keys, like the browser sends.
 */
export function sideBot(side: Side, rng: () => number, skill: BotSkill = HUMAN) {
  const bot = playerBot(skill, rng);
  // `f`: one physics step expressed in 60 fps frames (0.5), the unit the bot reasons in.
  return (g: GameState, f = TIMING.STEP * 60): number => {
    const bits = packInput(bot(side === 0 ? g : mirrorState(g), f));
    return side === 0 ? bits : mirrorBits(bits);
  };
}
