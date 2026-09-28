import { gameConfig } from '../../../config/game';
import { CPU, type CpuProfile } from './constants';

/**
 * The two ways to play. Campaign: phase 1 (an easy CPU on the beach), then
 * the boss (a bug in production, in a red-alert arena); win a phase to move
 * on, lose it and you play it again. Endless: the original CPU, no limit
 * for the player, over when the CPU reaches its score — the only mode that
 * goes on the leaderboard.
 */
export type StageId = 'easy' | 'boss' | 'endless';
export type Mode = 'campaign' | 'endless';

export interface Stage {
  id: StageId;
  mode: Mode;
  cpu: CpuProfile;
  /** Points that end the match, for [player, cpu]. Infinity: no limit. */
  limits: [number, number];
  theme: 'beach' | 'bug';
}

export const STAGES: Record<StageId, Stage> = {
  easy: {
    id: 'easy',
    mode: 'campaign',
    cpu: CPU.easy,
    limits: [gameConfig.phaseWinScore, gameConfig.phaseWinScore],
    theme: 'beach',
  },
  boss: {
    id: 'boss',
    mode: 'campaign',
    cpu: CPU.boss,
    limits: [gameConfig.phaseWinScore, gameConfig.phaseWinScore],
    theme: 'bug',
  },
  endless: {
    id: 'endless',
    mode: 'endless',
    cpu: CPU.normal,
    limits: [Infinity, gameConfig.endlessCpuScore],
    theme: 'beach',
  },
};

/** Campaign progression: only a win moves on; the boss is the last phase (a win there is a rematch). */
export function nextStage(id: StageId, playerWon: boolean): StageId {
  return id === 'easy' && playerWon ? 'boss' : id;
}
