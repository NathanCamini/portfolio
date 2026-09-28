/**
 * Beach-volley match rules. Kept apart from site.ts because the ranking Worker
 * (worker/) imports it too: the server checks submitted scores against the
 * same win score the game is played to.
 *
 * Changing either value changes what a score means, so start a fresh
 * leaderboard (new D1 database or empty `volley_scores`) when you do.
 */
export const gameConfig = {
  /** CPU top speed. */
  cpuLevel: 'normal' as 'easy' | 'normal' | 'hard',
  winScore: 7,
};
