'use client';

import type { MouseEvent, PointerEvent } from 'react';
import type { GameKey } from './useVolleyballGame';
import styles from './VolleyballGame.module.css';

interface Props {
  labels: { left: string; right: string; jump: string };
  press: (k: GameKey) => void;
  release: (k: GameKey) => void;
}

/** On-screen buttons for touch devices, under the court (the local and the online game share them). */
export function TouchPad({ labels, press, release }: Props) {
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
    <div className={styles.pad}>
      <div className={styles.dpad}>
        <button
          type="button"
          className={`btn btn-secondary ${styles.padBtn}`}
          aria-label={labels.left}
          {...hold('left')}
        >
          ◀
        </button>
        <button
          type="button"
          className={`btn btn-secondary ${styles.padBtn}`}
          aria-label={labels.right}
          {...hold('right')}
        >
          ▶
        </button>
      </div>
      <button type="button" className={`btn btn-primary ${styles.padBtn} ${styles.jump}`} {...hold('jump')}>
        {labels.jump}
      </button>
    </div>
  );
}
