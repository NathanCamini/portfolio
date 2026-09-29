'use client';

import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react';
import { CornersIn, CornersOut, Close, Trophy } from '@/components/ui/icons';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { htmlLang } from '@/i18n/config';
import { useI18n } from '@/i18n/I18nProvider';
import { celebrate, originOf } from '@/lib/confetti';
import type { Mode, StageId } from './engine/stages';
import { OnlineVolley, type OnlineChrome } from './online/OnlineVolley';
import { saveCampaignStage, savedCampaignStage, savedMode, saveMode, type CampaignStage } from './progress';
import { RankingOverlay } from '@/components/ranking/RankingOverlay';
import { useRanking } from '@/components/ranking/useRanking';
import { TouchPad } from './TouchPad';
import { useVolleyballGame, type MatchEnd } from './useVolleyballGame';
import styles from './VolleyballGame.module.css';

const noopSubscribe = () => () => {};

/** The toolbar's tabs: the two local modes, and online 1v1 (docs/volei-online.md). */
type PanelMode = Mode | 'online';

/** The volleyball leaderboard (the generic hook's return type, pinned to this game). */
type Ranking = ReturnType<typeof useRanking<'volley'>>;

/**
 * The expanded game panel: toolbar (controls hint, campaign/Endless/online
 * switch, leaderboard, fullscreen, close) around either the local game
 * (LocalVolley) or the online room (OnlineVolley). Each owns its canvas and
 * loop, and only the visible one is mounted.
 * `joinCode` (from a room link) opens the online tab on that room.
 */
export function VolleyballGame({
  id,
  onClose,
  joinCode = null,
}: {
  id: string;
  onClose: () => void;
  joinCode?: string | null;
}) {
  const { t } = useI18n();
  const vb = t.volleyball;
  const panelRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  // Element fullscreen isn't available everywhere (e.g. iPhone Safari): hide the button there.
  const canFullscreen = useSyncExternalStore(
    noopSubscribe,
    () => document.fullscreenEnabled,
    () => false,
  );

  const ranking = useRanking('volley');

  // Campaign progress and the last local mode come back on the next visit (see progress.ts).
  const [mode, setMode] = useState<PanelMode>(() => (joinCode ? 'online' : savedMode()));
  const [campaign, setCampaign] = useState<CampaignStage>(savedCampaignStage);
  const [stage, setStage] = useState<StageId>(() => (mode === 'endless' ? 'endless' : campaign));
  const [online, setOnline] = useState<OnlineChrome>({ overlay: true, inMatch: false });

  const local = mode !== 'online';
  const overlayOpen = local ? ranking.view.kind !== 'closed' : online.overlay;

  const onStage = (next: StageId) => {
    setStage(next);
    if (next !== 'endless') {
      setCampaign(next);
      saveCampaignStage(next);
    }
  };

  const switchMode = (next: PanelMode) => {
    setMode(next);
    ranking.close();
    if (next === 'online') return;
    saveMode(next);
    setStage(next === 'endless' ? 'endless' : campaign);
  };

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
    <div
      id={id}
      ref={panelRef}
      className={`${styles.panel} ${overlayOpen ? styles.withOverlay : ''} ${local && stage === 'boss' ? styles.boss : ''}`}
      data-no-cursor=""
    >
      <div className={styles.toolbar}>
        <span className={styles.controls}>{vb.controls}</span>
        <div className={styles.actions}>
          <div className={`seg ${styles.modes}`} role="radiogroup" aria-label={vb.mode.label}>
            {(['campaign', 'endless', 'online'] as const).map((m) => (
              <label key={m} className="seg-opt">
                <input
                  type="radio"
                  name={`${id}-mode`}
                  value={m}
                  checked={mode === m}
                  onChange={() => switchMode(m)}
                  // The name form holds an unsaved run, and leaving an online match forfeits it.
                  disabled={ranking.view.kind === 'form' || online.inMatch}
                />
                {vb.mode[m]}
              </label>
            ))}
          </div>
          {local && (
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
          )}
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

      {local ? (
        // A new mode is a new game (that stage's title screen; a match in progress is dropped).
        <LocalVolley key={mode} panelRef={panelRef} initialStage={stage} ranking={ranking} onStage={onStage} />
      ) : (
        <OnlineVolley panelRef={panelRef} joinCode={joinCode} onChrome={setOnline} />
      )}
    </div>
  );
}

/** Campaign and Endless against the CPU: the canvas, the leaderboard overlay and the touch pad. */
function LocalVolley({
  panelRef,
  initialStage,
  ranking,
  onStage,
}: {
  panelRef: RefObject<HTMLDivElement | null>;
  initialStage: StageId;
  ranking: Ranking;
  onStage: (stage: StageId) => void;
}) {
  const { t, locale } = useI18n();
  const vb = t.volleyball;
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isTouch = useMediaQuery('(pointer: coarse)');
  const overlayOpen = ranking.view.kind !== 'closed';

  const onFinish = (end: MatchEnd) => {
    // Only Endless is ranked; campaign wins get confetti (a big burst for the boss).
    if (end.stage === 'endless') ranking.finish({ points: end.points, durationMs: end.durationMs });
    else if (end.won) void celebrate(originOf(canvasRef.current), end.stage === 'boss' ? 1.8 : 0.8);
  };

  const { press, release, action, restart } = useVolleyballGame({
    canvasRef,
    stageRef,
    panelRef,
    strings: vb.game,
    initialStage,
    locked: overlayOpen,
    onKickoff: (s) => s === 'endless' && ranking.kickoff(),
    onStage,
    onFinish,
  });

  // Move focus into the game so keys go to it, not to the toggle button.
  useEffect(() => {
    canvasRef.current?.focus({ preventScroll: true });
  }, []);

  // Overlay closed: keys go back to the game.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !overlayOpen) canvasRef.current?.focus({ preventScroll: true });
    wasOpen.current = overlayOpen;
  }, [overlayOpen]);

  return (
    <>
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

      {isTouch && <TouchPad labels={vb} press={press} release={release} />}
    </>
  );
}
