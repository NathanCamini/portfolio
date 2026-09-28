'use client';

import { useCallback, useMemo, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { invalidate } from '@react-three/fiber';
import { PITCH_MAX, PITCH_MIN, REST_PITCH, REST_YAW, type RotationState } from './rotation';

/**
 * Pointer/keyboard → rotation intent. The values live in a ref (not React
 * state): pointer events can fire hundreds of times per second, and the only
 * consumer is the render loop (useFrame), which reads the ref. Each change
 * requests a frame with `invalidate()`, since the canvas renders on demand.
 */
export function useDragRotation() {
  const state = useRef<RotationState>({ yaw: REST_YAW, pitch: REST_PITCH, velocity: 0, dragging: false });
  const last = useRef({ x: 0, y: 0 });

  const reset = useCallback(() => {
    Object.assign(state.current, { yaw: REST_YAW, pitch: REST_PITCH, velocity: 0 });
    invalidate();
  }, []);

  const bind = useMemo(
    () => ({
      onPointerDown(e: PointerEvent<HTMLElement>) {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        state.current.dragging = true;
        state.current.velocity = 0;
        last.current = { x: e.clientX, y: e.clientY };
        // Keep receiving moves even if the pointer leaves the canvas mid-drag.
        e.currentTarget.setPointerCapture(e.pointerId);
        e.currentTarget.style.cursor = 'grabbing';
      },
      onPointerMove(e: PointerEvent<HTMLElement>) {
        const s = state.current;
        if (!s.dragging) return;
        const dx = e.clientX - last.current.x;
        const dy = e.clientY - last.current.y;
        last.current = { x: e.clientX, y: e.clientY };
        s.yaw += dx * 0.01;
        s.velocity = dx * 0.004;
        s.pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, s.pitch + dy * 0.005));
        invalidate();
      },
      onPointerUp(e: PointerEvent<HTMLElement>) {
        state.current.dragging = false;
        e.currentTarget.style.cursor = '';
        invalidate(); // release inertia keeps it spinning for a moment
      },
      // Touch: `touch-action: pan-y` lets vertical swipes scroll the page — the
      // browser then cancels our pointer, and the car just keeps its rotation.
      onPointerCancel(e: PointerEvent<HTMLElement>) {
        state.current.dragging = false;
        e.currentTarget.style.cursor = '';
      },
      onDoubleClick: reset,
      // Keyboard access: arrows rotate, Home/0 resets.
      onKeyDown(e: KeyboardEvent<HTMLElement>) {
        const s = state.current;
        const step = { ArrowLeft: -0.25, ArrowRight: 0.25 }[e.key as 'ArrowLeft' | 'ArrowRight'];
        if (step !== undefined) s.yaw += step;
        else if (e.key === 'ArrowUp') s.pitch = Math.min(PITCH_MAX, s.pitch + 0.1);
        else if (e.key === 'ArrowDown') s.pitch = Math.max(PITCH_MIN, s.pitch - 0.1);
        else if (e.key === 'Home' || e.key === '0') reset();
        else return;
        e.preventDefault();
        invalidate();
      },
    }),
    [reset],
  );

  return { state, bind, reset };
}
