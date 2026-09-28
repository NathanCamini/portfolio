'use client';

import { useEffect, useRef, useState, useSyncExternalStore, type MouseEvent, type PointerEvent } from 'react';
import { CornersIn, CornersOut, Close, Trophy } from '@/components/ui/icons';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { htmlLang } from '@/i18n/config';
import { useI18n } from '@/i18n/I18nProvider';
import { celebrate, originOf } from '@/lib/confetti';
import type { Mode, StageId } from './engine/stages';
import { saveCampaignStage, savedCampaignStage, savedMode, saveMode, type CampaignStage } from './progress';
import { RankingOverlay } from '@/components/ranking/RankingOverlay';
import { useRanking } from '@/components/ranking/useRanking';
import { useVolleyballGame, type GameKey, type MatchEnd } from './useVolleyballGame';
import styles from './VolleyballGame.module.css';

const noopSubscribe = () => () => {};

/**
 * The expanded game panel: toolbar (controls hint, campaign/Endless switch,
 * leaderboard, fullscreen, close), the canvas stage with the leaderboard
 * overlay, and on-screen buttons for touch devices.
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

  const ranking = useRanking('volley');
  const overlayOpen = ranking.view.kind !== 'closed';

  // Campaign progress and the last mode come back on the next visit (see progress.ts).
  const [mode, setMode] = useState<Mode>(savedMode);
  const [campaign, setCampaign] = useState<CampaignStage>(savedCampaignStage);
  const [stage, setStage] = useState<StageId>(() => (mode === 'endless' ? 'endless' : campaign));

  const onStage = (next: StageId) => {
    setStage(next);
    if (next !== 'endless') {
      setCampaign(next);
      saveCampaignStage(next);
    }
  };
  const onFinish = (end: MatchEnd) => {
    // Only Endless is ranked; campaign wins get confetti (a big burst for the boss).
    if (end.stage === 'endless') ranking.finish({ points: end.points, durationMs: end.durationMs });
    else if (end.won) void celebrate(originOf(canvasRef.current), end.stage === 'boss' ? 1.8 : 0.8);
  };

  const { press, release, action, restart, selectStage } = useVolleyballGame({
    canvasRef,
    stageRef,
    panelRef,
    strings: vb.game,
    initialStage: stage,
    locked: overlayOpen,
    onKickoff: (s) => s === 'endless' && ranking.kickoff(),
    onStage,
    onFinish,
  });

  const switchMode = (next: Mode) => {
    const target = next === 'endless' ? 'endless' : campaign;
    setMode(next);
    saveMode(next);
    setStage(target);
    selectStage(target);
    ranking.close();
    canvasRef.current?.focus({ preventScroll: true });
  };

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
      className={`${styles.panel} ${overlayOpen ? styles.withOverlay : ''} ${stage === 'boss' ? styles.boss : ''}`}
      data-no-cursor=""
    >
      <div className={styles.toolbar}>
        <span className={styles.controls}>{vb.controls}</span>
        <div className={styles.actions}>
          <div className={`seg ${styles.modes}`} role="radiogroup" aria-label={vb.mode.label}>
            {(['campaign', 'endless'] as const).map((m) => (
              <label key={m} className="seg-opt">
                <input
                  type="radio"
                  name={`${id}-mode`}
                  value={m}
                  checked={mode === m}
                  onChange={() => switchMode(m)}
                  // The name form holds an unsaved run: finish or skip it first.
                  disabled={ranking.view.kind === 'form'}
                />
                {vb.mode[m]}
              </label>
            ))}
          </div>
          <button
            type="button"
            className={`btn btn-secondary ${styles.toolBtn}`}
            onClick={() => (ranking.view.kind === 'board' ? ranking.close() : void ranking.openBoard())}
            aria-pressed={ranking.view.kind === 'board'}
            // The name form holds an unsaved run: finish or skip it first.
            disabled={ranking.view.kind === 'form'}
          >
            <Trophy size={14} />
            {t.ranking.button}
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
            game="volley"
            view={ranking.view}
            strings={t.ranking}
            lang={htmlLang[locale]}
            onSave={(name) => void ranking.save(name)}
            onEdit={ranking.clearError}
            onBoard={(g) => void ranking.openBoard(g)}
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
