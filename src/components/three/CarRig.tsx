'use client';

import { useEffect, useState, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { MotionValue } from 'motion/react';
import type { PerspectiveCamera } from 'three';
import { CarRigController } from './CarRigController';
import type { PaintFinish } from './porsche911';
import type { RotationState } from './rotation';

interface CarRigProps {
  /** 0 → 1 progress through the tall car section (Motion's useScroll). */
  progress: MotionValue<number>;
  rotation: RefObject<RotationState>;
  color: string;
  finish: PaintFinish;
  /** Optional <code> element that shows live telemetry, written directly (no re-render). */
  readoutRef?: RefObject<HTMLElement | null>;
}

/**
 * React ↔ Three.js bridge for the car. React owns the lifecycle; the per-frame
 * work (scroll trajectory vs. pointer rotation) lives in CarRigController.
 *
 * Nothing here is React state: scroll comes from a Motion value and rotation
 * from a ref, both read inside useFrame — scrolling or dragging causes zero
 * React renders, and a parked car renders zero frames.
 */
export function CarRig({ progress, rotation, color, finish, readoutRef }: CarRigProps) {
  // Built once; paint changes are applied in place (no geometry rebuild).
  const [rig] = useState(() => new CarRigController(color, finish));

  useEffect(() => () => rig.dispose(), [rig]);
  useEffect(() => rig.setPaint(color, finish), [rig, color, finish]);

  // On-demand rendering: a scroll change requests a frame; the rig keeps
  // requesting more only while it is still settling (see CarRigController.update).
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => progress.on('change', () => invalidate()), [progress, invalidate]);

  useFrame((state, delta) => {
    const settling = rig.update({
      delta,
      progress: progress.get(),
      camera: state.camera as PerspectiveCamera,
      rotation: rotation.current,
      readout: readoutRef?.current,
    });
    if (settling) state.invalidate();
  });

  return <primitive object={rig.track} />;
}
