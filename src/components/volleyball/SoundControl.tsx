'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useI18n } from '@/i18n/I18nProvider';
import { installAudio } from '@/lib/audio/engine';
import { setSound, useSound } from '@/lib/audio/settings';
import styles from './SoundControl.module.css';

/**
 * The sound control in the game panel's toolbar: a speaker button that opens
 * two sliders, one for the effects and one for the music, each saved in the
 * browser. It also switches the audio on (lib/audio/engine.ts), which then
 * starts on the first click anywhere on the page.
 */
export function SoundControl() {
  const { t } = useI18n();
  const k = t.volleyball.sound;
  const sound = useSound();
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => installAudio(), []);

  // Esc or a click outside closes it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onPointer = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  const silent = sound.effects === 0 && sound.music === 0;
  const icon = silent ? '🔇' : sound.effects + sound.music < 0.6 ? '🔉' : '🔊';

  return (
    <div ref={boxRef} className={styles.box}>
      <button
        type="button"
        className={`btn btn-secondary btn-icon ${styles.button}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={k.button}
        title={k.button}
      >
        <span aria-hidden="true">{icon}</span>
      </button>
      {open && (
        <div id={panelId} className={styles.panel} role="group" aria-label={k.title}>
          {(['effects', 'music'] as const).map((which) => (
            <label key={which} className={styles.row}>
              <span className={styles.label}>
                <span aria-hidden="true">{which === 'effects' ? '🔔' : '🎵'}</span> {k[which]}
              </span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={Math.round(sound[which] * 100)}
                onChange={(e) => setSound({ [which]: Number(e.target.value) / 100 })}
                aria-valuetext={sound[which] === 0 ? k.off : `${Math.round(sound[which] * 100)}%`}
              />
              <span className={styles.value}>{sound[which] === 0 ? k.off : `${Math.round(sound[which] * 100)}%`}</span>
            </label>
          ))}
          <p className={styles.hint}>{k.hint}</p>
        </div>
      )}
    </div>
  );
}
