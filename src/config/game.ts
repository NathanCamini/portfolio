/**
 * Beach-volley match rules. Kept apart from site.ts because the ranking Worker
 * (worker/) imports them too: the server checks Endless results against the
 * same limit the game is played to.
 *
 * Changing `endlessCpuScore` changes what a leaderboard score means, so start
 * a fresh leaderboard (empty `volley_endless`) when you do.
 */
export const gameConfig = {
  /** Points that win each campaign phase (phase 1 and the boss). */
  phaseWinScore: 7,
  /** Endless ends when the CPU reaches this; the player has no limit. */
  endlessCpuScore: 7,
};
