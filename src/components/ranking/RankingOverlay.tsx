'use client';

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { RankingStrings } from '@/i18n/types';
import { celebrate, originOf } from '@/lib/confetti';
import { GAMES, type GameId, type LeaderboardEntry } from '@/lib/ranking/contract';
import { NAME_MAX } from '@/lib/ranking/nickname';
import type { GameResults } from '@/lib/ranking/rules';
import { PRESENT } from './games';
import { rememberedName, type RankingView } from './useRanking';
import styles from './RankingOverlay.module.css';

interface Props<G extends GameId> {
  /** The game this card sits on (its runs, its "play again"). */
  game: G;
  view: Exclude<RankingView<GameResults[G]>, { kind: 'closed' }>;
  strings: RankingStrings;
  /** BCP 47 tag for number formatting (1.486 vs 1,486). */
  lang: string;
  onSave: (name: string) => void;
  onEdit: () => void;
  /** Show a game's board (the tabs, or "Ranking" after a run). */
  onBoard: (game: GameId) => void;
  onAgain: () => void;
  onClose: () => void;
}

/**
 * The global ranking card, shared by every game and laid over its canvas:
 * the name form when a run ends, the board after saving, or the boards on
 * their own (the game's Ranking button), with a tab per game. The game under
 * it is paused or locked while it's open.
 */
export function RankingOverlay<G extends GameId>({
  game,
  view,
  strings: R,
  lang,
  onSave,
  onEdit,
  onBoard,
  onAgain,
  onClose,
}: Props<G>) {
  const titleId = useId();
  const inputId = useId();
  const errorId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(rememberedName);
  const fmt = (n: number) => n.toLocaleString(lang);

  // Focus the first thing to act on, without scrolling the page.
  useEffect(() => {
    const target = inputRef.current ?? rootRef.current?.querySelector<HTMLElement>('[data-primary]');
    target?.focus({ preventScroll: true });
  }, [view.kind]);

  // A refused name comes back while the input is disabled (saving), which drops focus: give it back.
  const formError = view.kind === 'form' ? view.error : null;
  useEffect(() => {
    if (formError) inputRef.current?.focus({ preventScroll: true });
  }, [formError]);

  const saved = view.kind === 'saved' ? view.saved : null;
  useEffect(() => {
    if (saved?.personalBest && saved.position <= 3) void celebrate(originOf(rootRef.current), 1.2);
  }, [saved]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && !(view.kind === 'form' && view.busy)) {
      e.stopPropagation();
      onClose();
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSave(name);
  };

  const header = (result: GameResults[G]) => {
    const { score, meta } = PRESENT[game].summary(result);
    return (
      <header className={styles.result}>
        <p className={styles.kicker}>{R.games[game].runOver}</p>
        <p className={styles.scoreline}>
          {fmt(score)} <span className={styles.unit}>{R.points}</span>
          <span className={styles.meta}> · {meta}</span>
        </p>
      </header>
    );
  };

  const board = (which: GameId, top: LeaderboardEntry[], mine?: number) =>
    top.length === 0 ? (
      <p className={styles.note}>{R.empty}</p>
    ) : (
      <ol className={styles.board}>
        {top.map((e, i) => (
          <li key={`${i}-${e.name}`} className={i === mine ? styles.mine : undefined}>
            <span className={styles.rank}>{i + 1}</span>
            <span className={styles.name}>{e.name}</span>
            <span className={styles.line}>{PRESENT[which].detail(e)}</span>
            <span className={styles.score}>{fmt(e.score)}</span>
          </li>
        ))}
      </ol>
    );

  const boardTitle = (which: GameId) => (
    <div className={styles.boardHead}>
      <h3 id={titleId} className={styles.title}>
        {R.title}
      </h3>
      <p className={styles.sub}>{R.games[which].subtitle}</p>
    </div>
  );

  /** One ranking for every game: switch boards without leaving this one. */
  const tabs = (current: GameId) => (
    <div className={`seg ${styles.tabs}`} role="radiogroup" aria-label={R.title}>
      {GAMES.map((g) => (
        <label key={g} className="seg-opt">
          <input type="radio" name={`${titleId}-board`} value={g} checked={g === current} onChange={() => onBoard(g)} />
          {R.games[g].tab}
        </label>
      ))}
    </div>
  );

  let body;
  switch (view.kind) {
    case 'form':
      body = (
        <form onSubmit={submit} noValidate aria-labelledby={titleId}>
          <h3 id={titleId} className="sr-only">
            {R.title}
          </h3>
          {header(view.result)}
          <label htmlFor={inputId} className={styles.label}>
            {R.nameLabel}
          </label>
          <input
            ref={inputRef}
            id={inputId}
            className={styles.input}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              onEdit();
            }}
            placeholder={R.namePlaceholder}
            maxLength={NAME_MAX + 8}
            autoComplete="nickname"
            spellCheck={false}
            enterKeyHint="done"
            aria-invalid={view.error ? true : undefined}
            aria-describedby={view.error ? errorId : undefined}
            disabled={view.busy}
          />
          <p id={errorId} className={styles.error} role="alert">
            {view.error ? R.errors[view.error] : ''}
          </p>
          <div className={styles.actions}>
            <button type="submit" className="btn btn-primary btn-lg" disabled={view.busy}>
              {view.busy ? R.saving : R.save}
            </button>
            <button type="button" className="btn btn-secondary btn-lg" onClick={onClose} disabled={view.busy}>
              {R.skip}
            </button>
          </div>
          <p className={styles.help}>{R.games[game].scoreHelp}</p>
        </form>
      );
      break;

    case 'saved': {
      const { saved: s } = view;
      body = (
        <>
          {boardTitle(game)}
          <p className={styles.status} role="status">
            <strong>{s.personalBest ? R.newBest : R.keptBest.replace('{best}', fmt(s.best))}</strong>{' '}
            {R.position.replace('{n}', String(s.position))}
          </p>
          {board(game, s.top, s.position <= s.top.length ? s.position - 1 : undefined)}
          <div className={styles.actions}>
            <button type="button" className="btn btn-primary" data-primary="" onClick={onAgain}>
              {R.again}
            </button>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              {R.close}
            </button>
          </div>
        </>
      );
      break;
    }

    case 'final':
      body = (
        <>
          <h3 id={titleId} className="sr-only">
            {R.title}
          </h3>
          {header(view.result)}
          <p className={styles.note} role="status">
            {view.message === 'offline' ? R.offline : R.errors[view.message]}
          </p>
          <div className={styles.actions}>
            <button type="button" className="btn btn-primary" data-primary="" onClick={onAgain}>
              {R.again}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => onBoard(game)}>
              {R.button}
            </button>
          </div>
        </>
      );
      break;

    case 'board':
      body = (
        <>
          {boardTitle(view.game)}
          {tabs(view.game)}
          {view.top ? (
            board(view.game, view.top)
          ) : (
            <p className={styles.note} role="status">
              {view.error ? R.errors[view.error] : R.loading}
            </p>
          )}
          <div className={styles.actions}>
            <button type="button" className="btn btn-secondary" data-primary="" onClick={onClose}>
              {R.close}
            </button>
          </div>
        </>
      );
      break;
  }

  return (
    <div ref={rootRef} className={styles.overlay} role="dialog" aria-labelledby={titleId} onKeyDown={onKeyDown}>
      <div className={styles.card}>{body}</div>
    </div>
  );
}
