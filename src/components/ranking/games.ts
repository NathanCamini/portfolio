import { rankFor } from '@/components/siege/engine';
import type { GameId, LeaderboardEntry } from '@/lib/ranking/contract';
import type { GameResults } from '@/lib/ranking/rules';

/** 83_000 → "1:23" */
export const clock = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

interface Presenter<R> {
  /** Headline of a finished run: the score and a short qualifier. */
  summary(result: R): { score: number; meta: string };
  /** What a board row shows next to the score. */
  detail(entry: LeaderboardEntry): string;
}

/** How each game's results read on the shared ranking card. */
export const PRESENT: { [G in GameId]: Presenter<GameResults[G]> } = {
  volley: {
    summary: (r) => ({ score: r.points, meta: clock(r.durationMs) }),
    detail: (e) => clock(e.detail.durationMs ?? 0),
  },
  peek: {
    summary: (r) => ({ score: r.score, meta: rankFor(r.score).name }),
    detail: (e) => {
      const hs = e.detail.hits ? Math.round((100 * (e.detail.headshots ?? 0)) / e.detail.hits) : 0;
      return `${rankFor(e.score).name} · ${hs}% HS`;
    },
  },
};
