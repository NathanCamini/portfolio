'use client';

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { GameStrings, RankingStrings } from '@/i18n/types';
import { celebrate, originOf } from '@/lib/confetti';
import type { LeaderboardEntry, MatchResult } from './ranking/match';
import { NAME_MAX } from './ranking/nickname';
import { rememberedName, type RankingView } from './useRanking';
import styles from './RankingOverlay.module.css';

interface Props {
  view: Exclude<RankingView, { kind: 'closed' }>;
  strings: RankingStrings;
  game: GameStrings;
  /** BCP 47 tag for number formatting (1.486 vs 1,486). */
  lang: string;
  onSave: (name: string) => void;
  onEdit: () => void;
  onBoard: () => void;
  onAgain: () => void;
  onClose: () => void;
}

const clock = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * Layer over the court for the global leaderboard: the name form at the final
 * whistle, the board after saving, or the board on its own (toolbar button).
 * The game is paused and ignores the keyboard while this is open.
 */
export function RankingOverlay({ view, strings: R, game, lang, onSave, onEdit, onBoard, onAgain, onClose }: Props) {
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

  const header = (result: MatchResult, score: number) => (
    <header className={styles.result}>
      <p className={styles.kicker}>{result.player > result.cpu ? game.win : game.lose}</p>
      <p className={styles.scoreline}>
        <span aria-hidden="true">
          {result.player} × {result.cpu}
        </span>
        <span className="sr-only">{`${game.you} ${result.player} · ${game.cpu} ${result.cpu}`}</span>
        <span className={styles.meta}> · {clock(result.durationMs)}</span>
      </p>
      <p className={styles.points}>
        <strong>{fmt(score)}</strong> {R.points}
      </p>
    </header>
  );

  const board = (top: LeaderboardEntry[], mine?: number) =>
    top.length === 0 ? (
      <p className={styles.note}>{R.empty}</p>
    ) : (
      <ol className={styles.board}>
        {top.map((e, i) => (
          <li key={`${i}-${e.name}`} className={i === mine ? styles.mine : undefined}>
            <span className={styles.rank}>{i + 1}</span>
            <span className={styles.name}>{e.name}</span>
            <span className={styles.line}>
              {e.player}×{e.cpu}
            </span>
            <span className={styles.score}>{fmt(e.score)}</span>
          </li>
        ))}
      </ol>
    );

  const boardTitle = (
    <div className={styles.boardHead}>
      <h3 id={titleId} className={styles.title}>
        {R.title}
      </h3>
      <p className={styles.sub}>{R.subtitle}</p>
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
          {header(view.result, view.score)}
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
          <p className={styles.help}>{R.scoreHelp}</p>
        </form>
      );
      break;

    case 'saved': {
      const { saved: s } = view;
      body = (
        <>
          {boardTitle}
          <p className={styles.status} role="status">
            <strong>{s.personalBest ? R.newBest : R.keptBest.replace('{best}', fmt(s.best))}</strong>{' '}
            {R.position.replace('{n}', String(s.position))}
          </p>
          {board(s.top, s.position <= s.top.length ? s.position - 1 : undefined)}
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
          {header(view.result, view.score)}
          <p className={styles.note} role="status">
            {view.message === 'offline' ? R.offline : R.errors[view.message]}
          </p>
          <div className={styles.actions}>
            <button type="button" className="btn btn-primary" data-primary="" onClick={onAgain}>
              {R.again}
            </button>
            <button type="button" className="btn btn-secondary" onClick={onBoard}>
              {R.button}
            </button>
          </div>
        </>
      );
      break;

    case 'board':
      body = (
        <>
          {boardTitle}
          {view.top ? (
            board(view.top)
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
