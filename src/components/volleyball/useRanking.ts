'use client';

import { useCallback, useRef, useState } from 'react';
import { fetchTop, openMatch, submitScore } from './ranking/api';
import {
  scoreMatch,
  type ApiErrorBody,
  type LeaderboardEntry,
  type MatchResult,
  type SubmitResponse,
} from './ranking/match';
import { checkNickname, type NameProblem } from './ranking/nickname';

/** Everything the overlay can tell the player went wrong (keys of `RankingStrings.errors`). */
export type RankingError = NameProblem | 'rejected' | 'expired' | 'rateLimited' | 'unavailable';

export type RankingView =
  | { kind: 'closed' }
  /** Opened from the toolbar. `top` is null while loading or on error. */
  | { kind: 'board'; top: LeaderboardEntry[] | null; error: RankingError | null }
  /** Final whistle: ask for a name. */
  | { kind: 'form'; result: MatchResult; score: number; matchId: string; busy: boolean; error: RankingError | null }
  /** Saved: the board with the player's standing. */
  | { kind: 'saved'; result: MatchResult; saved: SubmitResponse }
  /** Final whistle with the ranking unreachable, or a save the server refused for good. */
  | { kind: 'final'; result: MatchResult; score: number; message: 'offline' | 'rejected' | 'expired' };

const NAME_KEY = 'volley-ranking-name';

export function rememberedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

function rememberName(name: string) {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    /* private mode: they'll type it again next time */
  }
}

function toError({ error, reason }: ApiErrorBody): RankingError {
  switch (error) {
    case 'invalid_name':
      return reason ?? 'offensive';
    case 'invalid_result':
    case 'too_fast':
      return 'rejected';
    case 'match_not_found':
    case 'match_expired':
      return 'expired';
    case 'rate_limited':
      return 'rateLimited';
    default:
      return 'unavailable';
  }
}

/**
 * Global leaderboard flow around a match: a ticket is requested at kickoff,
 * the name form opens at the final whistle, and the save returns the board.
 * The name is checked here first for instant feedback; the Worker checks it
 * again, so a tampered client still can't save a banned name.
 */
export function useRanking() {
  const [view, setView] = useState<RankingView>({ kind: 'closed' });
  const ticket = useRef<Promise<string | null> | null>(null);

  const kickoff = useCallback(() => {
    ticket.current = openMatch().then((r) => (r.ok ? r.data.matchId : null));
  }, []);

  const finish = useCallback((result: MatchResult) => {
    const score = scoreMatch(result);
    const pending = ticket.current ?? Promise.resolve(null);
    ticket.current = null;
    // Every finished match asks for a name, even a 0-point loss: the board then shows where it landed.
    void pending.then((matchId) =>
      setView(
        matchId
          ? { kind: 'form', result, score, matchId, busy: false, error: null }
          : { kind: 'final', result, score, message: 'offline' },
      ),
    );
  }, []);

  const save = useCallback(
    async (raw: string): Promise<SubmitResponse | null> => {
      if (view.kind !== 'form' || view.busy) return null;
      const check = checkNickname(raw);
      if (!check.ok) {
        setView({ ...view, error: check.reason });
        return null;
      }
      setView({ ...view, busy: true, error: null });
      const res = await submitScore({ matchId: view.matchId, name: check.name, ...view.result });
      if (res.ok) {
        rememberName(check.name);
        setView({ kind: 'saved', result: view.result, saved: res.data });
        return res.data;
      }
      const error = toError(res.error);
      if (error === 'rejected' || error === 'expired') {
        setView({ kind: 'final', result: view.result, score: view.score, message: error });
      } else {
        setView({ ...view, busy: false, error });
      }
      return null;
    },
    [view],
  );

  const openBoard = useCallback(async () => {
    setView({ kind: 'board', top: null, error: null });
    const res = await fetchTop();
    setView((v) =>
      v.kind === 'board'
        ? { kind: 'board', top: res.ok ? res.data.top : null, error: res.ok ? null : toError(res.error) }
        : v,
    );
  }, []);

  /** The player is editing the name: the last error no longer applies. */
  const clearError = useCallback(() => setView((v) => (v.kind === 'form' && v.error ? { ...v, error: null } : v)), []);

  const close = useCallback(() => setView({ kind: 'closed' }), []);

  return { view, kickoff, finish, save, clearError, openBoard, close };
}
