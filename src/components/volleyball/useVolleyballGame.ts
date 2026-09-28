'use client';

import { useCallback, useEffect, useRef, type RefObject } from 'react';
import type { GameStrings } from '@/i18n/types';
import { readPalette } from '@/lib/palette';
import { CPU_SPEED, TIMING, type CpuLevel } from './engine/constants';
import { createGame, primaryAction, stepGame } from './engine/physics';
import { renderGame, type View } from './engine/render';
import type { GameState, Input } from './engine/types';
import type { MatchResult } from './ranking/match';

export type GameKey = keyof Input;

const KEYMAP: Record<string, GameKey> = {
  ArrowLeft: 'left',
  a: 'left',
  A: 'left',
  ArrowRight: 'right',
  d: 'right',
  D: 'right',
  ArrowUp: 'jump',
  w: 'jump',
  W: 'jump',
  ' ': 'jump',
};

interface Options {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  stageRef: RefObject<HTMLElement | null>;
  panelRef: RefObject<HTMLElement | null>;
  strings: GameStrings;
  cpuLevel: CpuLevel;
  winScore: number;
  /** An overlay (leaderboard) is open: simulation paused, keys left to the page, no new match. */
  locked: boolean;
  /** A new match just kicked off. */
  onKickoff: () => void;
  /** The final whistle, with the scoreline and the engine's match clock. */
  onFinish: (result: MatchResult) => void;
}

/**
 * Owns the game loop for the lifetime of the mounted panel.
 *
 * - Fixed timestep (120 Hz) with an accumulator: identical physics on 60, 120
 *   or 144 Hz displays, and no tunnelling through the net on slow frames.
 * - Render at display rate; simulation pauses while the panel is off-screen.
 * - Game state and input live in refs: 60+ updates/s never touch React.
 * - Keyboard is only captured while the panel is on screen (or fullscreen),
 *   so arrows/space keep scrolling the page everywhere else.
 * - Kickoff and final whistle are reported to the caller (ranking tickets).
 */
export function useVolleyballGame({
  canvasRef,
  stageRef,
  panelRef,
  strings,
  cpuLevel,
  winScore,
  locked,
  onKickoff,
  onFinish,
}: Options) {
  const game = useRef<GameState | null>(null);
  const input = useRef<Input>({ left: false, right: false, jump: false });
  const stringsRef = useRef(strings);
  const lockedRef = useRef(locked);
  const events = useRef({ onKickoff, onFinish });

  useEffect(() => {
    stringsRef.current = strings; // language switch mid-match updates the canvas copy
  }, [strings]);

  useEffect(() => {
    lockedRef.current = locked;
    if (locked) Object.assign(input.current, { left: false, right: false, jump: false });
  }, [locked]);

  useEffect(() => {
    events.current = { onKickoff, onFinish };
  });

  /** Primary action, reporting a kickoff when it starts a match. */
  const kick = useCallback((g: GameState) => {
    const before = g.phase;
    primaryAction(g);
    if (g.phase !== before) events.current.onKickoff();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !stage || !ctx) return;

    const palette = readPalette();
    const g = createGame(CPU_SPEED[cpuLevel], winScore);
    game.current = g;
    const view: View = { w: 1, h: 1, dpr: 1 };

    const resize = () => {
      const r = stage.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(r.width * dpr));
      canvas.height = Math.max(1, Math.round(r.height * dpr));
      canvas.style.width = `${r.width}px`;
      canvas.style.height = `${r.height}px`;
      Object.assign(view, { w: r.width, h: r.height, dpr });
    };
    const ro = new ResizeObserver(resize);
    ro.observe(stage);
    resize();

    let visible = true;
    // One callback can batch several entries (e.g. the panel expanding while the page scrolls to it):
    // the last one is the current state. Reading the first froze the game on open, intermittently.
    const io = new IntersectionObserver((entries) => (visible = entries[entries.length - 1].isIntersecting));
    io.observe(stage);

    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min((now - last) / 1000, TIMING.MAX_FRAME);
      last = now;
      if (!visible) return;
      if (!lockedRef.current) acc += dt;
      const before = g.phase;
      while (acc >= TIMING.STEP) {
        stepGame(g, TIMING.STEP, input.current);
        acc -= TIMING.STEP;
      }
      if (before !== 'over' && g.phase === 'over') {
        events.current.onFinish({ player: g.score[0], cpu: g.score[1], durationMs: Math.round(g.matchTime) });
      }
      renderGame(ctx, g, view, palette, stringsRef.current);
    };
    raf = requestAnimationFrame(frame);

    const panelActive = () => {
      if (document.fullscreenElement) return true;
      const r = panelRef.current?.getBoundingClientRect();
      return !!r && r.bottom >= 80 && r.top <= window.innerHeight - 80;
    };
    const onKey = (down: boolean) => (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || lockedRef.current) return;
      const k = KEYMAP[e.key];
      if (!k || !panelActive()) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      e.preventDefault(); // no page scroll / button activation while playing
      input.current[k] = down;
      if (down && k === 'jump' && !e.repeat) kick(g);
    };
    const onKeyDown = onKey(true);
    const onKeyUp = onKey(false);
    // Releasing keys while the window is blurred would leave the player running.
    const onBlur = () => Object.assign(input.current, { left: false, right: false, jump: false });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      game.current = null;
    };
  }, [canvasRef, stageRef, panelRef, cpuLevel, winScore, kick]);

  const press = useCallback(
    (k: GameKey) => {
      if (lockedRef.current) return;
      input.current[k] = true;
      if (k === 'jump' && game.current) kick(game.current);
    },
    [kick],
  );
  const release = useCallback((k: GameKey) => {
    input.current[k] = false;
  }, []);
  const action = useCallback(() => {
    if (!lockedRef.current && game.current) kick(game.current);
  }, [kick]);
  /** "Play again" from the overlay: starts a match even though the overlay is still closing. */
  const restart = useCallback(() => {
    if (game.current) kick(game.current);
  }, [kick]);

  return { press, release, action, restart };
}
