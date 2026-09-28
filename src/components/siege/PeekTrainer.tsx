'use client';

import { useEffect, useRef, useState } from 'react';
import { RankingOverlay } from '@/components/ranking/RankingOverlay';
import { useRanking } from '@/components/ranking/useRanking';
import { Trophy } from '@/components/ui/icons';
import { htmlLang } from '@/i18n/config';
import { useI18n } from '@/i18n/I18nProvider';
import type { TrainerStrings } from '@/i18n/types';
import { celebrate, originOf } from '@/lib/confetti';
import { readPalette } from '@/lib/palette';
import type { PeekResult } from '@/lib/ranking/rules';
import { createTrainer, rankFor, RANKS, shoot, startRound, update } from './engine';
import { renderTrainer, toField, type View } from './render';
import styles from './PeekTrainer.module.css';

const BEST_KEY = 'peek-trainer-best';
/** Time to take in the rank badge before the ranking card slides in. */
const CARD_DELAY_MS = 1200;

function readBest() {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

/**
 * Canvas host for the Siege-style aim trainer: owns the rAF loop (paused while
 * off-screen), pointer input and the personal best (localStorage, optional).
 * Diamond or better ends the round with confetti. Every round goes to the
 * shared global ranking: a ticket at the first shot, the name card after the
 * rank badge.
 */
export function PeekTrainer({ strings, label }: { strings: TrainerStrings; label: string }) {
  const { t, locale } = useI18n();
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stringsRef = useRef(strings);
  const ranking = useRanking('peek');
  const overlayOpen = ranking.view.kind !== 'closed';
  const [playing, setPlaying] = useState(false);

  const lockedRef = useRef(false);
  const events = useRef<{ onStart: () => void; onEnd: (result: PeekResult) => void }>({
    onStart: () => {},
    onEnd: () => {},
  });
  const restartRef = useRef(() => {});

  useEffect(() => {
    stringsRef.current = strings;
  }, [strings]);

  useEffect(() => {
    lockedRef.current = overlayOpen;
  }, [overlayOpen]);

  useEffect(() => {
    events.current = {
      onStart: () => {
        setPlaying(true);
        ranking.kickoff();
      },
      onEnd: (result) => {
        setPlaying(false);
        ranking.finish(result);
      },
    };
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !stage || !ctx) return;

    const palette = readPalette();
    const s = createTrainer();
    const view: View = { w: 1, h: 1, dpr: 1 };
    let best = readBest();
    let pointer: { x: number; y: number } | null = null;
    let cardTimer = 0;

    const begin = () => {
      startRound(s, performance.now());
      events.current.onStart();
    };
    restartRef.current = begin;

    const resize = () => {
      const r = stage.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(r.width * dpr));
      canvas.height = Math.max(1, Math.round(r.height * dpr));
      Object.assign(view, { w: r.width, h: r.height, dpr });
    };
    const ro = new ResizeObserver(resize);
    ro.observe(stage);
    resize();

    let visible = false;
    // Several entries can arrive in one callback: the last one is the current state.
    const io = new IntersectionObserver((entries) => (visible = entries[entries.length - 1].isIntersecting));
    io.observe(stage);

    const local = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return toField(view, e.clientX - r.left, e.clientY - r.top);
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') pointer = local(e);
    };
    const onLeave = () => (pointer = null);
    const onDown = (e: PointerEvent) => {
      e.preventDefault();
      // The round just ended (rank badge showing) or the ranking card is up: no new round yet.
      if (lockedRef.current || cardTimer) return;
      const p = local(e);
      if (e.pointerType === 'mouse') pointer = p;
      if (s.phase !== 'playing') begin();
      else shoot(s, p.x, p.y);
    };
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('pointerdown', onDown);

    let raf = 0;
    let wasPlaying = false;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!visible) return;
      update(s, now);
      if (wasPlaying && s.phase === 'over') {
        if (s.score > best) {
          best = s.score;
          try {
            localStorage.setItem(BEST_KEY, String(best));
          } catch {
            /* private mode: keep it for this session only */
          }
        }
        if (rankFor(s.score).min >= RANKS[6].min) celebrate(originOf(canvas), 1.4);
        const result: PeekResult = {
          score: s.score,
          shots: s.shots,
          hits: s.hits,
          headshots: s.headshots,
          bestStreak: s.bestStreak,
        };
        cardTimer = window.setTimeout(() => {
          cardTimer = 0;
          events.current.onEnd(result);
        }, CARD_DELAY_MS);
      }
      wasPlaying = s.phase === 'playing';
      renderTrainer(ctx, s, view, palette, stringsRef.current, pointer, best);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(cardTimer);
      ro.disconnect();
      io.disconnect();
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('pointerdown', onDown);
    };
  }, []);

  return (
    <div>
      <div ref={stageRef} className={`${styles.stage} ${overlayOpen ? styles.withOverlay : ''}`}>
        <canvas ref={canvasRef} className={styles.canvas} role="img" aria-label={label} />
        {ranking.view.kind !== 'closed' && (
          <RankingOverlay
            game="peek"
            view={ranking.view}
            strings={t.ranking}
            lang={htmlLang[locale]}
            onSave={(name) => void ranking.save(name)}
            onEdit={ranking.clearError}
            onBoard={(g) => void ranking.openBoard(g)}
            onAgain={() => {
              ranking.close();
              restartRef.current();
            }}
            onClose={ranking.close}
          />
        )}
      </div>
      <div className={styles.bar}>
        <button
          type="button"
          className={`btn btn-secondary ${styles.rankingBtn}`}
          onClick={() => (ranking.view.kind === 'board' ? ranking.close() : void ranking.openBoard())}
          aria-pressed={ranking.view.kind === 'board'}
          // Mid-round, or with an unsaved round in the name form: finish that first.
          disabled={playing || ranking.view.kind === 'form'}
        >
          <Trophy size={14} />
          {t.ranking.button}
        </button>
      </div>
    </div>
  );
}
