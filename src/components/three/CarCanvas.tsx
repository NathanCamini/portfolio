'use client';

import { Component, useEffect, useMemo, type ReactNode, type RefObject } from 'react';
import { Canvas, invalidate, useThree } from '@react-three/fiber';
import type { MotionValue } from 'motion/react';
import {
  ACESFilmicToneMapping,
  BoxGeometry,
  MeshBasicMaterial,
  PMREMGenerator,
  type Scene,
  type WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { readPalette } from '@/lib/palette';
import { CarRig } from './CarRig';
import type { PaintFinish } from './porsche911';
import { useDragRotation } from './useDragRotation';

export interface CarCanvasProps {
  progress: MotionValue<number>;
  /** Render loop runs only while the section is on screen. */
  active: boolean;
  color: string;
  finish: PaintFinish;
  label: string;
  readoutRef?: RefObject<HTMLElement | null>;
  onReady?: () => void;
  onError?: () => void;
}

/**
 * The WebGL layer of the car section. Loaded with next/dynamic (ssr: false)
 * only when the section approaches the viewport, so Three.js never touches the
 * initial bundle.
 *
 * Rendering is on demand — a parked car costs zero GPU time.
 *
 * No shadows by design: no shadow maps, no shadow-catcher ground plane, and no
 * light casts shadows — the car sits on the road lines alone.
 */
export default function CarCanvas({
  progress,
  active,
  color,
  finish,
  label,
  readoutRef,
  onReady,
  onError,
}: CarCanvasProps) {
  const { state: rotation, bind } = useDragRotation();

  // Coming back on screen: draw once so the frame reflects the current scroll position.
  useEffect(() => {
    if (active) invalidate();
  }, [active]);

  return (
    <CanvasErrorBoundary onError={onError}>
      <div
        {...bind}
        role="application"
        aria-label={label}
        tabIndex={0}
        style={{ position: 'absolute', inset: 0, cursor: 'grab', touchAction: 'pan-y' }}
      >
        <Canvas
          dpr={[1, 2]}
          // 'demand': frames are drawn only when scroll/drag changes something (see CarRig).
          frameloop={active ? 'demand' : 'never'}
          camera={{ fov: 30, near: 0.1, far: 100, position: [0, 2.6, 13] }}
          gl={{ antialias: true, alpha: true, toneMapping: ACESFilmicToneMapping, powerPreference: 'high-performance' }}
          shadows={false}
          // Final framing (incl. the responsive dolly) is handled by CarRigController.
          onCreated={() => onReady?.()}
        >
          <Studio />
          <Road />
          <CarRig progress={progress} rotation={rotation} color={color} finish={finish} readoutRef={readoutRef} />
        </Canvas>
      </div>
    </CanvasErrorBoundary>
  );
}

/**
 * Generates a studio environment map on the GPU (RoomEnvironment → PMREM):
 * reflections for the clear-coat paint and glass without downloading an HDR.
 * Returns the cleanup function.
 */
function applyStudioEnvironment(gl: WebGLRenderer, scene: Scene) {
  const pmrem = new PMREMGenerator(gl);
  const room = new RoomEnvironment();
  const env = pmrem.fromScene(room, 0.04).texture;
  scene.environment = env;
  scene.environmentIntensity = 1.1;
  return () => {
    scene.environment = null;
    env.dispose();
    room.dispose();
    pmrem.dispose();
  };
}

/** Lights + environment. */
function Studio() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const C = useMemo(() => readPalette(), []);

  useEffect(() => applyStudioEnvironment(gl, scene), [gl, scene]);

  return (
    <>
      <hemisphereLight args={[C.n200, C.bg, 0.3]} />
      {/* Key light — castShadow intentionally off. */}
      <directionalLight color={C.n100} intensity={1.2} position={[4, 9, 6]} />
      {/* Accent rim light from behind, in the design system's blurple. */}
      <pointLight color={C.accent} intensity={40} distance={14} position={[-3, 3, -3]} />
    </>
  );
}

/** Dashed centre line + solid edge line, as in the design. */
function Road() {
  const { dash, edge, material, xs } = useMemo(() => {
    const material = new MeshBasicMaterial({ color: readPalette().n700 });
    const xs: number[] = [];
    for (let x = -30; x <= 30; x += 1.8) xs.push(x);
    return { dash: new BoxGeometry(0.9, 0.004, 0.07), edge: new BoxGeometry(60, 0.004, 0.04), material, xs };
  }, []);

  useEffect(
    () => () => {
      dash.dispose();
      edge.dispose();
      material.dispose();
    },
    [dash, edge, material],
  );

  return (
    <group>
      {xs.map((x) => (
        <mesh key={x} geometry={dash} material={material} position={[x, 0.002, 1.7]} />
      ))}
      <mesh geometry={edge} material={material} position={[0, 0.002, -1.6]} />
    </group>
  );
}

/** WebGL can fail (blocklisted GPU, disabled hardware acceleration): degrade to the text overlay. */
class CanvasErrorBoundary extends Component<{ children: ReactNode; onError?: () => void }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.warn('[CarCanvas] WebGL unavailable:', error);
    this.props.onError?.();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
