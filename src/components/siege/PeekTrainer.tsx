'use client';

import { useEffect, useRef } from 'react';
import type { TrainerStrings } from '@/i18n/types';
import { celebrate, originOf } from '@/lib/confetti';
import { readPalette } from '@/lib/palette';
import { createTrainer, rankFor, RANKS, shoot, startRound, update } from './engine';
import { renderTrainer, toField, type View } from './render';
import styles from './PeekTrainer.module.css';

const BEST_KEY = 'peek-trainer-best';

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
 * Diamond or better ends the round with confetti.
 */
export function PeekTrainer({ strings, label }: { strings: TrainerStrings; label: string }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stringsRef = useRef(strings);

  useEffect(() => {
    stringsRef.current = strings;
  }, [strings]);

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
      const p = local(e);
      if (e.pointerType === 'mouse') pointer = p;
      if (s.phase !== 'playing') startRound(s, performance.now());
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
      }
      wasPlaying = s.phase === 'playing';
      renderTrainer(ctx, s, view, palette, stringsRef.current, pointer, best);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('pointerdown', onDown);
    };
  }, []);

  return (
    <div ref={stageRef} className={styles.stage}>
      <canvas ref={canvasRef} className={styles.canvas} role="img" aria-label={label} />
    </div>
  );
}
