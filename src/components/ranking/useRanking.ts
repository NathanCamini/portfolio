'use client';

import { useCallback, useRef, useState } from 'react';
import type { ApiErrorBody, GameId, LeaderboardEntry, SubmitResponse } from '@/lib/ranking/contract';
import { checkNickname, type NameProblem } from '@/lib/ranking/nickname';
import type { GameResults } from '@/lib/ranking/rules';
import { fetchTop, openMatch, submitScore } from './api';

/** Everything the overlay can tell the player went wrong (keys of `RankingStrings.errors`). */
export type RankingError = NameProblem | 'rejected' | 'expired' | 'rateLimited' | 'unavailable';

export type RankingView<R> =
  | { kind: 'closed' }
  /** Opened from the game's Ranking button: any game's board (tabs). `top` is null while loading or on error. */
  | { kind: 'board'; game: GameId; top: LeaderboardEntry[] | null; error: RankingError | null }
  /** A run just ended: ask for a name. */
  | { kind: 'form'; result: R; matchId: string; busy: boolean; error: RankingError | null }
  /** Saved: this game's board with the player's standing. */
  | { kind: 'saved'; result: R; saved: SubmitResponse }
  /** Run over with the ranking unreachable, or a save the server refused for good. */
  | { kind: 'final'; result: R; message: 'offline' | 'rejected' | 'expired' };

/** One name for every game. The old volleyball-only key is still read, so nobody has to type it again. */
const NAME_KEY = 'ranking-name';
const OLD_NAME_KEY = 'volley-ranking-name';

export function rememberedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? localStorage.getItem(OLD_NAME_KEY) ?? '';
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
 * The global ranking flow around one run of `game`: a ticket is requested at
 * kickoff, the name form opens when the run ends, and the save returns the
 * board. Shared by every game; each passes its own result (rules.ts).
 * The name is checked here first for instant feedback; the Worker checks it
 * again, so a tampered client still can't save a banned name.
 */
export function useRanking<G extends GameId>(game: G) {
  type R = GameResults[G];
  const [view, setView] = useState<RankingView<R>>({ kind: 'closed' });
  const ticket = useRef<Promise<string | null> | null>(null);

  const kickoff = useCallback(() => {
    ticket.current = openMatch(game).then((r) => (r.ok ? r.data.matchId : null));
  }, [game]);

  const finish = useCallback((result: R) => {
    const pending = ticket.current ?? Promise.resolve(null);
    ticket.current = null;
    // Every finished run asks for a name, even a 0-point one: the board then shows where it landed.
    void pending.then((matchId) =>
      setView(
        matchId
          ? { kind: 'form', result, matchId, busy: false, error: null }
          : { kind: 'final', result, message: 'offline' },
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
      const res = await submitScore(game, { matchId: view.matchId, name: check.name, result: view.result });
      if (res.ok) {
        rememberName(check.name);
        setView({ kind: 'saved', result: view.result, saved: res.data });
        return res.data;
      }
      const error = toError(res.error);
      if (error === 'rejected' || error === 'expired') {
        setView({ kind: 'final', result: view.result, message: error });
      } else {
        setView({ ...view, busy: false, error });
      }
      return null;
    },
    [game, view],
  );

  /** Any game's board; defaults to this one. */
  const openBoard = useCallback(
    async (which: GameId = game) => {
      setView({ kind: 'board', game: which, top: null, error: null });
      const res = await fetchTop(which);
      setView((v) =>
        v.kind === 'board' && v.game === which
          ? { ...v, top: res.ok ? res.data.top : null, error: res.ok ? null : toError(res.error) }
          : v,
      );
    },
    [game],
  );

  /** The player is editing the name: the last error no longer applies. */
  const clearError = useCallback(() => setView((v) => (v.kind === 'form' && v.error ? { ...v, error: null } : v)), []);

  const close = useCallback(() => setView({ kind: 'closed' }), []);

  return { view, kickoff, finish, save, clearError, openBoard, close };
}
