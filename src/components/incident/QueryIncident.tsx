'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useI18n } from '@/i18n/I18nProvider';
import { EXECUTE_QUERY } from '@/lib/incident';
import { buildScript, compile, frameAt, type Timeline } from './script';
import { collectRows, lockScroll, rowLabel, Stage } from './stage';
import styles from './QueryIncident.module.css';

interface Run {
  timeline: Timeline;
  rows: HTMLElement[];
  reduce: boolean;
}

/** On Esc / "skip": everything is restored and the finished session stays up this long. */
const SKIP_HOLD = 900;

/**
 * Easter egg: the hero's `DELETE * from USERS; WHERE …` sticker actually runs.
 *
 * 1. crash — every block of the page glitches away and the screen switches off like a CRT;
 * 2. terminal — a psql session in the middle of the empty page replays the query and its
 *    errors, then types `ROLLBACK;`: each restore line brings one block back, glitching in;
 * 3. closing — the terminal leaves and the page is exactly as it was (same scroll, same
 *    state: nothing is unmounted, blocks are only hidden).
 *
 * The session is a pure timeline (script.ts); this component just runs a clock over it.
 */
export function QueryIncident() {
  const { t } = useI18n();
  const copy = t.incident;
  const [run, setRun] = useState<Run | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const start = useRef(0);
  const stage = useRef<Stage | null>(null);
  const body = useRef<HTMLDivElement>(null);

  // The sticker fires the event; clicks while an incident is running are ignored.
  useEffect(() => {
    const onExecute = () => {
      const rows = collectRows();
      if (!rows.length) return;
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const timeline = compile(
        buildScript(copy, rows.map(rowLabel)),
        reduce ? { openAt: 350, hold: 2200, closeMs: 300, instant: true } : { openAt: 1450, hold: 2200, closeMs: 450 },
      );
      setRun((current) => current ?? { timeline, rows, reduce });
    };
    window.addEventListener(EXECUTE_QUERY, onExecute);
    return () => window.removeEventListener(EXECUTE_QUERY, onExecute);
  }, [copy]);

  // Wipe the page and start the clock; everything on screen is derived from `elapsed`.
  useEffect(() => {
    if (!run) return;
    stage.current = new Stage(run.rows, run.reduce);
    const unlock = lockScroll();
    start.current = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = now - start.current;
      setElapsed(t);
      if (t >= run.timeline.total) setRun(null);
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      unlock();
      stage.current?.dispose();
      stage.current = null;
      setElapsed(0);
    };
  }, [run]);

  // Esc (or the button) jumps ahead: every row back, session finished; a second press closes it.
  const skip = useCallback(() => {
    if (!run) return;
    const now = performance.now();
    const { closeAt, total } = run.timeline;
    const target = now - start.current < closeAt - SKIP_HOLD ? closeAt - SKIP_HOLD : total;
    start.current = now - target;
  }, [run]);

  // The incident is modal: Esc skips, and no other shortcut (the terminal's ' / ~, game keys…)
  // reaches the page. Captured at window, before anyone else; default actions still run,
  // so Tab and Enter keep working on the skip button.
  useEffect(() => {
    if (!run) return;
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Escape') skip();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [run, skip]);

  const frame = run ? frameAt(run.timeline, elapsed) : null;
  const restored = frame?.restored ?? 0;

  useEffect(() => {
    stage.current?.restoreUpTo(restored);
  }, [restored]);

  // Keep the newest line in view, like a real terminal.
  useLayoutEffect(() => {
    const el = body.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [elapsed]);

  return (
    <>
      {/* Mounted all the time so screen readers pick up the change; the terminal itself is decorative. */}
      <p className="sr-only" role="status">
        {run ? copy.announce : ''}
      </p>

      {run && frame && (
        <div className={styles.overlay}>
          {!run.reduce && frame.phase === 'crash' && (
            <div aria-hidden="true">
              <div className={styles.noise} />
              <div className={styles.crt} />
            </div>
          )}

          <AnimatePresence>
            {frame.phase === 'terminal' && (
              <motion.div
                key="terminal"
                className={styles.terminal}
                initial={{ opacity: 0, scale: 0.92, filter: 'blur(8px)' }}
                animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                exit={{ opacity: 0, scale: 0.96, y: 16, filter: 'blur(6px)' }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              >
                <div className={styles.bar} aria-hidden="true">
                  <span className={`${styles.dot} ${styles.red}`} />
                  <span className={`${styles.dot} ${styles.yellow}`} />
                  <span className={`${styles.dot} ${styles.green}`} />
                  <span className={styles.title}>nathan@prod — psql portfolio</span>
                </div>

                <div ref={body} className={styles.body} aria-hidden="true">
                  {frame.lines.map((line) => (
                    <div key={line.key} className={`${styles.line} ${styles[line.tone] ?? ''}`}>
                      {line.prompt && <span className={styles.prompt}>{line.prompt}</span>}
                      {line.text}
                      {line.suffix && <span className={styles[line.suffix.tone]}>{line.suffix.text}</span>}
                      {line.cursor && <span className={styles.cursor} />}
                    </div>
                  ))}
                </div>

                <div className={styles.foot}>
                  <span className={restored === run.rows.length ? styles.ok : styles.error} aria-hidden="true">
                    rows: {restored}/{run.rows.length}
                  </span>
                  <button type="button" className={styles.skip} onClick={skip}>
                    <kbd>Esc</kbd> {copy.skip}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </>
  );
}
