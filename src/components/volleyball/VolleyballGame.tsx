'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { CornersIn, CornersOut, Close } from '@/components/ui/icons';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useI18n } from '@/i18n/I18nProvider';
import { celebrate, originOf } from '@/lib/confetti';
import type { StageId } from './engine/stages';
import { PlayOnline } from './PlayOnline';
import { saveCampaignStage, savedCampaignStage } from './progress';
import { TouchPad } from './TouchPad';
import { useVolleyballGame, type MatchEnd } from './useVolleyballGame';
import styles from './VolleyballGame.module.css';

const noopSubscribe = () => () => {};

/**
 * The expanded game panel: toolbar (controls hint, a link to the full game,
 * fullscreen, close) around the campaign against the CPU: phase 1 on the
 * beach, then the boss. Online 1×1, Endless and the rankings live in the full
 * game (NathanCamini/volleyball_game): the toolbar links there, and so does a
 * card once the boss match is over.
 */
export function VolleyballGame({ id, onClose }: { id: string; onClose: () => void }) {
  const { t } = useI18n();
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
  // Campaign progress comes back on the next visit (see progress.ts).
  const [stage, setStage] = useState<StageId>(savedCampaignStage);
  /** The boss match is over (won or lost): time to mention the full game. */
  const [more, setMore] = useState(false);

  const onStage = (next: StageId) => {
    setStage(next);
    saveCampaignStage(next);
  };

  const onFinish = (end: MatchEnd) => {
    // Campaign wins get confetti (a big burst for the boss).
    if (end.won) void celebrate(originOf(canvasRef.current), end.stage === 'boss' ? 1.8 : 0.8);
    if (end.stage === 'boss') setMore(true);
  };

  const { press, release, action } = useVolleyballGame({
    canvasRef,
    stageRef,
    panelRef,
    strings: vb.game,
    initialStage: stage,
    onStage,
    onFinish,
  });

  // Move focus into the game so keys go to it, not to the toggle button.
  useEffect(() => {
    canvasRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const panel = panelRef.current;
    const onChange = () => setFullscreen(!!panel && document.fullscreenElement === panel);
    document.addEventListener('fullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      if (panel && document.fullscreenElement === panel) void document.exitFullscreen();
    };
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void panelRef.current?.requestFullscreen?.();
  };

  return (
    <div id={id} ref={panelRef} className={`${styles.panel} ${stage === 'boss' ? styles.boss : ''}`} data-no-cursor="">
      <div className={styles.toolbar}>
        <span className={styles.controls}>{vb.controls}</span>
        <div className={styles.actions}>
          <PlayOnline className={`btn btn-secondary ${styles.toolBtn}`}>{vb.online}</PlayOnline>
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
          onClick={() => {
            setMore(false);
            action();
          }}
        />
        {more && (
          <div className={styles.more} role="status">
            <p>{vb.more}</p>
            <PlayOnline className={`btn btn-primary ${styles.toolBtn}`}>{vb.moreCta}</PlayOnline>
          </div>
        )}
      </div>

      {isTouch && (
        <TouchPad
          labels={vb}
          press={(k) => {
            if (k === 'jump') setMore(false);
            press(k);
          }}
          release={release}
        />
      )}
    </div>
  );
}
