'use client';

import { useEffect, useRef, useState, useSyncExternalStore, type MouseEvent, type PointerEvent } from 'react';
import { gameConfig } from '@/config/game';
import { CornersIn, CornersOut, Close, Trophy } from '@/components/ui/icons';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { htmlLang } from '@/i18n/config';
import { useI18n } from '@/i18n/I18nProvider';
import { RankingOverlay } from './RankingOverlay';
import { useRanking } from './useRanking';
import { useVolleyballGame, type GameKey } from './useVolleyballGame';
import styles from './VolleyballGame.module.css';

const noopSubscribe = () => () => {};

/**
 * The expanded game panel: toolbar (controls hint, leaderboard, fullscreen,
 * close), the canvas stage with the leaderboard overlay, and on-screen
 * buttons for touch devices.
 * Mounted only while open, so the game loop exists only while it's visible.
 */
export function VolleyballGame({ id, onClose }: { id: string; onClose: () => void }) {
  const { t, locale } = useI18n();
  const vb = t.volleyball;
  const panelRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isTouch = useMediaQuery('(pointer: coarse)');
  const [fullscreen, setFullscreen] = useState(false);
  // Element fullscreen isn't available everywhere (e.g. iPhone Safari): hide the button there.
  const canFullscreen = useSyncExternalStore(
    noopSubscribe,
    () => document.fullscreenEnabled,
    () => false,
  );

  const ranking = useRanking();
  const overlayOpen = ranking.view.kind !== 'closed';

  const { press, release, action, restart } = useVolleyballGame({
    canvasRef,
    stageRef,
    panelRef,
    strings: vb.game,
    cpuLevel: gameConfig.cpuLevel,
    winScore: gameConfig.winScore,
    locked: overlayOpen,
    onKickoff: ranking.kickoff,
    onFinish: ranking.finish,
  });

  // Overlay closed: keys go back to the game.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !overlayOpen) canvasRef.current?.focus({ preventScroll: true });
    wasOpen.current = overlayOpen;
  }, [overlayOpen]);

  useEffect(() => {
    const panel = panelRef.current;
    const onChange = () => setFullscreen(!!panel && document.fullscreenElement === panel);
    document.addEventListener('fullscreenchange', onChange);
    // Move focus into the game so keys go to it, not to the toggle button.
    canvasRef.current?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      if (panel && document.fullscreenElement === panel) void document.exitFullscreen();
    };
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void panelRef.current?.requestFullscreen?.();
  };

  const hold = (k: GameKey) => ({
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      press(k);
    },
    onPointerUp: () => release(k),
    onPointerCancel: () => release(k),
    onLostPointerCapture: () => release(k),
    onContextMenu: (e: MouseEvent) => e.preventDefault(),
  });

  return (
    <div
      id={id}
      ref={panelRef}
      className={`${styles.panel} ${overlayOpen ? styles.withOverlay : ''}`}
      data-no-cursor=""
    >
      <div className={styles.toolbar}>
        <span className={styles.controls}>{vb.controls}</span>
        <div className={styles.actions}>
          <button
            type="button"
            className={`btn btn-secondary ${styles.toolBtn}`}
            onClick={ranking.view.kind === 'board' ? ranking.close : ranking.openBoard}
            aria-pressed={ranking.view.kind === 'board'}
            // The name form holds an unsaved match: finish or skip it first.
            disabled={ranking.view.kind === 'form'}
          >
            <Trophy size={14} />
            {vb.ranking.button}
          </button>
          {canFullscreen && (
            <button type="button" className={`btn btn-secondary ${styles.toolBtn}`} onClick={toggleFullscreen}>
              {fullscreen ? <CornersIn size={14} /> : <CornersOut size={14} />}
              {fullscreen ? vb.exitFull : vb.full}
            </button>
          )}
          <button type="button" className="btn btn-secondary btn-icon" onClick={onClose} aria-label={vb.close}>
            <Close size={14} />
          </button>
        </div>
      </div>

      <div ref={stageRef} className={styles.stage}>
        <canvas
          ref={canvasRef}
          className={styles.canvas}
          tabIndex={0}
          role="img"
          aria-label={`${vb.canvasLabel}. ${vb.controls}`}
          onClick={action}
        />
        {ranking.view.kind !== 'closed' && (
          <RankingOverlay
            view={ranking.view}
            strings={vb.ranking}
            game={vb.game}
            lang={htmlLang[locale]}
            onSave={(name) => void ranking.save(name)}
            onEdit={ranking.clearError}
            onBoard={ranking.openBoard}
            onAgain={() => {
              ranking.close();
              restart();
            }}
            onClose={ranking.close}
          />
        )}
      </div>

      {isTouch && (
        <div className={styles.pad}>
          <div className={styles.dpad}>
            <button
              type="button"
              className={`btn btn-secondary ${styles.padBtn}`}
              aria-label={vb.left}
              {...hold('left')}
            >
              ◀
            </button>
            <button
              type="button"
              className={`btn btn-secondary ${styles.padBtn}`}
              aria-label={vb.right}
              {...hold('right')}
            >
              ▶
            </button>
          </div>
          <button type="button" className={`btn btn-primary ${styles.padBtn} ${styles.jump}`} {...hold('jump')}>
            {vb.jump}
          </button>
        </div>
      )}
    </div>
  );
}
