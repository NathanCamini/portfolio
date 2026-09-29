import { gameConfig } from '../../../config/game';
import { CPU, type CpuProfile } from './constants';

/**
 * The campaign: phase 1 (an easy CPU on the beach), then the boss (a bug in
 * production, in a red-alert arena); win a phase to move on, lose it and you
 * play it again. Endless, online 1×1 and the rankings live in the full game
 * (NathanCamini/volleyball_game), linked from the section.
 */
export type StageId = 'easy' | 'boss';

export interface Stage {
  id: StageId;
  cpu: CpuProfile;
  /** Points that end the match, for [player, cpu]. */
  limits: [number, number];
  theme: 'beach' | 'bug';
}

export const STAGES: Record<StageId, Stage> = {
  easy: {
    id: 'easy',
    cpu: CPU.easy,
    limits: [gameConfig.phaseWinScore, gameConfig.phaseWinScore],
    theme: 'beach',
  },
  boss: {
    id: 'boss',
    cpu: CPU.boss,
    limits: [gameConfig.phaseWinScore, gameConfig.phaseWinScore],
    theme: 'bug',
  },
};

/** Campaign progression: only a win moves on; the boss is the last phase (a win there is a rematch). */
export function nextStage(id: StageId, playerWon: boolean): StageId {
  return id === 'easy' && playerWon ? 'boss' : id;
}
